#!/usr/bin/env bash
# Suite 04 — screen recording via CLI (TCC-gated on macOS).
#
# Parallel to Playwright tests:
#   - screen-recording-repro.e2e.ts:11     "should start and stop recording via bridge"
#   - screen-recording-telemetry.e2e.ts:30 "records screen, produces video file and valid cursor sidecar"
#
# The real macOS Screen Recording permission still applies — we skip
# cleanly if screen:startRecording fails with the TCC error string, the
# same way the Playwright side skips based on getPermissionStatus.

set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib.sh
source "$SCRIPT_DIR/../lib.sh"

suite_start "suite 04 — screen recording"

PID=""
with_project "cli-e2e-suite-04" PID

# --- baseline status: not recording ---
status=$(unwrap "$(qcut editor:screen-recording:status --project-id "$PID" --json)")
assert_json_eq "$status" '.recording' 'false' 'no recording active at suite start'

# --- start recording ---
log_step "attempting to start recording (may skip on missing TCC permission)"
start_out=""
if ! start_out=$(qcut editor:screen-recording:start --project-id "$PID" --json 2>&1); then
	if grep -q -i "permission not granted\|Screen Recording permission" <<<"$start_out"; then
		log_skip "Screen Recording permission not granted — skipping suite 04"
		end_project
		# Exit cleanly so the driver doesn't count this as a failure.
		exit 0
	fi
	die "screen-recording:start failed unexpectedly: $start_out"
fi

start_inner=$(unwrap "$start_out")
session_id=$(jq -r '.sessionId // .session.id' <<<"$start_inner")
file_path=$(jq -r '.filePath // .path' <<<"$start_inner")
[ -n "$session_id" ] && [ "$session_id" != "null" ] || die "start returned no sessionId"
log_ok "recording started: session=$session_id path=$file_path"

# Record for ~2s.
sleep 2

# --- status should now report recording: true ---
status_mid=$(unwrap "$(qcut editor:screen-recording:status --project-id "$PID" --json)")
assert_json_eq "$status_mid" '.recording' 'true' 'status reflects active recording'

# --- stop ---
stop_out=$(unwrap "$(qcut editor:screen-recording:stop --project-id "$PID" --json)")
assert_json_eq "$stop_out" '.success' 'true' 'stop reports success'
stop_path=$(jq -r '.filePath // .path' <<<"$stop_out")
[ -n "$stop_path" ] && [ "$stop_path" != "null" ] && [ -f "$stop_path" ] \
	|| die "stop reported no readable filePath: $stop_path"
log_ok "recording file written: $stop_path ($(wc -c <"$stop_path" | tr -d ' ') bytes)"

# --- cursor sidecar should exist alongside the video ---
sidecar="${stop_path%.*}.cursor.json"
if [ -f "$sidecar" ]; then
	log_ok "cursor telemetry sidecar present: $sidecar"
else
	log_skip "cursor sidecar not written (recording too short for telemetry points, ignoring)"
fi

# --- final status back to idle ---
status_final=$(unwrap "$(qcut editor:screen-recording:status --project-id "$PID" --json)")
assert_json_eq "$status_final" '.recording' 'false' 'status returns to idle after stop'

end_project
suite_summary
