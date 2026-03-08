# Generative Media Skills — Dual Provider (MUAPI + FAL) Implementation Plan

> **Goal**: Modify the Generative Media Skills shell scripts to support both MUAPI and FAL.ai as providers. Users pick `--provider fal` or `--provider muapi` (or auto-detect based on which API key is set).

---

## Current Problem

Every core script hardcodes MUAPI:
- `MUAPI_BASE="https://api.muapi.ai/api/v1"` (8 scripts)
- Auth: `x-api-key: $MUAPI_KEY`
- Submit: `POST ${MUAPI_BASE}/${ENDPOINT}`
- Poll: `GET ${MUAPI_BASE}/predictions/{id}/result`
- Response: `{ status: "completed", outputs: [url] }`

FAL uses a completely different protocol:
- Base: `https://queue.fal.run` (async) / `https://fal.run` (sync)
- Auth: `Authorization: Key $FAL_KEY`
- Submit: `POST https://queue.fal.run/{endpoint}` → `{ request_id, status_url, response_url }`
- Poll: `GET /{endpoint}/requests/{id}/status` → `{ status: "COMPLETED"|"FAILED" }`
- Result: `GET /{endpoint}/requests/{id}` → `{ images: [{url}], video: {url} }`
- Status values: UPPERCASE (`COMPLETED`, `IN_PROGRESS`, `FAILED`)

Key differences:
| | MUAPI | FAL |
|---|---|---|
| Auth header | `x-api-key` | `Authorization: Key` |
| Status casing | `completed` | `COMPLETED` |
| Output format | `outputs: [url]` | `images: [{url}]` or `video: {url}` |
| Poll endpoint | `/predictions/{id}/result` | `/{endpoint}/requests/{id}/status` |
| Upload | `POST /upload_file` multipart | Two-step: initiate → PUT signed URL |
| Endpoint format | Short name (`flux-dev`) | Namespaced (`fal-ai/flux-dev`) |

---

## Architecture Decision

**Create a shared provider library** (`core/lib/provider.sh`) that all scripts source. This lib handles:
1. Provider detection / selection
2. Auth headers
3. URL building
4. File upload
5. Submit request
6. Polling
7. Response parsing (extract output URL)

Each core script stays focused on its domain logic (argument parsing, payload building). The provider lib handles everything provider-specific.

```
core/lib/provider.sh          ← NEW: shared provider abstraction
core/lib/fal-endpoints.json   ← NEW: MUAPI model name → FAL endpoint mapping
core/media/generate-image.sh  ← MODIFY: source provider.sh, remove hardcoded MUAPI
core/media/generate-video.sh  ← MODIFY: same
core/media/image-to-video.sh  ← MODIFY: same
core/media/create-music.sh    ← MODIFY: same (stays MUAPI-only, music not on FAL)
core/media/upload.sh          ← MODIFY: same
core/edit/edit-image.sh       ← MODIFY: same
core/edit/enhance-image.sh    ← MODIFY: same
core/edit/lipsync.sh          ← MODIFY: same (stays MUAPI-only)
core/edit/video-effects.sh    ← MODIFY: same
core/platform/setup.sh        ← MODIFY: manage both keys
core/platform/check-result.sh ← MODIFY: handle both polling formats
```

Library scripts (cinema-director, seedance-2, etc.) need **no changes** — they delegate to core scripts and pass through the `--provider` flag.

---

## Subtask Breakdown

### Subtask 1: Create `core/lib/provider.sh` — Shared Provider Library (~30 min)

**New file**: `.claude/skills/qcut-toolkit/Generative-Media-Skills/core/lib/provider.sh`

This is the key file. All other changes depend on it.

