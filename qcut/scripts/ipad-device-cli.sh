#!/bin/bash
# iPad Physical Device CLI for QCut
# Usage: ./scripts/ipad-device-cli.sh <command> [args]
#
# Uses xcrun devicectl for physical iPad (not simulator).
# Deep links are sent via --payload-url on app launch.
# Console output is captured for a configurable duration.
#
# Commands:
#   play                    Start playback
#   pause                   Pause playback
#   toggle                  Toggle play/pause
#   seek <time>             Seek to time in seconds
#   panel <name> [subpanel] Switch editor panel (and optional inner tab)
#   click <testid>          Click element by data-testid
#   state                   Dump editor state as JSON
#   fps                     Run 3-second FPS benchmark
#   eval <js>               Execute arbitrary JavaScript
#   navigate <path>         Navigate to hash route
#   console                 Show captured console logs
#   screenshot              Read debug overlay
#   open-editor             Navigate to first project and open editor
#   export [quality] [format] [filename]  Trigger video export
#   export-status           Poll export progress
#   install                 Build and install app on device
#   launch                  Launch app (no deep link)
#   list                    List connected devices
#
# Environment:
#   QCUT_DEVICE_ID    Override device UDID (default: auto-detect first iPad)
#   QCUT_CONSOLE_WAIT Seconds to capture console output (default: 8)
#   QCUT_BUNDLE_ID    App bundle identifier (default: com.qcut.videoeditor)
#
# Examples:
#   ./scripts/ipad-device-cli.sh state
#   ./scripts/ipad-device-cli.sh panel ai image
#   ./scripts/ipad-device-cli.sh open-editor
#   ./scripts/ipad-device-cli.sh eval "document.title"
#   QCUT_CONSOLE_WAIT=15 ./scripts/ipad-device-cli.sh fps

set -euo pipefail

BUNDLE_ID="${QCUT_BUNDLE_ID:-com.qcut.videoeditor}"
CONSOLE_WAIT="${QCUT_CONSOLE_WAIT:-8}"

# Auto-detect device if not set
detect_device() {
	if [ -n "${QCUT_DEVICE_ID:-}" ]; then
		echo "$QCUT_DEVICE_ID"
		return
	fi
	# Find first connected physical iPad via xctrace (excludes simulators and offline)
	local device_id
	device_id=$(xcrun xctrace list devices 2>&1 \
		| grep -i "ipad" \
		| grep -v "Simulator" \
		| head -1 \
		| grep -oE '\(([0-9A-Fa-f-]+)\)$' \
		| tr -d '()' || true)
	if [ -z "$device_id" ]; then
		echo "ERROR: No physical iPad found. Connect via USB or set QCUT_DEVICE_ID." >&2
		exit 1
	fi
	echo "$device_id"
}

# Send a deep link URL and capture console output
# Usage: send_url <url> [wait_seconds]
send_url() {
	local url="$1"
	local wait="${2:-$CONSOLE_WAIT}"
	local device
	device=$(detect_device)

	xcrun devicectl device process launch \
		--device "$device" \
		--terminate-existing \
		--console \
		--payload-url "$url" \
		"$BUNDLE_ID" 2>&1 &
	local pid=$!

	sleep "$wait"
	kill "$pid" 2>/dev/null || true
	wait "$pid" 2>/dev/null || true
}

# Send deep link and filter for QCut CLI output
send_cmd() {
	local url="$1"
	local wait="${2:-$CONSOLE_WAIT}"
	send_url "$url" "$wait" 2>&1 | grep -E "\[QCut CLI\]" || echo "(no CLI output captured)"
}

# Launch app without deep link
launch_app() {
	local device
	device=$(detect_device)
	xcrun devicectl device process launch --device "$device" "$BUNDLE_ID" 2>&1
}

CMD="${1:-help}"; shift || true

