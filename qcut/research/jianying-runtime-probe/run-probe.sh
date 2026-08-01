#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
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
  inspect | config | launch | gpu | textures | transition | transition-load) ;;
  *)
    printf 'Usage: %s [inspect|config|launch|gpu|textures|transition|transition-load]\n' "$0" >&2
    exit 2
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
  -framework AppKit \
  -framework IOSurface \
  -o "$PROBE"

DYLD_LIBRARY_PATH="$RUNTIME_ROOT/Frameworks:$SOURCE_APP_FRAMEWORKS${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}" \
  "$PROBE" "$RUNTIME_ROOT" "$MODE"
