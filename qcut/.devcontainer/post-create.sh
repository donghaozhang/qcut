#!/usr/bin/env bash
#
# Runs once after the Daytona/VS Code dev-container is created. By
# design we do NOT auto-fetch agent_secrets here — the dev session
# expects the user to bring their own ~/.qcut/.env. This keeps the
# image / devcontainer config free of any secret-injection logic that
# could be mis-wired into the Spawn API path.

set -euo pipefail

if [[ ! -f "${HOME}/.qcut/.env" ]]; then
	cat <<'EOF'

ℹ no ~/.qcut/.env found in this Daytona session.

  To populate, run either:
    qcut system set-key <provider> <value>
  or paste your local ~/.qcut/.env contents (chmod 0600).

EOF
fi

# Probe — surfaces an actionable error if the image is broken in this
# region/host before the user types their first command.
qcut system doctor --json --skip-health | jq -r '.status'