case "$CMD" in
	play|pause|toggle|state|fps|console|screenshot|open-editor|test-export)
		send_cmd "qcut://$CMD"
		;;
	seek)
		send_cmd "qcut://seek?time=$1"
		;;
	panel)
		PANEL="${1:?missing panel name}"
		SUBPANEL="${2:-}"
		URL="qcut://panel?panel=$PANEL"
		if [ -n "$SUBPANEL" ]; then
			URL="$URL&subpanel=$SUBPANEL"
		fi
		send_cmd "$URL"
		;;
	click)
		send_cmd "qcut://click?testid=${1:?missing testid}"
		;;
	navigate)
		send_cmd "qcut://navigate?path=${1:?missing path}"
		;;
	eval)
		ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "${1:?missing js}")
		send_cmd "qcut://eval?js=$ENCODED"
		;;
	export)
		QUALITY=${1:-720p}
		FORMAT=${2:-mp4}
		FILENAME=${3:-export}
		send_cmd "qcut://export?quality=$QUALITY&format=$FORMAT&filename=$FILENAME"
		;;
	export-status)
		send_cmd "qcut://export-status"
		;;
	import-and-export)
		echo "Running E2E import-and-export (this takes a while)..."
		send_cmd "qcut://cli.import-and-export" 60
		;;
	install)
		echo "Building and installing on device..."
		DEVICE=$(detect_device)
		APP_DIR="apps/web/ios/App"
		DERIVED_DATA="$HOME/Library/Developer/Xcode/DerivedData"
		# Find the most recent App.app build
		APP_PATH=$(find "$DERIVED_DATA" -name "App.app" -path "*/Debug-iphoneos/*" -maxdepth 5 2>/dev/null | head -1)
		if [ -z "$APP_PATH" ]; then
			echo "No existing build found. Building..."
			cd "$APP_DIR"
			xcodebuild -project App.xcodeproj -scheme App \
				-destination "id=$DEVICE" \
				-allowProvisioningUpdates build 2>&1 | tail -5
			cd - >/dev/null
			APP_PATH=$(find "$DERIVED_DATA" -name "App.app" -path "*/Debug-iphoneos/*" -maxdepth 5 2>/dev/null | head -1)
		fi
		echo "Installing $APP_PATH..."
		xcrun devicectl device install app --device "$DEVICE" "$APP_PATH" 2>&1 | grep -E "installed|error|Error"
		;;
	launch)
		launch_app
		;;
	list)
		xcrun xctrace list devices 2>&1 | grep -i ipad
		;;
	help|"")
		echo "iPad Physical Device CLI for QCut"
		echo ""
		echo "Usage: $0 <command> [args]"
		echo ""
		echo "Commands:"
		echo "  play                    Start playback"
		echo "  pause                   Pause playback"
		echo "  toggle                  Toggle play/pause"
		echo "  seek <time>             Seek to time (seconds)"
		echo "  panel <name> [subpanel] Switch panel (ai, moyin, media, text, export, settings...)"
		echo "  click <testid>          Click element by data-testid"
		echo "  state                   Dump editor state JSON"
		echo "  fps                     3-second FPS benchmark"
		echo "  eval <js>               Execute JavaScript"
		echo "  navigate <path>         Navigate to route"
		echo "  console                 Show console logs"
		echo "  screenshot              Read debug overlay"
		echo "  open-editor             Open first project in editor"
		echo "  export [q] [fmt] [name] Export video (default: 720p mp4 export)"
		echo "  export-status           Poll export progress"
		echo "  import-and-export       E2E: import 3 photos + export"
		echo "  install                 Build and install app on device"
		echo "  launch                  Launch app (no deep link)"
		echo "  list                    List connected iPads"
		echo ""
		echo "Environment:"
		echo "  QCUT_DEVICE_ID          Override device UDID"
		echo "  QCUT_CONSOLE_WAIT       Console capture seconds (default: 8)"
		;;
	*)
		echo "Unknown command: $CMD (run '$0 help' for usage)"
		exit 1
		;;
esac
