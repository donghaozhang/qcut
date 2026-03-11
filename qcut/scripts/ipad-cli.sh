#!/bin/bash
# iPad Simulator CLI for QCut
# Usage: ./scripts/ipad-cli.sh <command> [args]
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
#   export [quality] [format] [filename]  Trigger video export (default: 720p mp4 export)
#   export-status           Poll export progress
#   export-wait [quality] [format] [filename]  Export and poll until complete
#   logs [seconds]          Show recent simulator logs (default: 30s)
#
# Examples:
#   ./scripts/ipad-cli.sh play
#   ./scripts/ipad-cli.sh seek 5.0
#   ./scripts/ipad-cli.sh panel ai image
#   ./scripts/ipad-cli.sh panel moyin shots
#   ./scripts/ipad-cli.sh panel export
#   ./scripts/ipad-cli.sh click split-clip-button
#   ./scripts/ipad-cli.sh state
#   ./scripts/ipad-cli.sh eval "document.title"
#   ./scripts/ipad-cli.sh navigate /editor/my-project

CMD=$1; shift

case "$CMD" in
  play|pause|toggle|state|fps|console|screenshot)
    xcrun simctl openurl booted "qcut://$CMD"
    ;;
  seek)
    xcrun simctl openurl booted "qcut://seek?time=$1"
    ;;
  panel)
    PANEL=$1
    SUBPANEL=$2
    URL="qcut://panel?panel=$PANEL"
    if [ -n "$SUBPANEL" ]; then
      URL="$URL&subpanel=$SUBPANEL"
    fi
    xcrun simctl openurl booted "$URL"
    ;;
  click)
    xcrun simctl openurl booted "qcut://click?testid=$1"
    ;;
  navigate)
    xcrun simctl openurl booted "qcut://navigate?path=$1"
    ;;
  eval)
    ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1")
    xcrun simctl openurl booted "qcut://eval?js=$ENCODED"
    ;;
  export)
    QUALITY=${1:-720p}
    FORMAT=${2:-mp4}
    FILENAME=${3:-export}
    xcrun simctl openurl booted "qcut://export?quality=$QUALITY&format=$FORMAT&filename=$FILENAME"
    ;;
  export-status)
    xcrun simctl openurl booted "qcut://export-status"
    ;;
  export-wait)
    QUALITY=${1:-720p}
    FORMAT=${2:-mp4}
    FILENAME=${3:-export}
    xcrun simctl openurl booted "qcut://export?quality=$QUALITY&format=$FORMAT&filename=$FILENAME"
    echo "Export started, polling progress..."
    while true; do
      sleep 2
      xcrun simctl openurl booted "qcut://export-status"
      sleep 1
      STATUS=$(xcrun simctl spawn booted log show --predicate 'process == "App"' --last 3s --style compact 2>&1 | grep "QCut CLI" | tail -1)
      echo "$STATUS"
      if echo "$STATUS" | grep -q '"isExporting":false'; then
        echo "Export complete!"
        break
      fi
    done
    exit 0
    ;;
  logs)
    xcrun simctl spawn booted log show --predicate 'process == "App"' --last "${1:-30}s" --style compact 2>&1 | grep "QCut CLI"
    exit 0
    ;;
  help|"")
    echo "iPad Simulator CLI for QCut"
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
    echo "  export [q] [fmt] [name] Export video (default: 720p mp4 export)"
    echo "  export-status           Poll export progress"
    echo "  export-wait [q] [f] [n] Export and wait for completion"
    echo "  logs [seconds]          Show simulator logs"
    exit 0
    ;;
  *)
    echo "Unknown command: $CMD (run '$0 help' for usage)"
    exit 1
    ;;
esac

# Show result from logs after a brief delay
sleep 1
xcrun simctl spawn booted log show --predicate 'process == "App"' --last 3s --style compact 2>&1 | grep "QCut CLI" | tail -5
