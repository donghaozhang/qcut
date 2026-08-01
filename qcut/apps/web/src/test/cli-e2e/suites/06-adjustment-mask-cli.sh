#!/usr/bin/env bash
# Suite 06 — adjustment layer masks from qcut CLI and virtual pointer.

set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib.sh
source "$SCRIPT_DIR/../lib.sh"

suite_start "suite 06 — adjustment mask CLI"

SAMPLE_IMAGE="$(cd "$SCRIPT_DIR/../../e2e/fixtures/media" && pwd)/sample-image.png"
[ -f "$SAMPLE_IMAGE" ] || die "sample image missing at $SAMPLE_IMAGE"

ADJUSTMENT_ID="cli-e2e-adjustment-mask"
CIRCLE_MASK_ID="cli-mask-circle"
RECT_MASK_ID="cli-mask-rect"

wait_for_media_clip() {
	local project_id=$1
	local timeline_json=""
	for _attempt in {1..30}; do
		timeline_json=$(unwrap "$(qcut editor:timeline:export \
			--project-id "$project_id" \
			--json)")
		if jq -e '
			.tracks
			| map(.elements // [])
			| add
			| any(.type == "media")
		' <<<"$timeline_json" >/dev/null; then
			log_ok "media clip appeared on timeline"
			return 0
		fi
		sleep 0.2
	done
	die "media clip did not appear on timeline after import"
}

tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/qcut-adjustment-mask-e2e.XXXXXX")
cleanup_adjustment_mask_suite() {
	rm -rf "$tmpdir"
	_cleanup_active_project
}
trap cleanup_adjustment_mask_suite EXIT

PID=""
with_project "cli-e2e-suite-06-adjustment-mask" PID
trap cleanup_adjustment_mask_suite EXIT

qcut editor:media:import \
	--project-id "$PID" \
	--source "$SAMPLE_IMAGE" \
	--add-to-timeline \
	--json >/dev/null
log_step "imported sample-image.png and queued add-to-timeline"
wait_for_media_clip "$PID"

track_create=$(unwrap "$(qcut editor:track:create \
	--project-id "$PID" \
	--type adjustment \
	--name "CLI 调节轨道" \
	--index 0 \
	--json)")
adjustment_track_id=$(jq -r '.trackId // .id // .track.id // empty' <<<"$track_create")
[ -n "$adjustment_track_id" ] || die "track:create returned no adjustment track id (inner: $track_create)"
log_ok "created adjustment track above media track: $adjustment_track_id"

add_payload="$tmpdir/add-adjustment.json"
jq -n \
	--arg id "$ADJUSTMENT_ID" \
	--arg trackId "$adjustment_track_id" \
	--arg circleId "$CIRCLE_MASK_ID" \
	--arg rectId "$RECT_MASK_ID" \
	'{
		id: $id,
		type: "adjustment",
		trackId: $trackId,
		name: "CLI E2E 蒙版调节",
		startTime: 0,
		duration: 5,
		opacity: 0.86,
		adjustments: {
			color: {
				temperature: 8,
				contrast: 12,
				mask: {
					enabled: true,
					maskIds: [$circleId, $rectId]
				}
			}
		},
		masks: [
			{
				id: $circleId,
				type: "ellipse",
				name: "CLI 圆形蒙版",
				enabled: true,
				x: 0.32,
				y: 0.46,
				width: 0.28,
				height: 0.28,
				rotation: 18,
				feather: 0.12,
				invert: false,
				keyframes: {
					rotation: [
						{ time: 0, value: 18 },
						{ time: 4, value: 36 }
					]
				}
			},
			{
				id: $rectId,
				type: "rectangle",
				name: "CLI 圆角矩形蒙版",
				enabled: true,
				x: 0.58,
				y: 0.5,
				width: 0.34,
				height: 0.3,
				rotation: -12,
				roundness: 34,
				feather: 0.08,
				invert: false,
				keyframes: {
					rotation: [
						{ time: 0, value: -12 },
						{ time: 4, value: 8 }
					],
					roundness: [
						{ time: 0, value: 34 },
						{ time: 4, value: 42 }
					]
				}
			}
		]
	}' >"$add_payload"

add_result=$(unwrap "$(qcut editor:timeline:add-element \
	--project-id "$PID" \
	--data "@$add_payload" \
	--json)")
created_element_id=$(jq -r '.elementId // .id // .element.id // empty' <<<"$add_result")
[ "$created_element_id" = "$ADJUSTMENT_ID" ] \
	|| die "timeline:add-element should preserve requested id '$ADJUSTMENT_ID' (got '$created_element_id')"
log_ok "CLI added adjustment element and preserved requested id"

timeline=$(unwrap "$(qcut editor:timeline:export --project-id "$PID" --json)")

