#!/usr/bin/env bash
set -euo pipefail

readonly DEFAULT_SOURCE_APP="/Applications/VideoFusion-macOS.app"
readonly SOURCE_APP="${JY_APP_BUNDLE:-$DEFAULT_SOURCE_APP}"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
readonly DESTINATION="$PROJECT_ROOT/.local/jianying-runtime"
readonly SOURCE_FRAMEWORKS="$SOURCE_APP/Contents/Frameworks"
readonly SOURCE_RESOURCES="$SOURCE_APP/Contents/Resources"

readonly -a FRAMEWORKS=(
  "libAGFX.dylib"
  "libEGL.dylib"
  "libGLESv2.dylib"
  "libLumiGeneRuntime.dylib"
  "libcccreator.dylib"
)

readonly -a RESOURCES=(
  "lumi_js_resources"
  "VEMetalBinary_Mac.bundle"
)

if [[ ! -d "$SOURCE_APP" ]]; then
  printf 'Jianying app not found: %s\n' "$SOURCE_APP" >&2
  exit 1
fi

if ! git -C "$PROJECT_ROOT" check-ignore --quiet -- .local/jianying-runtime/; then
  printf 'Refusing to copy: .local/jianying-runtime is not ignored by Git.\n' >&2
  exit 1
fi

mkdir -p "$DESTINATION/Frameworks" "$DESTINATION/Resources"

for framework in "${FRAMEWORKS[@]}"; do
  source_path="$SOURCE_FRAMEWORKS/$framework"
  destination_path="$DESTINATION/Frameworks/$framework"

  if [[ ! -f "$source_path" ]]; then
    printf 'Missing framework: %s\n' "$source_path" >&2
    exit 1
  fi

  ditto "$source_path" "$destination_path"
  printf 'Copied framework: %s\n' "$framework"
done

for resource in "${RESOURCES[@]}"; do
  source_path="$SOURCE_RESOURCES/$resource"
  destination_path="$DESTINATION/Resources/$resource"

  if [[ ! -e "$source_path" ]]; then
    printf 'Missing resource: %s\n' "$source_path" >&2
    exit 1
  fi

  ditto "$source_path" "$destination_path"
  printf 'Copied resource: %s\n' "$resource"
done

printf '\nLocal runtime ready at: %s\n' "$DESTINATION"
du -sh "$DESTINATION"