```bash
#!/bin/bash
# Provider abstraction for MUAPI and FAL.ai
# Source this file in any core script: source "$(dirname "$0")/../lib/provider.sh"

# --- Constants ---
MUAPI_BASE="https://api.muapi.ai/api/v1"
FAL_QUEUE_BASE="https://queue.fal.run"
FAL_STORAGE_INITIATE="https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3"

# --- Provider Detection ---
# Priority: --provider flag > auto-detect (whichever key is set)
detect_provider() {
    if [ -n "$PROVIDER" ]; then echo "$PROVIDER"; return; fi
    if [ -n "$FAL_KEY" ] && [ -n "$MUAPI_KEY" ]; then echo "fal"; return; fi  # FAL preferred when both set
    if [ -n "$FAL_KEY" ]; then echo "fal"; return; fi
    if [ -n "$MUAPI_KEY" ]; then echo "muapi"; return; fi
    echo "none"
}

# --- Auth ---
get_api_key() {
    local provider=$(detect_provider)
    case $provider in
        fal)   echo "$FAL_KEY" ;;
        muapi) echo "$MUAPI_KEY" ;;
    esac
}

build_auth_headers() {
    local provider=$(detect_provider)
    case $provider in
        fal)   echo "-H \"Authorization: Key $FAL_KEY\" -H \"Content-Type: application/json\"" ;;
        muapi) echo "-H \"x-api-key: $MUAPI_KEY\" -H \"Content-Type: application/json\"" ;;
    esac
}

# Returns headers as an array for use with curl
get_headers() {
    local provider=$(detect_provider)
    case $provider in
        fal)   HEADERS=(-H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json") ;;
        muapi) HEADERS=(-H "x-api-key: $MUAPI_KEY" -H "Content-Type: application/json") ;;
    esac
}

# --- Endpoint Resolution ---
# Maps a model name to the correct provider endpoint
resolve_endpoint() {
    local model="$1"
    local provider=$(detect_provider)
    local lib_dir="$(dirname "${BASH_SOURCE[0]}")"

    case $provider in
        fal)
            # Check fal-endpoints.json for mapping
            local fal_endpoint=$(jq -r ".[\"$model\"] // empty" "$lib_dir/fal-endpoints.json" 2>/dev/null)
            if [ -n "$fal_endpoint" ]; then
                echo "$fal_endpoint"
            else
                echo "fal-ai/$model"  # Default: prefix with fal-ai/
            fi
            ;;
        muapi)
            # Use schema_data.json (existing behavior)
            local schema="$lib_dir/../../schema_data.json"
            if [ -f "$schema" ]; then
                local ep=$(jq -r ".[] | select(.name == \"$model\") | .input_schema.schemas.input_data.endpoint_url" "$schema")
                echo "$ep"
            else
                echo "$model"
            fi
            ;;
    esac
}

# --- Submit Request ---
submit_request() {
    local endpoint="$1"
    local payload="$2"
    local provider=$(detect_provider)

    get_headers

    case $provider in
        fal)
            curl -s -X POST "${FAL_QUEUE_BASE}/${endpoint}" "${HEADERS[@]}" -d "$payload"
            ;;
        muapi)
            curl -s -X POST "${MUAPI_BASE}/${endpoint}" "${HEADERS[@]}" -d "$payload"
            ;;
    esac
}

# --- Extract Request ID ---
extract_request_id() {
    local response="$1"
    echo "$response" | jq -r '.request_id // empty'
}

# --- Poll for Result ---
# Returns the full result JSON when complete
poll_result() {
    local request_id="$1"
    local endpoint="$2"     # needed for FAL (endpoint is in the poll URL)
    local max_wait="${3:-600}"
    local poll_interval="${4:-5}"
    local json_only="${5:-false}"
    local provider=$(detect_provider)

    get_headers

    local elapsed=0
    local last_status=""

    while [ $elapsed -lt $max_wait ]; do
        sleep $poll_interval
        elapsed=$((elapsed + poll_interval))

        local result
        case $provider in
            fal)
                # FAL: check status first
                local status_json=$(curl -s "${FAL_QUEUE_BASE}/${endpoint}/requests/${request_id}/status" "${HEADERS[@]}")
                local status=$(echo "$status_json" | jq -r '.status // empty')

                if [ "$status" = "COMPLETED" ]; then
                    # Fetch full result
                    result=$(curl -s "${FAL_QUEUE_BASE}/${endpoint}/requests/${request_id}" "${HEADERS[@]}")
                    echo "$result"
                    return 0
                elif [ "$status" = "FAILED" ]; then
                    local err=$(echo "$status_json" | jq -r '.logs[-1].message // "Generation failed"')
                    echo "{\"status\":\"failed\",\"error\":\"$err\"}"
                    return 1
                fi

                if [ "$status" != "$last_status" ] && [ "$json_only" = false ]; then
                    echo "Status: $status (${elapsed}s)" >&2
                    last_status="$status"
                fi
                ;;
            muapi)
                result=$(curl -s -X GET "${MUAPI_BASE}/predictions/${request_id}/result" "${HEADERS[@]}")
                local status=$(echo "$result" | jq -r '.status // empty')

                if [ "$status" = "completed" ]; then
                    echo "$result"
                    return 0
                elif [ "$status" = "failed" ]; then
                    echo "$result"
                    return 1
                fi

                if [ "$status" != "$last_status" ] && [ "$json_only" = false ]; then
                    echo "Status: $status (${elapsed}s)" >&2
                    last_status="$status"
                fi
                ;;
        esac
    done

    echo "{\"status\":\"timeout\",\"error\":\"Timeout after ${max_wait}s\",\"request_id\":\"$request_id\"}"
    return 1
}

# --- Extract Output URL from Result ---
extract_output_url() {
    local result="$1"
    local media_type="${2:-auto}"  # image, video, audio, auto
    local provider=$(detect_provider)

    case $provider in
        fal)
            # FAL response shapes: { images: [{url}] }, { video: {url} }, { audio: {url} }
            local url=""
            if [ "$media_type" = "image" ] || [ "$media_type" = "auto" ]; then
                url=$(echo "$result" | jq -r '.images[0].url // empty' 2>/dev/null)
            fi
            if [ -z "$url" ] && ([ "$media_type" = "video" ] || [ "$media_type" = "auto" ]); then
                url=$(echo "$result" | jq -r '.video.url // empty' 2>/dev/null)
            fi
            if [ -z "$url" ] && ([ "$media_type" = "audio" ] || [ "$media_type" = "auto" ]); then
                url=$(echo "$result" | jq -r '.audio.url // empty' 2>/dev/null)
            fi
            # Fallback: try common fields
            if [ -z "$url" ]; then
                url=$(echo "$result" | jq -r '.output.url // .url // .data.url // empty' 2>/dev/null)
            fi
            echo "$url"
            ;;
        muapi)
            echo "$result" | jq -r '.outputs[0] // empty'
            ;;
    esac
}

# --- Upload File ---
upload_file() {
    local file_path="$1"
    local provider=$(detect_provider)

    if [ ! -f "$file_path" ]; then
        echo "Error: File not found: $file_path" >&2
        return 1
    fi

    case $provider in
        fal)
            # FAL two-step upload: initiate → PUT signed URL
            local filename=$(basename "$file_path")
            local ext="${filename##*.}"
            local content_type="application/octet-stream"
            case $ext in
                jpg|jpeg) content_type="image/jpeg" ;;
                png) content_type="image/png" ;;
                mp4) content_type="video/mp4" ;;
                mp3) content_type="audio/mpeg" ;;
                wav) content_type="audio/wav" ;;
                webp) content_type="image/webp" ;;
            esac

            local init_resp=$(curl -s -X POST "$FAL_STORAGE_INITIATE" \
                -H "Authorization: Key $FAL_KEY" \
                -H "Content-Type: application/json" \
                -d "{\"file_name\":\"$filename\",\"content_type\":\"$content_type\"}")

            local upload_url=$(echo "$init_resp" | jq -r '.upload_url // empty')
            local file_url=$(echo "$init_resp" | jq -r '.file_url // empty')

            if [ -z "$upload_url" ] || [ -z "$file_url" ]; then
                echo "Error: FAL upload initiate failed" >&2
                return 1
            fi

            curl -s -X PUT "$upload_url" -H "Content-Type: $content_type" --data-binary "@$file_path" >/dev/null
            echo "$file_url"
            ;;
        muapi)
            local resp=$(curl -s -X POST "${MUAPI_BASE}/upload_file" \
                -H "x-api-key: $MUAPI_KEY" \
                -F "file=@${file_path}")
            echo "$resp" | jq -r '.url // empty'
            ;;
    esac
}

# --- Validate Provider ---
validate_provider() {
    local provider=$(detect_provider)
    if [ "$provider" = "none" ]; then
        echo "Error: No API key set. Set FAL_KEY or MUAPI_KEY." >&2
        echo "  export FAL_KEY=your_fal_key" >&2
        echo "  export MUAPI_KEY=your_muapi_key" >&2
        echo "  Or run: bash core/platform/setup.sh --add-key fal YOUR_KEY" >&2
        exit 1
    fi
    [ "$JSON_ONLY" = false ] 2>/dev/null && echo "Provider: $provider" >&2 || true
}

# --- Download and View ---
download_and_view() {
    local url="$1"
    local default_ext="${2:-bin}"
    local json_only="${3:-false}"

    local ext="${url##*.}"
    [[ "$ext" == http* ]] || [ -z "$ext" ] && ext="$default_ext"
    # Strip query params from extension
    ext="${ext%%\?*}"

    local output_dir="$(dirname "${BASH_SOURCE[0]}")/../../media_outputs"
    mkdir -p "$output_dir"
    local temp_file="$output_dir/gen_$(date +%s).$ext"

    [ "$json_only" = false ] && echo "Downloading to $temp_file..." >&2
    curl -s -o "$temp_file" "$url"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "$temp_file"
    fi

    echo "$temp_file"
}

# --- Parse --provider flag ---
# Call this in the argument parsing loop of each script:
#   --provider) PROVIDER="$2"; shift 2 ;;
```