adjustment_track_index=$(jq -r --arg tid "$adjustment_track_id" '
	.tracks
	| to_entries
	| map(select(.value.id == $tid))
	| .[0].key // empty
' <<<"$timeline")
media_track_index=$(jq -r '
	.tracks
	| to_entries
	| map(select((.value.elements // []) | any(.type == "media")))
	| .[0].key // empty
' <<<"$timeline")
[ -n "$adjustment_track_index" ] || die "adjustment track not found in exported timeline"
[ -n "$media_track_index" ] || die "media track not found in exported timeline"
if [ "$adjustment_track_index" -lt "$media_track_index" ]; then
	log_ok "adjustment track exports above media track ($adjustment_track_index < $media_track_index)"
else
	die "adjustment track should be above media track (adjustment=$adjustment_track_index, media=$media_track_index)"
fi

adjustment_element=$(jq -c --arg id "$ADJUSTMENT_ID" '
	[.tracks[]?.elements[]? | select(.id == $id)] | first // {}
' <<<"$timeline")
assert_json_eq "$adjustment_element" '.type' 'adjustment' \
	'exported element keeps type=adjustment'
assert_json_eq "$adjustment_element" '.masks | length' '2' \
	'exported adjustment keeps both masks'
assert_json_eq "$adjustment_element" \
	'.masks[] | select(.id == "cli-mask-rect") | .roundness' \
	'34' \
	'exported rectangle mask keeps roundness'
assert_json_eq "$adjustment_element" \
	'.masks[] | select(.id == "cli-mask-rect") | .keyframes.roundness | length' \
	'2' \
	'exported rectangle mask keeps roundness keyframes'
assert_json_eq "$adjustment_element" \
	'.adjustments.color.mask.maskIds | join(",")' \
	'cli-mask-circle,cli-mask-rect' \
	'exported color adjustment references both mask ids'

patch_payload="$tmpdir/patch-adjustment.json"
jq --arg rectId "$RECT_MASK_ID" '
	{
		masks: (.masks | map(
			if .id == $rectId then
				. + { roundness: 42, rotation: -6 }
			else
				.
			end
		))
	}
' <<<"$adjustment_element" >"$patch_payload"

qcut editor:element:patch \
	--project-id "$PID" \
	--element-id "$ADJUSTMENT_ID" \
	--set "@$patch_payload" \
	--json >/dev/null
timeline_after_patch=$(unwrap "$(qcut editor:timeline:export --project-id "$PID" --json)")
patched_element=$(jq -c --arg id "$ADJUSTMENT_ID" '
	[.tracks[]?.elements[]? | select(.id == $id)] | first // {}
' <<<"$timeline_after_patch")
assert_json_eq "$patched_element" \
	'.masks[] | select(.id == "cli-mask-rect") | .roundness' \
	'42' \
	'element:patch updates rectangle mask roundness by id'

qcut editor:navigator:open \
	--project-id "$PID" \
	--wait-ready \
	--timeout-ms 15000 \
	--json >/dev/null
log_step "opened project in editor for virtual pointer verification"

pointer_raw=""
set +e
pointer_raw=$(qcut editor:pointer:click \
	--target panel.adjustments \
	--timeout-ms 10000 \
	--force \
	--json 2>/dev/null)
pointer_status=$?
set -e
if [ "$pointer_status" -eq 0 ] && jq -e '.status == "ok"' <<<"$pointer_raw" >/dev/null; then
	pointer_result=$(unwrap "$pointer_raw")
else
	log_step "background pointer click unavailable; retrying with foreground Electron input"
	set +e
	pointer_raw=$(qcut editor:pointer:click \
		--target panel.adjustments \
		--timeout-ms 10000 \
		--foreground \
		--force \
		--json)
	pointer_status=$?
	set -e
	if [ "$pointer_status" -ne 0 ] || ! jq -e '.status == "ok"' <<<"$pointer_raw" >/dev/null; then
		pointer_error=$(jq -r '.error // .' <<<"$pointer_raw" 2>/dev/null || printf '%s' "$pointer_raw")
		die "virtual pointer click failed: $pointer_error"
	fi
	pointer_result=$(unwrap "$pointer_raw")
fi
assert_json_truthy "$pointer_result" '.input' \
	'virtual pointer click reported an input backend'
assert_json_truthy "$pointer_result" '.inputMode' \
	'virtual pointer click reported an input mode'

screenshot=$(unwrap "$(qcut editor:screenshot:capture \
	--filename cli-e2e-adjustment-mask.png \
	--json)")
screenshot_path=$(jq -r '.path // .filePath // .outputPath // empty' <<<"$screenshot")
[ -n "$screenshot_path" ] && [ -f "$screenshot_path" ] \
	|| die "screenshot:capture returned no readable file path (inner: $screenshot)"
log_ok "captured evidence screenshot: $screenshot_path"

end_project
rm -rf "$tmpdir"
trap - EXIT
suite_summary
