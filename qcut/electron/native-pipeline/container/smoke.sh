#!/usr/bin/env bash
#
# Layer-1 smoke test (verification doc): run during CI image build,
# before push. Validates that the qcut binary is callable and emits a
# parseable doctor envelope. Real key checks happen at spawn-probe time
# (PR 07), not here — this container has no API keys baked in.

set -euo pipefail

echo "▶ bun --version"
bun --version

echo "▶ ffmpeg -version (first line)"
ffmpeg -version | head -n 1

echo "▶ which qcut"
which qcut

echo "▶ qcut --version"
qcut --version || echo "(no --version handler; that's ok)"

echo "▶ qcut system doctor --json --skip-health"
# No keys at smoke time → env_file or env_file_keys WILL be 'fail'.
# We only check the envelope shape here; key health is verified later.
output="$(qcut system doctor --json --skip-health || true)"
echo "${output}" | jq -e '.checks | length > 0' >/dev/null \
  || { echo "✗ no checks in doctor output" >&2; exit 1; }
echo "${output}" | jq -e '.bun_version' >/dev/null \
  || { echo "✗ missing bun_version in doctor output" >&2; exit 1; }
echo "${output}" | jq -e '.ffmpeg_version' >/dev/null \
  || { echo "✗ missing ffmpeg_version in doctor output" >&2; exit 1; }

echo "✓ doctor envelope shape ok"
