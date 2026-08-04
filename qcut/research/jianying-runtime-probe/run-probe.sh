#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
readonly PROJECT_ROOT
readonly SOURCE_APP="${JY_APP_BUNDLE:-/Applications/VideoFusion-macOS.app}"
readonly SOURCE_APP_FRAMEWORKS="$SOURCE_APP/Contents/Frameworks"
readonly RUNTIME_ROOT="$PROJECT_ROOT/.local/jianying-runtime"
readonly BUILD_DIR="$SCRIPT_DIR/build"
readonly PROBE="$BUILD_DIR/jianying-runtime-probe"
readonly MODE="${1:-inspect}"

if [[ ! -f "$RUNTIME_ROOT/Frameworks/libLumiGeneRuntime.dylib" ]]; then
  printf 'Local runtime is missing. Run %s/copy-runtime.sh first.\n' "$SCRIPT_DIR" >&2
  exit 1
fi

case "$MODE" in
  inspect | config | launch | gpu | textures | transition | transition-load | transition-frame | transition-video) ;;
  *)
    printf 'Usage: %s [inspect|config|launch|gpu|textures|transition|transition-load|transition-frame|transition-video]\n' "$0" >&2
    exit 2
    ;;
esac

# transition* modes dlopen libcccreator, which resolves siblings out of the
# installed bundle. Check that before spending a compile on a run that would
# only fail later inside the dynamic loader.
case "$MODE" in
  transition*)
    if [[ ! -d "$SOURCE_APP_FRAMEWORKS" ]]; then
      printf 'Jianying frameworks not found: %s\n' "$SOURCE_APP_FRAMEWORKS" >&2
      printf 'Set JY_APP_BUNDLE to the installed VideoFusion-macOS.app.\n' >&2
      exit 1
    fi
    ;;
esac

mkdir -p "$BUILD_DIR"

xcrun clang++ \
  -std=c++20 \
  -fobjc-arc \
  -Wall \
  -Wextra \
  -Werror \
  "$SCRIPT_DIR/probe.mm" \
  "$SCRIPT_DIR/graphics-probe.mm" \
  "$SCRIPT_DIR/transition-probe.mm" \
  "$SCRIPT_DIR/video-transition-probe.mm" \
  -framework AppKit \
  -framework IOSurface \
  -o "$PROBE"

DYLD_LIBRARY_PATH="$RUNTIME_ROOT/Frameworks:$SOURCE_APP_FRAMEWORKS${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}" \
  "$PROBE" "$RUNTIME_ROOT" "$MODE"
