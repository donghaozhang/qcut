#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
readonly PROJECT_ROOT
readonly SOURCE_APP="${JY_APP_BUNDLE:-/Applications/VideoFusion-macOS.app}"
readonly SOURCE_APP_FRAMEWORKS="$SOURCE_APP/Contents/Frameworks"
readonly RUNTIME_ROOT="${JY_RUNTIME_ROOT:-$PROJECT_ROOT/.local/jianying-runtime}"
readonly BUILD_DIR="$SCRIPT_DIR/build"
readonly PROBE="$BUILD_DIR/jianying-runtime-probe"
readonly MODE="${1:-inspect}"

if [[ ! -f "$RUNTIME_ROOT/Frameworks/libLumiGeneRuntime.dylib" ]]; then
  printf 'Local runtime is missing. Run %s/copy-runtime.sh first.\n' "$SCRIPT_DIR" >&2
  exit 1
fi

case "$MODE" in
  inspect | config | launch | gpu | textures | transition | transition-load | transition-frame | transition-video | filter-sequence | text-frame) ;;
  *)
    printf 'Usage: %s [inspect|config|launch|gpu|textures|transition|transition-load|transition-frame|transition-video|filter-sequence|text-frame]\n' "$0" >&2
    exit 2
    ;;
esac

# Native segment modes require the complete libcccreator dependency closure.
case "$MODE" in
  transition* | text-*)
    if [[ ! -f "$RUNTIME_ROOT/Frameworks/libcccreator.dylib" ]]; then
      printf 'libcccreator is missing from the private runtime: %s\n' "$RUNTIME_ROOT" >&2
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
  -Wno-deprecated-declarations \
  "$SCRIPT_DIR/probe.mm" \
  "$SCRIPT_DIR/amazer-context-scope.mm" \
  "$SCRIPT_DIR/filter-host-support.mm" \
  "$SCRIPT_DIR/filter-sequence-io.cpp" \
  "$SCRIPT_DIR/graphics-runtime.mm" \
  "$SCRIPT_DIR/graphics-probe.mm" \
  "$SCRIPT_DIR/filter-probe.mm" \
  "$SCRIPT_DIR/transition-probe.mm" \
  "$SCRIPT_DIR/text-probe.mm" \
  "$SCRIPT_DIR/text-resource-finder.mm" \
  "$SCRIPT_DIR/video-transition-probe.mm" \
  -framework AppKit \
  -framework CoreVideo \
  -framework IOSurface \
  -framework OpenGL \
  -o "$PROBE"

DYLD_LIBRARY_PATH="$RUNTIME_ROOT/Frameworks:$SOURCE_APP_FRAMEWORKS${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}" \
  "$PROBE" "$RUNTIME_ROOT" "$MODE"
