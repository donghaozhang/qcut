#!/usr/bin/env bash

set -u -o pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_APP="${JY_APP_BUNDLE:-/Applications/VideoFusion-macOS.app}"
readonly SOURCE_APP_FRAMEWORKS="$SOURCE_APP/Contents/Frameworks"
readonly RUNTIME_ROOT="${JY_RUNTIME_ROOT:-$HOME/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current}"
readonly CACHE_ROOT="${JY_TEXT_CACHE_ROOT:-$HOME/Movies/JianyingPro/User Data/Cache/artistEffect}"
readonly DATABASE_ROOT="${JY_TEXT_DATABASE_ROOT:-$HOME/Movies/JianyingPro/User Data/Cache/ressdk_db}"
readonly FONT_PATH="${JY_TEXT_FONT_PATH:?Set JY_TEXT_FONT_PATH to a local font file}"
readonly CONTENT="${JY_TEXT_CONTENT:-花字测试}"
readonly FONT_SIZE="${JY_TEXT_FONT_SIZE:-18}"
readonly TIMESTAMP="${JY_TEXT_TIMESTAMP:-500000}"
readonly SCRIPT_TEXT="${JY_TEXT_SCRIPT_TEXT:-}"
readonly SCRIPT_EDIT_MODE="${JY_TEXT_SCRIPT_EDIT_MODE:-runtime}"
readonly LIMIT="${JY_TEXT_LIMIT:-0}"
readonly PACKAGE_TYPE="${JY_TEXT_PACKAGE_TYPE:-TextStyle}"
readonly FLOWER_ONLY="${JY_TEXT_FLOWER_ONLY:-1}"
readonly EVIDENCE_ROOT="${JY_TEXT_EVIDENCE_ROOT:-$HOME/Library/Application Support/QCut/Research/JianyingText/text-package-$PACKAGE_TYPE-$(date +%Y%m%d-%H%M%S)}"
readonly PROBE="$SCRIPT_DIR/build/jianying-runtime-probe"
readonly FRAME="$EVIDENCE_ROOT/frame.rgba"
readonly PAYLOAD="$EVIDENCE_ROOT/payload.json"
readonly RESULTS_TSV="$EVIDENCE_ROOT/results.tsv"
readonly RESULTS_JSON="$EVIDENCE_ROOT/results.json"
readonly RUN_CONTEXT="$EVIDENCE_ROOT/run-context.json"
readonly LOG_DIR="$EVIDENCE_ROOT/failure-logs"
readonly FLOWER_KEYS="$EVIDENCE_ROOT/flower-package-keys.txt"
readonly BASELINE_PACKAGE="$EVIDENCE_ROOT/empty-effect"
readonly BASELINE_HASH_FILE="$EVIDENCE_ROOT/baseline.sha256"
readonly PACKAGE_COPY_ROOT="$EVIDENCE_ROOT/package-copies"

if [[ ! -f "$RUNTIME_ROOT/Frameworks/libcccreator.dylib" ]]; then
  printf 'Jianying private runtime is incomplete: %s\n' "$RUNTIME_ROOT" >&2
  exit 1
fi
if [[ ! -d "$CACHE_ROOT" ]]; then
  printf 'Jianying artistEffect cache is missing: %s\n' "$CACHE_ROOT" >&2
  exit 1
fi
if [[ ! -f "$FONT_PATH" ]]; then
  printf 'Font is missing: %s\n' "$FONT_PATH" >&2
  exit 1
fi
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  printf 'JY_TEXT_LIMIT must be a non-negative integer\n' >&2
  exit 1
fi
if ! TIMESTAMP_JSON="$(
  jq -ner --arg value "$TIMESTAMP" '
    ($value | tonumber) as $timestamp
    | select($timestamp >= 0 and $timestamp <= 60000000)
    | $timestamp
  ' 2>/dev/null
)"; then
  printf 'JY_TEXT_TIMESTAMP must be a number from 0 to 60000000\n' >&2
  exit 1
fi
readonly TIMESTAMP_JSON
if [[ "$FLOWER_ONLY" != "0" && "$FLOWER_ONLY" != "1" ]]; then
  printf 'JY_TEXT_FLOWER_ONLY must be 0 or 1\n' >&2
  exit 1
fi
if [[ "$SCRIPT_EDIT_MODE" != "runtime" && \
  "$SCRIPT_EDIT_MODE" != "preload-copy" ]]; then
  printf 'JY_TEXT_SCRIPT_EDIT_MODE must be runtime or preload-copy\n' >&2
  exit 1
fi

