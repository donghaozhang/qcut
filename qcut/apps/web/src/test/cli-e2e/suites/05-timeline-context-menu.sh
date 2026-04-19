#!/usr/bin/env bash
# Suite 02 — timeline right-click context menu (regression guard).
#
# Background: useTimelineZoom previously called setPointerCapture on every
# pointerdown including mouse, redirecting the post-mouseup `contextmenu`
# event to the zoom container and suppressing right-click menus on timeline
# clips. Fixed in commit 3930b8ce9.
#
# Important: this CLI suite cannot reproduce the pointer-capture path. The
# editor:ui:context-menu CLI dispatches a synthetic `contextmenu` MouseEvent
# directly on the element, which bypasses the OS pointer pipeline (and
# therefore pointer capture). Use this suite as defense-in-depth: it asserts
# the React tree still mounts a Radix ContextMenu around timeline elements
# and the menu opens (data-state=open) when contextmenu fires.
#
# The full pointer/right-click coverage lives in the Playwright suite:
#   apps/web/src/test/e2e/timeline-context-menu.e2e.ts

set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib.sh
source "$SCRIPT_DIR/../lib.sh"

suite_start "suite 05 — timeline context menu"

# Resolve the sample video relative to this script — works whether the
# suite is invoked from the repo root or via run-all.sh.
SAMPLE_VIDEO="$(cd "$SCRIPT_DIR/../../e2e/fixtures/media" && pwd)/sample-video.mp4"
[ -f "$SAMPLE_VIDEO" ] || die "sample video missing at $SAMPLE_VIDEO"

# --- create project + import + add to timeline ---
PID=""
with_project "cli-e2e-suite-05-ctxmenu" PID

qcut editor:media:import \
	--project-id "$PID" \
	--source "$SAMPLE_VIDEO" \
	--add-to-timeline \
	--json >/dev/null
log_step "imported sample-video.mp4 and queued add-to-timeline"

# --- discover the freshly-created element id ---
timeline=$(unwrap "$(qcut editor:timeline:info --project-id "$PID" --json)")
element_id=$(jq -r '
	.tracks
	| map(.elements // [])
	| add
	| map(select(.type == "media"))
	| sort_by(.startTime)
	| .[0].id // empty
' <<<"$timeline")
[ -n "$element_id" ] || die "no media element found on timeline after import"
log_step "media element id: $element_id"

# --- dispatch synthetic contextmenu via the bridge ---
ctx=$(unwrap "$(qcut editor:ui:context-menu \
	--element-id "$element_id" \
	--json)")
assert_json_eq "$ctx" '.found' 'true' \
	'context menu script located the timeline element by data-element-id'
assert_json_eq "$ctx" '.menuOpen' 'true' \
	'Radix ContextMenu reached data-state=open after contextmenu dispatch'

end_project
suite_summary
