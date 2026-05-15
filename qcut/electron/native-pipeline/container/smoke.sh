#!/usr/bin/env bash
#
# Layer-1 smoke test (verification doc): run during CI image build,
# before push. Validates that the qcut binary is callable and emits a
# parseable doctor envelope. Real key checks happen at spawn-probe time
# (PR 07), not here — this container has no API keys baked in.

set -euo pipefail

echo "▶ bun --version"
bun --version

echo "▶ node --version"
node --version

echo "▶ npm --version"
npm --version

echo "▶ git --version"
git --version

echo "▶ ffmpeg -version (first line)"
ffmpeg -version | head -n 1

echo "▶ which qcut"
which qcut

echo "▶ qcut --version"
qcut --version || echo "(no --version handler; that's ok)"

echo "▶ which codex"
which codex

echo "▶ codex --version"
codex --version

echo "▶ which claude"
which claude

echo "▶ claude --version"
claude --version

echo "▶ qcut system doctor --json --skip-health"
# No keys at smoke time → env_file or env_file_keys WILL be 'fail',
# which makes the CLI exit non-zero. That's fine here; we only check
# the envelope shape. The CLI's `--json` output wraps the doctor
# report inside `.data.data` (the outer envelope is success/error
# metadata; the inner one is the doctor report itself).
output="$(qcut system doctor --json --skip-health || true)"
echo "${output}" | jq -e '.data.data.checks | length > 0' >/dev/null \
  || { echo "✗ no checks in doctor output" >&2; echo "${output}" >&2; exit 1; }
echo "${output}" | jq -e '.data.data.bun_version' >/dev/null \
  || { echo "✗ missing bun_version in doctor output" >&2; exit 1; }
echo "${output}" | jq -e '.data.data.ffmpeg_version' >/dev/null \
  || { echo "✗ missing ffmpeg_version in doctor output" >&2; exit 1; }

echo "✓ doctor envelope shape ok"