mkdir -p "$EVIDENCE_ROOT" "$LOG_DIR"
runtime_dylib_count="$(
  find "$RUNTIME_ROOT/Frameworks" -maxdepth 1 -name '*.dylib' -type f \
    | wc -l \
    | tr -d ' '
)"
source_app_exists=false
if [[ -d "$SOURCE_APP" ]]; then
  source_app_exists=true
fi
script_text_requested=false
if [[ -n "$SCRIPT_TEXT" ]]; then
  script_text_requested=true
fi
flower_only_json=false
if [[ "$FLOWER_ONLY" == "1" ]]; then
  flower_only_json=true
fi
jq -n \
  --arg packageType "$PACKAGE_TYPE" \
  --arg runtimeRoot "$RUNTIME_ROOT" \
  --arg sourceApp "$SOURCE_APP" \
  --arg scriptEditMode "$SCRIPT_EDIT_MODE" \
  --argjson sourceAppExists "$source_app_exists" \
  --argjson runtimeDylibCount "$runtime_dylib_count" \
  --argjson scriptTextRequested "$script_text_requested" \
  --argjson flowerOnly "$flower_only_json" \
  --argjson limit "$LIMIT" \
  --argjson timestamp "$TIMESTAMP_JSON" \
  '{
    packageType: $packageType,
    runtimeRoot: $runtimeRoot,
    runtimeDylibCount: $runtimeDylibCount,
    sourceApp: $sourceApp,
    sourceAppExists: $sourceAppExists,
    scriptTextRequested: $scriptTextRequested,
    scriptEditMode: $scriptEditMode,
    flowerOnly: $flowerOnly,
    limit: $limit,
    timestamp: $timestamp
  }' > "$RUN_CONTEXT"
if [[ "$FLOWER_ONLY" == "1" ]]; then
  : > "$FLOWER_KEYS"
  while IFS= read -r database_path; do
    sqlite3 -readonly "$database_path" '
      SELECT DISTINCT
        CAST(json_extract(item.value, "$.common_attr.id") AS TEXT)
          || "/" ||
        CAST(json_extract(item.value, "$.common_attr.md5") AS TEXT)
      FROM http_cache AS cache,
        json_each(
          CASE WHEN json_valid(cache.response_body)
            THEN cache.response_body ELSE "{}" END,
          "$.data.effect_item_list"
        ) AS item
      WHERE cache.url LIKE "%flower%"
        AND json_extract(item.value, "$.common_attr.id") IS NOT NULL
        AND json_extract(item.value, "$.common_attr.md5") IS NOT NULL;
    ' >> "$FLOWER_KEYS"
  done < <(find "$DATABASE_ROOT" -mindepth 2 -maxdepth 2 -name rp.db -type f | sort)
  sort -u -o "$FLOWER_KEYS" "$FLOWER_KEYS"
  if [[ ! -s "$FLOWER_KEYS" ]]; then
    printf 'No local Jianying flower catalog identities found in %s\n' \
      "$DATABASE_ROOT" >&2
    exit 1
  fi
fi

JY_RUNTIME_ROOT="$RUNTIME_ROOT" "$SCRIPT_DIR/run-probe.sh" inspect \
  > "$EVIDENCE_ROOT/build.log" 2>&1
build_exit=$?
if [[ "$build_exit" -ne 0 || ! -x "$PROBE" ]]; then
  printf 'Probe build failed; see %s\n' "$EVIDENCE_ROOT/build.log" >&2
  exit "$build_exit"
fi

printf 'resource_id\tmd5\tpackage_type\tsegment_type\tscript_parameters_applied\tscript_text_applied\tscript_edit_mode\tpackage_path\trender_package_path\trender_types\tstrokes\tinner_shadows\tshadows\texit_code\tresult\tchanged_pixels\tnon_transparent_pixels\ttransparent_pixels\tcolored_pixels\trgba_sha256\n' \
  > "$RESULTS_TSV"

export DYLD_LIBRARY_PATH="$RUNTIME_ROOT/Frameworks:$SOURCE_APP_FRAMEWORKS${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
mkdir -p "$BASELINE_PACKAGE"
JY_TEXT_PACKAGE="$BASELINE_PACKAGE" \
  JY_TEXT_OUTPUT="$FRAME" \
  JY_TEXT_PAYLOAD_OUTPUT="$PAYLOAD" \
  JY_TEXT_CONTENT="$CONTENT" \
  JY_TEXT_FONT_PATH="$FONT_PATH" \
  JY_TEXT_FONT_SIZE="$FONT_SIZE" \
  JY_TEXT_TIMESTAMP="$TIMESTAMP" \
  JY_TEXT_SEGMENT_TYPE=3 \
  JY_VIDEO_WIDTH=512 \
  JY_VIDEO_HEIGHT=512 \
  "$PROBE" "$RUNTIME_ROOT" text-frame > "$EVIDENCE_ROOT/baseline.log" 2>&1