**Key design decisions:**
- Auto-detect: if both keys are set, FAL wins (it's the QCut default)
- `--provider muapi|fal` flag overrides auto-detect
- All functions use `detect_provider()` internally — no provider arg threading
- FAL endpoint resolution uses a static JSON map (Subtask 2) since FAL uses `fal-ai/` namespaced names vs MUAPI's short names

---

### Subtask 2: Create `core/lib/fal-endpoints.json` — Model Name Mapping (~15 min)

**New file**: `.claude/skills/qcut-toolkit/Generative-Media-Skills/core/lib/fal-endpoints.json`

Maps MUAPI model names to FAL endpoint paths for models available on both platforms.

```json
{
  "flux-dev": "fal-ai/flux/dev",
  "flux-pro": "fal-ai/flux-pro/v1.1",
  "flux-kontext-pro": "fal-ai/flux-kontext/pro/v1",
  "flux-kontext-max": "fal-ai/flux-kontext/max/v1",
  "nano-banana": "fal-ai/nano-banana",
  "nano-banana-pro": "fal-ai/nano-banana-pro",
  "veo3": "fal-ai/veo3",
  "veo3-fast": "fal-ai/veo3/fast",
  "kling-pro": "fal-ai/kling-video/v2.1/pro/image-to-video",
  "kling-master": "fal-ai/kling-video/v2.1/master/image-to-video",
  "kling-std": "fal-ai/kling-video/v2.1/standard/image-to-video",
  "minimax-pro": "fal-ai/minimax/hailuo-02/pro/text-to-video",
  "wan2": "fal-ai/wan/v2.1/image-to-video",
  "hidream": "fal-ai/hidream-i1-full",
  "upscaler": "fal-ai/creative-upscaler"
}
```

Models NOT on FAL (MUAPI-exclusive): `seedance-*`, `midjourney-*`, `suno-*`, lipsync models, most video effects. When a script tries to resolve a model not in this map, it falls back to `fal-ai/{model}` — which will fail at runtime with a clear FAL error message.

**Source**: Cross-reference with QCut's existing FAL registry at `electron/native-pipeline/registry-data/text-to-video.ts` and `text-to-image.ts` for correct FAL endpoint paths.

---

### Subtask 3: Modify `core/platform/setup.sh` — Manage Both Keys (~10 min)

**File**: `.claude/skills/qcut-toolkit/Generative-Media-Skills/core/platform/setup.sh`

**Changes:**
- Support `--add-key fal YOUR_KEY` and `--add-key muapi YOUR_KEY`
- `--show-config` displays both keys (masked)
- `--test` validates whichever key is set (or both)
- Update help text

```bash
# New usage:
#   bash setup.sh --add-key fal "your_fal_key"
#   bash setup.sh --add-key muapi "your_muapi_key"
#   bash setup.sh --show-config
#   bash setup.sh --test
```

---

### Subtask 4: Modify `core/platform/check-result.sh` — Dual Polling (~10 min)

**File**: `.claude/skills/qcut-toolkit/Generative-Media-Skills/core/platform/check-result.sh`

**Changes:**
- Source `core/lib/provider.sh`
- Add `--provider fal|muapi` flag
- For FAL: also requires `--endpoint` (FAL needs the endpoint in the poll URL)
- Replace hardcoded MUAPI polling with `poll_result()` from provider.sh

---

### Subtask 5: Modify Core Media Scripts (4 files, ~20 min)

Each script gets the same pattern of changes:

**Files:**
- `core/media/generate-image.sh`
- `core/media/generate-video.sh`
- `core/media/image-to-video.sh`
- `core/media/upload.sh`

**Changes per file:**

1. **Remove** hardcoded `MUAPI_BASE="https://api.muapi.ai/api/v1"`
2. **Add** `source "$(dirname "$0")/../lib/provider.sh"`
3. **Add** `--provider` to argument parser: `--provider) PROVIDER="$2"; shift 2 ;;`
4. **Replace** `if [ -z "$MUAPI_KEY" ]` check with `validate_provider`
5. **Replace** `HEADERS=(-H "x-api-key: ...")` with `get_headers`
6. **Replace** endpoint resolution with `resolve_endpoint "$MODEL"`
7. **Replace** `curl -s -X POST "${MUAPI_BASE}/..."` with `submit_request "$ENDPOINT" "$PAYLOAD"`
8. **Replace** polling loop with `RESULT=$(poll_result "$REQUEST_ID" "$ENDPOINT" "$MAX_WAIT" "$POLL_INTERVAL" "$JSON_ONLY")`
9. **Replace** `jq -r '.outputs[0]'` with `extract_output_url "$RESULT" "image"` (or `"video"`)
10. **Replace** `upload_file()` local function with call to provider.sh's `upload_file()`
11. **Replace** download/view block with `download_and_view "$URL" "jpg" "$JSON_ONLY"`
12. **Update** help text: add `--provider fal|muapi` option, update header

**`create-music.sh`** — special case: Suno is MUAPI-exclusive. Add provider.sh source but note in help that `--provider fal` is not supported for music. Script should error if `--provider fal` is used:
```bash
if [ "$(detect_provider)" = "fal" ]; then
    echo "Error: Music generation requires MUAPI (Suno). Set MUAPI_KEY or use --provider muapi" >&2
    exit 1
fi
```

**Example: generate-image.sh after modification (key sections):**

```bash
#!/bin/bash
# Text-to-Image Generation (MUAPI + FAL)
set -e

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/../lib/provider.sh"

PROMPT=""
MODEL="flux-dev"
PROVIDER=""  # auto-detect
# ... rest of defaults ...

while [[ $# -gt 0 ]]; do
    case $1 in
        --provider) PROVIDER="$2"; shift 2 ;;
        --prompt|-p) PROMPT="$2"; shift 2 ;;
        # ... rest unchanged ...
    esac
done

validate_provider
if [ -z "$PROMPT" ]; then echo "Error: --prompt is required" >&2; exit 1; fi

ENDPOINT=$(resolve_endpoint "$MODEL")
# ... build PAYLOAD (unchanged) ...

[ "$JSON_ONLY" = false ] && echo "Submitting to $ENDPOINT ($(detect_provider))..." >&2
SUBMIT=$(submit_request "$ENDPOINT" "$PAYLOAD")

# Error check
if echo "$SUBMIT" | jq -e '.error // .detail' >/dev/null 2>&1; then
    echo "Error: $(echo "$SUBMIT" | jq -r '.error // .detail')" >&2; exit 1
fi

REQUEST_ID=$(extract_request_id "$SUBMIT")
if [ "$ASYNC" = true ]; then echo "$SUBMIT"; exit 0; fi

RESULT=$(poll_result "$REQUEST_ID" "$ENDPOINT" "$MAX_WAIT" "$POLL_INTERVAL" "$JSON_ONLY")
URL=$(extract_output_url "$RESULT" "image")

[ "$JSON_ONLY" = false ] && echo "Success! URL: $URL" >&2
[ "$VIEW" = true ] && download_and_view "$URL" "jpg" "$JSON_ONLY"
echo "$RESULT"
```

---

### Subtask 6: Modify Core Edit Scripts (4 files, ~15 min)

**Files:**
- `core/edit/edit-image.sh`
- `core/edit/enhance-image.sh`
- `core/edit/lipsync.sh`
- `core/edit/video-effects.sh`

Same pattern as Subtask 5. Additionally:

- **`lipsync.sh`** — MUAPI-exclusive (Sync Labs, LatentSync, Creatify, Veed not on FAL). Add provider guard same as `create-music.sh`.
- **`video-effects.sh`** — Most effects are MUAPI-exclusive. Add provider guard. Some individual effects may work on FAL (check `fal-endpoints.json`).
- **`edit-image.sh`** — Flux Kontext is on both FAL and MUAPI. GPT-4o editing and Midjourney are MUAPI-only.
- **`enhance-image.sh`** — Upscaler is on FAL (`fal-ai/creative-upscaler`). Background removal is on FAL (`fal-ai/birefnet`). Face swap and colorize are MUAPI-only.

For edit scripts with mixed availability, the script should check `fal-endpoints.json` at runtime and error if the specific model/operation isn't available on the selected provider.

---

### Subtask 7: Update Library Scripts — Pass Through `--provider` (~5 min)

**Files:**
- `library/motion/cinema-director/scripts/generate-film.sh`
- `library/motion/seedance-2/scripts/generate-seedance.sh`
- `library/visual/logo-creator/scripts/create-logo.sh`
- `library/visual/nano-banana/scripts/generate-nano-art.sh`
- `library/visual/ui-design/scripts/generate-mockup.sh`

These scripts wrap core scripts. Changes:

1. Add `--provider` to argument parser
2. Pass `$PROVIDER_FLAG` through to the core script call

Example for `generate-film.sh`:
```bash
PROVIDER_FLAG=""
# In arg parser:
--provider) PROVIDER_FLAG="--provider $2"; shift 2 ;;

# In core script call:
bash "$CORE_SCRIPT" --prompt "$DIRECTOR_PROMPT" --model "$MODEL" $PROVIDER_FLAG $AUDIO_FLAG $VIEW_FLAG --async --json
```

**Note:** `seedance-2` is MUAPI-exclusive. Its script should warn if `--provider fal` is used.

---

### Subtask 8: Update SKILL.md Documentation (~10 min)

**Files:**
- `core/media/SKILL.md`
- `core/edit/SKILL.md`
- `core/platform/SKILL.md`
- `library/motion/cinema-director/SKILL.md`
- `library/motion/seedance-2/SKILL.md`
- `library/visual/*/SKILL.md`
- `README.md`

**Changes:**
- Document `--provider fal|muapi` flag
- Note auto-detection behavior (FAL preferred when both keys set)
- List which models are available on which provider
- Update setup instructions: `bash setup.sh --add-key fal YOUR_KEY`
- Update examples to show provider flag
- Add "Provider Availability" table to each skill

---

### Subtask 9: Tests (~15 min)

**New file**: `.claude/skills/qcut-toolkit/Generative-Media-Skills/tests/test-provider.sh`

Manual test script:

```bash
#!/bin/bash
# Test provider abstraction without hitting real APIs
# Uses --json + --async to verify payload construction and provider routing

set -e
SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/core/lib/provider.sh"

echo "=== Provider Detection Tests ==="

# Test 1: No keys → error
unset FAL_KEY MUAPI_KEY
result=$(detect_provider)
[ "$result" = "none" ] && echo "PASS: No keys → none" || echo "FAIL: Expected none, got $result"

# Test 2: MUAPI only
export MUAPI_KEY="test_muapi"
unset FAL_KEY
result=$(detect_provider)
[ "$result" = "muapi" ] && echo "PASS: MUAPI only → muapi" || echo "FAIL: Expected muapi, got $result"

# Test 3: FAL only
unset MUAPI_KEY
export FAL_KEY="test_fal"
result=$(detect_provider)
[ "$result" = "fal" ] && echo "PASS: FAL only → fal" || echo "FAIL: Expected fal, got $result"

# Test 4: Both keys → FAL preferred
export MUAPI_KEY="test_muapi"
export FAL_KEY="test_fal"
result=$(detect_provider)
[ "$result" = "fal" ] && echo "PASS: Both → fal preferred" || echo "FAIL: Expected fal, got $result"

# Test 5: --provider override
PROVIDER="muapi"
result=$(detect_provider)
[ "$result" = "muapi" ] && echo "PASS: Override → muapi" || echo "FAIL: Expected muapi, got $result"
unset PROVIDER

echo ""
echo "=== Endpoint Resolution Tests ==="

# Test 6: FAL endpoint mapping
export FAL_KEY="test"
unset MUAPI_KEY
result=$(resolve_endpoint "flux-dev")
[ "$result" = "fal-ai/flux/dev" ] && echo "PASS: flux-dev → fal-ai/flux/dev" || echo "FAIL: Got $result"

# Test 7: Unknown model falls back to fal-ai/ prefix
result=$(resolve_endpoint "unknown-model")
[ "$result" = "fal-ai/unknown-model" ] && echo "PASS: unknown → fal-ai/unknown-model" || echo "FAIL: Got $result"

echo ""
echo "=== Output URL Extraction Tests ==="

# Test 8: FAL image response
result=$(extract_output_url '{"images":[{"url":"https://fal.ai/img.png"}]}' "image")
[ "$result" = "https://fal.ai/img.png" ] && echo "PASS: FAL image extraction" || echo "FAIL: Got $result"

# Test 9: FAL video response
result=$(extract_output_url '{"video":{"url":"https://fal.ai/vid.mp4"}}' "video")
[ "$result" = "https://fal.ai/vid.mp4" ] && echo "PASS: FAL video extraction" || echo "FAIL: Got $result"

# Test 10: MUAPI response
unset FAL_KEY
export MUAPI_KEY="test"
result=$(extract_output_url '{"outputs":["https://muapi.ai/out.mp4"]}' "video")
[ "$result" = "https://muapi.ai/out.mp4" ] && echo "PASS: MUAPI output extraction" || echo "FAIL: Got $result"

echo ""
echo "All tests complete."
```

---

## File Summary

| File | Action | Subtask |
|:-----|:-------|:--------|
| `core/lib/provider.sh` | **New** | 1 |
| `core/lib/fal-endpoints.json` | **New** | 2 |
| `core/platform/setup.sh` | Modify | 3 |
| `core/platform/check-result.sh` | Modify | 4 |
| `core/media/generate-image.sh` | Modify | 5 |
| `core/media/generate-video.sh` | Modify | 5 |
| `core/media/image-to-video.sh` | Modify | 5 |
| `core/media/create-music.sh` | Modify | 5 |
| `core/media/upload.sh` | Modify | 5 |
| `core/edit/edit-image.sh` | Modify | 6 |
| `core/edit/enhance-image.sh` | Modify | 6 |
| `core/edit/lipsync.sh` | Modify | 6 |
| `core/edit/video-effects.sh` | Modify | 6 |
| `library/motion/cinema-director/scripts/generate-film.sh` | Modify | 7 |
| `library/motion/seedance-2/scripts/generate-seedance.sh` | Modify | 7 |
| `library/visual/logo-creator/scripts/create-logo.sh` | Modify | 7 |
| `library/visual/nano-banana/scripts/generate-nano-art.sh` | Modify | 7 |
| `library/visual/ui-design/scripts/generate-mockup.sh` | Modify | 7 |
| `README.md` + all `SKILL.md` files | Modify | 8 |
| `tests/test-provider.sh` | **New** | 9 |

---

## Execution Order

```
Subtask 1 (provider.sh)  ───► foundation, everything depends on this
Subtask 2 (fal-endpoints) ─► can be parallel with 1
         │
         ▼
Subtask 3 (setup.sh)     ──┐
Subtask 4 (check-result)  ──┤── all depend on provider.sh
Subtask 5 (core/media)    ──┤
Subtask 6 (core/edit)     ──┘
         │
         ▼
Subtask 7 (library pass-through) ── depends on core scripts working
         │
         ▼
Subtask 8 (docs)   ──┐
Subtask 9 (tests)  ──┘── can be parallel, do last
```

**Total estimated scope**: ~130 min

---

## Provider Availability Matrix

| Model | MUAPI | FAL | Notes |
|:------|:-----:|:---:|:------|
| Flux Dev/Pro | Yes | Yes | FAL preferred (native) |
| Flux Kontext Pro/Max | Yes | Yes | Both work |
| Nano-Banana | Yes | Yes | FAL native |
| Veo3 / Veo3 Fast | Yes | Yes | Both via queue |
| Kling 2.1/3.0 | Yes | Yes | Both work |
| MiniMax Hailuo | Yes | Yes | Both work |
| WAN 2.1 | Yes | Yes | Both work |
| HiDream | Yes | Yes | FAL native |
| **Seedance 2.0** | Yes | **No** | MUAPI-exclusive |
| **Midjourney v7** | Yes | **No** | MUAPI-exclusive |
| **Suno V5 Music** | Yes | **No** | MUAPI-exclusive |
| **Lipsync (Sync Labs)** | Yes | **No** | MUAPI-exclusive |
| **Video Effects (dance, face-swap)** | Yes | **No** | MUAPI-exclusive |
| **GPT-4o Image Edit** | Yes | **No** | MUAPI-exclusive |
| Creative Upscaler | Yes | Yes | FAL native |
| Background Removal | Yes | Yes | FAL has BiRefNet |

---

## Design Principles

1. **Zero breaking changes** — Existing MUAPI-only usage works identically. `MUAPI_KEY` set → same behavior as before.
2. **Auto-detect over configuration** — If only one key is set, use that provider. No need to specify `--provider` in the common case.
3. **Graceful MUAPI-exclusive errors** — Scripts that only work on MUAPI (music, lipsync) give clear error messages when FAL is selected.
4. **Library scripts are transparent** — They just pass `--provider` through. The intent mapping layer stays provider-agnostic.
5. **One source of truth for FAL endpoints** — `fal-endpoints.json` is the single mapping file. Easy to update when FAL adds models.
