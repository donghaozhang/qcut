#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if (( $# < 3 || $# > 4 )); then
  printf 'Usage: JY_TRANSITION_PACKAGE=/path/to/package %s <input-a> <input-b> <output.mp4> [duration-seconds]\n' "$0" >&2
  exit 2
fi

readonly INPUT_A="$1"
readonly INPUT_B="$2"
readonly OUTPUT="$3"
readonly TRANSITION_DURATION="${4:-${JY_TRANSITION_DURATION:-0.5}}"
readonly FRAME_RATE="${JY_VIDEO_FPS:-30}"
readonly CRF="${JY_VIDEO_CRF:-18}"
readonly PRESET="${JY_VIDEO_PRESET:-medium}"
readonly PACKAGE="${JY_TRANSITION_PACKAGE:-}"

for tool in ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '%s is required but was not found in PATH.\n' "$tool" >&2
    exit 1
  fi
done

if [[ ! -f "$INPUT_A" || ! -f "$INPUT_B" ]]; then
  printf 'Both video inputs must be regular files.\n' >&2
  exit 1
fi
if [[ -z "$PACKAGE" || ! -d "$PACKAGE" ]]; then
  printf 'JY_TRANSITION_PACKAGE must name a downloaded transition package.\n' >&2
  exit 1
fi
if [[ "$OUTPUT" == "$INPUT_A" || "$OUTPUT" == "$INPUT_B" ]]; then
  printf 'Output must not overwrite either input.\n' >&2
  exit 1
fi
if [[ ! "$FRAME_RATE" =~ ^[0-9]+([.][0-9]+)?$ ||
      ! "$TRANSITION_DURATION" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  printf 'Frame rate and transition duration must be positive numbers.\n' >&2
  exit 1
fi

source_size="$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=s=x:p=0 "$INPUT_A")"
if [[ ! "$source_size" =~ ^([0-9]+)x([0-9]+)$ ]]; then
  printf 'Could not read input A video dimensions.\n' >&2
  exit 1
fi

width_text="${JY_VIDEO_WIDTH:-${BASH_REMATCH[1]}}"
height_text="${JY_VIDEO_HEIGHT:-${BASH_REMATCH[2]}}"
if [[ ! "$width_text" =~ ^[0-9]+$ || ! "$height_text" =~ ^[0-9]+$ ]]; then
  printf 'Video dimensions must be integers between 1 and 16384.\n' >&2
  exit 1
fi
width=$((10#$width_text))
height=$((10#$height_text))
if (( width <= 0 || height <= 0 || width > 16384 || height > 16384 )); then
  printf 'Video dimensions must be integers between 1 and 16384.\n' >&2
  exit 1
fi
if ! awk -v value="$FRAME_RATE" 'BEGIN { exit !(value > 0 && value <= 240) }'; then
  printf 'Frame rate must be greater than 0 and no more than 240.\n' >&2
  exit 1
fi
if ! awk -v value="$TRANSITION_DURATION" 'BEGIN { exit !(value > 0) }'; then
  printf 'Transition duration must be greater than 0.\n' >&2
  exit 1
fi
if (( width % 2 != 0 )); then
  width=$((width + 1))
fi
if (( height % 2 != 0 )); then
  height=$((height + 1))
fi

readonly TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qcut-jianying-transition.XXXXXX")"
cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

readonly RAW_INPUT_A="$TEMP_DIR/input-a.rgba"
readonly RAW_INPUT_B="$TEMP_DIR/input-b.rgba"
readonly RAW_OUTPUT="$TEMP_DIR/output.rgba"
readonly NORMALIZE_FILTER="fps=${FRAME_RATE},scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=rgba"
readonly ENCODE_FILTER='scale=in_range=full:out_range=limited:out_color_matrix=bt709,'\
'format=yuv420p,'\
'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709'

printf '[ffmpeg] decoding and normalizing input A to %sx%s @ %s fps\n' "$width" "$height" "$FRAME_RATE"
ffmpeg -hide_banner -loglevel error -y -i "$INPUT_A" -map 0:v:0 -an -sn -dn \
  -vf "$NORMALIZE_FILTER" -pix_fmt rgba -f rawvideo "$RAW_INPUT_A"

printf '[ffmpeg] decoding and normalizing input B to %sx%s @ %s fps\n' "$width" "$height" "$FRAME_RATE"
ffmpeg -hide_banner -loglevel error -y -i "$INPUT_B" -map 0:v:0 -an -sn -dn \
  -vf "$NORMALIZE_FILTER" -pix_fmt rgba -f rawvideo "$RAW_INPUT_B"

printf '[transition] rendering %s seconds centered across the adjacent cut\n' "$TRANSITION_DURATION"
JY_RAW_INPUT_A="$RAW_INPUT_A" \
JY_RAW_INPUT_B="$RAW_INPUT_B" \
JY_RAW_OUTPUT="$RAW_OUTPUT" \
JY_VIDEO_WIDTH="$width" \
JY_VIDEO_HEIGHT="$height" \
JY_VIDEO_FPS="$FRAME_RATE" \
JY_TRANSITION_DURATION="$TRANSITION_DURATION" \
JY_TRANSITION_PACKAGE="$PACKAGE" \
  "$SCRIPT_DIR/run-probe.sh" transition-video

mkdir -p -- "$(dirname -- "$OUTPUT")"
printf '[ffmpeg] encoding video-only MP4: %s\n' "$OUTPUT"
ffmpeg -hide_banner -loglevel error -y \
  -f rawvideo -pixel_format rgba -video_size "${width}x${height}" \
  -framerate "$FRAME_RATE" -i "$RAW_OUTPUT" -an \
  -vf "$ENCODE_FILTER" \
  -c:v libx264 -preset "$PRESET" -crf "$CRF" \
  -color_range tv -colorspace bt709 -color_trc bt709 -color_primaries bt709 \
  -movflags +faststart "$OUTPUT"

ffmpeg -hide_banner -loglevel error -i "$OUTPUT" -map 0:v:0 -f null -
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate,nb_frames:format=duration \
  -of default=noprint_wrappers=1 "$OUTPUT"