baseline_exit=$?
if [[ "$baseline_exit" -ne 0 || ! -f "$FRAME" ]]; then
  printf 'Baseline render failed; see %s\n' "$EVIDENCE_ROOT/baseline.log" >&2
  exit "$baseline_exit"
fi
baseline_sha256="$(shasum -a 256 "$FRAME" | awk '{print $1}')"
printf '%s\n' "$baseline_sha256" > "$BASELINE_HASH_FILE"
rm -f "$FRAME" "$PAYLOAD"

processed=0
while IFS= read -r package_path; do
  resource_id="$(basename -- "$(dirname -- "$package_path")")"
  md5="$(basename -- "$package_path")"
  if [[ "$FLOWER_ONLY" == "1" ]] && \
    ! grep -Fqx "$resource_id/$md5" "$FLOWER_KEYS"; then
    continue
  fi
  if ! jq -e --arg package_type "$PACKAGE_TYPE" \
    '.effect.Link[]? | select(.type == $package_type)' \
    "$package_path/config.json" > /dev/null; then
    continue
  fi
  if [[ "$LIMIT" -gt 0 && "$processed" -ge "$LIMIT" ]]; then
    break
  fi
  processed=$((processed + 1))

  log_path="$EVIDENCE_ROOT/current.log"
  render_types="$(jq -c '[.effect.Link[]?.type] | unique' "$package_path/config.json")"
  strokes=0
  inner_shadows=0
  shadows=0
  if [[ -f "$package_path/effectStyle.json" ]]; then
    render_types="$(jq -c '[.. | objects | .render_type? // empty] | unique' "$package_path/effectStyle.json")"
    strokes="$(jq -r '(.strokes // []) | length' "$package_path/effectStyle.json")"
    inner_shadows="$(jq -r '(.inner_shadows // []) | length' "$package_path/effectStyle.json")"
    shadows="$(jq -r '(.shadows // []) | length' "$package_path/effectStyle.json")"
  fi

  segment_type=3
  segment_payload=""
  script_parameters=""
  script_parameters_applied=0
  script_text_applied=0
  script_edit_mode="none"
  probe_content="$CONTENT"
  render_package_path="$package_path"
  if [[ "$PACKAGE_TYPE" == "ScriptInfoSticker" ]]; then
    segment_type=10
    probe_content=""
    if [[ -n "$SCRIPT_TEXT" ]]; then
      script_text_applied=1
      script_edit_mode="$SCRIPT_EDIT_MODE"
      edited_script_content="$(
        jq -c --arg text "$SCRIPT_TEXT" '
          def replace_text_slots:
            . as $rich_text
            | [$rich_text | splits("\\[(?s:.*?)\\]")] as $parts
            | [$rich_text | scan("\\[(?s:.*?)\\]")] as $slots
            | ($text | explode | map([.] | implode)) as $characters
            | if ($slots | length) == 0 then
                $rich_text
              else
                reduce range(0; $slots | length) as $index (
                  $parts[0];
                  . + "[" +
                    (if $index == (($slots | length) - 1) then
                      if ($characters[$index:] | length) > 0 then
                        ($characters[$index:] | join(""))
                      else
                        " "
                      end
                    else
                      ($characters[$index] // " ")
                    end) +
                    "]" + $parts[$index + 1]
                )
              end;
          (.children[]
            | select(
                .type == "text" and
                (.text_params.richText | type == "string")
              )
            | .text_params.richText) |= replace_text_slots
        ' "$package_path/content.json"
      )"
      if [[ "$SCRIPT_EDIT_MODE" == "runtime" ]]; then
        script_parameters="$edited_script_content"
        script_parameters_applied=1
      else
        render_package_path="$PACKAGE_COPY_ROOT/$resource_id/$md5"
        mkdir -p "$(dirname -- "$render_package_path")"
        ditto "$package_path" "$render_package_path"
        edited_content="$render_package_path/content.edited.json"
        printf '%s\n' "$edited_script_content" > "$edited_content"
        mv "$edited_content" "$render_package_path/content.json"
      fi
    fi
    segment_payload="$(jq -cn --arg path "$render_package_path" '{path: $path}')"
  fi

  rm -f "$FRAME" "$PAYLOAD" "$log_path"
  JY_TEXT_PACKAGE="$render_package_path" \
    JY_TEXT_OUTPUT="$FRAME" \
    JY_TEXT_PAYLOAD_OUTPUT="$PAYLOAD" \
    JY_TEXT_CONTENT="$probe_content" \
    JY_TEXT_FONT_PATH="$FONT_PATH" \
    JY_TEXT_FONT_SIZE="$FONT_SIZE" \
    JY_TEXT_TIMESTAMP="$TIMESTAMP" \
    JY_TEXT_SEGMENT_TYPE="$segment_type" \
    JY_TEXT_SEGMENT_PAYLOAD="$segment_payload" \
    JY_TEXT_SCRIPT_PARAMETERS="$script_parameters" \
    JY_VIDEO_WIDTH=512 \
    JY_VIDEO_HEIGHT=512 \
    "$PROBE" "$RUNTIME_ROOT" text-frame > "$log_path" 2>&1
  probe_exit=$?

  metrics="$(sed -n 's/.*\[text\] changed=\([0-9][0-9]*\) nonTransparent=\([0-9][0-9]*\) transparent=\([0-9][0-9]*\) colored=\([0-9][0-9]*\).*/\1 \2 \3 \4/p' "$log_path" | tail -1)"
  read -r changed non_transparent transparent colored <<< "$metrics"
  changed="${changed:-0}"
  non_transparent="${non_transparent:-0}"
  transparent="${transparent:-0}"
  colored="${colored:-0}"

  result="error"
  rgba_sha256=""
  if [[ "$probe_exit" -eq 0 && -f "$FRAME" ]]; then
    rgba_sha256="$(shasum -a 256 "$FRAME" | awk '{print $1}')"
    if [[ "$rgba_sha256" == "$baseline_sha256" ]]; then
      result="fallback"
      mv "$log_path" "$LOG_DIR/$resource_id-$md5.log"
    else
      result="success"
      rm -f "$log_path"
    fi
  elif [[ "$probe_exit" -eq 10 ]]; then
    result="blank"
    mv "$log_path" "$LOG_DIR/$resource_id-$md5.log"
  else
    mv "$log_path" "$LOG_DIR/$resource_id-$md5.log"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$resource_id" "$md5" "$PACKAGE_TYPE" "$segment_type" \
    "$script_parameters_applied" "$script_text_applied" "$script_edit_mode" \
    "$package_path" "$render_package_path" \
    "$render_types" "$strokes" "$inner_shadows" "$shadows" \
    "$probe_exit" "$result" "$changed" "$non_transparent" \
    "$transparent" "$colored" "$rgba_sha256" \
    >> "$RESULTS_TSV"
  printf '[%d] %s/%s %s (%s pixels)\n' \
    "$processed" "$resource_id" "$md5" "$result" "$non_transparent"
