#!/bin/bash
set -euo pipefail

# QCut Self-Hosted GitHub Actions Runner Setup
#
# Registers this Mac as a GitHub Actions self-hosted runner for QCut releases.
# The runner executes macOS builds locally instead of on GitHub-hosted runners,
# eliminating the 10x minute multiplier cost.
#
# Prerequisites:
#   - macOS on Apple Silicon (ARM64)
#   - Admin access (sudo)
#   - GitHub repo access (you'll need a registration token)
#
# Usage:
#   chmod +x scripts/setup-self-hosted-runner.sh
#   ./scripts/setup-self-hosted-runner.sh
#
# After setup:
#   1. Set repo variable USE_SELF_HOSTED_MAC=true
#      GitHub repo > Settings > Secrets and variables > Actions > Variables
#   2. Push a tag (v*) to trigger a release build on the self-hosted runner

REPO="Quriosity-agent/qcut"
RUNNER_DIR="$HOME/actions-runner"
RUNNER_VERSION="2.321.0"

echo "=== QCut Self-Hosted Runner Setup ==="
echo ""

# --- Prerequisites ---

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "arm64" ]; then
	echo "ERROR: Expected ARM64 (Apple Silicon), got $ARCH"
	exit 1
fi
echo "[ok] Architecture: $ARCH"

# Check/install Bun
if ! command -v bun &>/dev/null; then
	echo "[install] Bun not found, installing..."
	curl -fsSL https://bun.sh/install | bash
	export BUN_INSTALL="$HOME/.bun"
	export PATH="$BUN_INSTALL/bin:$PATH"
else
	echo "[ok] Bun: $(bun --version)"
fi

# Check/install Node.js
if ! command -v node &>/dev/null; then
	echo "[install] Node.js not found, installing via Homebrew..."
	if ! command -v brew &>/dev/null; then
		echo "ERROR: Homebrew not found. Install from https://brew.sh"
		exit 1
	fi
	brew install node
else
	echo "[ok] Node: $(node --version)"
fi

# Check git
if ! command -v git &>/dev/null; then
	echo "ERROR: git not found"
	exit 1
fi
echo "[ok] Git: $(git --version | head -1)"

# Check gh CLI
if ! command -v gh &>/dev/null; then
	echo "[warn] GitHub CLI (gh) not found — optional but recommended"
	echo "       Install: brew install gh"
else
	echo "[ok] GitHub CLI: $(gh --version | head -1)"
fi

echo ""

# --- Download Runner ---

if [ -d "$RUNNER_DIR" ] && [ -f "$RUNNER_DIR/config.sh" ]; then
	echo "Runner directory already exists at $RUNNER_DIR"
	read -p "Re-configure existing runner? (y/N) " RECONFIG
	if [ "$RECONFIG" != "y" ] && [ "$RECONFIG" != "Y" ]; then
		echo "Exiting. Use 'sudo $RUNNER_DIR/svc.sh status' to check the runner."
		exit 0
	fi
else
	echo "Downloading GitHub Actions runner v${RUNNER_VERSION}..."
	mkdir -p "$RUNNER_DIR"
	cd "$RUNNER_DIR"
	curl -o actions-runner-osx-arm64.tar.gz -L \
		"https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz"
	tar xzf actions-runner-osx-arm64.tar.gz
	rm -f actions-runner-osx-arm64.tar.gz
fi

cd "$RUNNER_DIR"

# --- Configure ---

echo ""
echo "Get a registration token from:"
echo "  https://github.com/${REPO}/settings/actions/runners/new?arch=arm64&os=osx"
echo ""
read -p "Paste the registration token: " TOKEN

if [ -z "$TOKEN" ]; then
	echo "ERROR: Token cannot be empty"
	exit 1
fi

./config.sh \
	--url "https://github.com/${REPO}" \
	--token "$TOKEN" \
	--name "qcut-mac-$(hostname -s)" \
	--labels "self-hosted,macOS,ARM64" \
	--work "_work" \
	--replace

# --- Environment for launchd ---
# launchd services don't source shell profiles, so Bun/Node may not be on PATH.
# The runner loads .env from its directory at startup.

BUN_PATH="${BUN_INSTALL:-$HOME/.bun}/bin"
NODE_PATH="$(dirname "$(which node)")"

cat >"$RUNNER_DIR/.env" <<EOF
PATH=${BUN_PATH}:${NODE_PATH}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
EOF

echo ""
echo "Created $RUNNER_DIR/.env with PATH for Bun and Node"

# --- Install as service ---

echo ""
echo "Installing as launchd service (requires sudo)..."
sudo ./svc.sh install
sudo ./svc.sh start

echo ""
echo "Checking status..."
sudo ./svc.sh status

echo ""
echo "=== Setup complete ==="
echo ""
echo "The runner is registered and running as a launchd service."
echo "It will start automatically on boot."
echo ""
echo "Next steps:"
echo "  1. Go to: https://github.com/${REPO}/settings/variables/actions"
echo "  2. Add variable: USE_SELF_HOSTED_MAC = true"
echo "  3. Push a tag to test the build"
echo ""
echo "Management:"
echo "  sudo $RUNNER_DIR/svc.sh status    # Check status"
echo "  sudo $RUNNER_DIR/svc.sh stop      # Stop runner"
echo "  sudo $RUNNER_DIR/svc.sh start     # Start runner"
echo "  sudo $RUNNER_DIR/svc.sh uninstall # Remove service"