done < <(
  find "$CACHE_ROOT" -mindepth 2 -maxdepth 2 -type d \
    -exec test -f '{}/config.json' ';' -print | sort
)

if [[ "$processed" -eq 0 ]]; then
  printf 'No %s packages matched the requested catalog scope\n' \
    "$PACKAGE_TYPE" >&2
  exit 3
fi

jq -R -s '
  split("\n")
  | .[1:]
  | map(select(length > 0) | split("\t"))
  | map({
      resourceId: .[0],
      md5: .[1],
      packageType: .[2],
      segmentType: (.[3] | tonumber),
      scriptParametersApplied: (.[4] == "1"),
      scriptTextApplied: (.[5] == "1"),
      scriptEditMode: .[6],
      packagePath: .[7],
      renderPackagePath: .[8],
      renderTypes: (.[9] | fromjson),
      strokes: (.[10] | tonumber),
      innerShadows: (.[11] | tonumber),
      shadows: (.[12] | tonumber),
      exitCode: (.[13] | tonumber),
      result: .[14],
      changedPixels: (.[15] | tonumber),
      nonTransparentPixels: (.[16] | tonumber),
      transparentPixels: (.[17] | tonumber),
      coloredPixels: (.[18] | tonumber),
      rgbaSha256: .[19]
    })
' "$RESULTS_TSV" > "$RESULTS_JSON"

rm -f "$FRAME" "$PAYLOAD" "$EVIDENCE_ROOT/current.log"
success_count="$(jq '[.[] | select(.result == "success")] | length' "$RESULTS_JSON")"
failure_count="$(jq '[.[] | select(.result != "success")] | length' "$RESULTS_JSON")"
printf 'Batch complete: %s success, %s failure\n' "$success_count" "$failure_count"
printf 'Evidence: %s\n' "$EVIDENCE_ROOT"

if [[ "$failure_count" -gt 0 ]]; then
  exit 2
fi
