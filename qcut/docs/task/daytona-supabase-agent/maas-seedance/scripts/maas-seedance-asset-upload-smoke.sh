#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVIDER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$PROVIDER_DIR" rev-parse --show-toplevel 2>/dev/null || true)"

RUN_ID="${RUN_ID:-$(date -u +"%Y-%m-%dT%H-%M-%SZ")}"
OUT_DIR="${OUT_DIR:-$PROVIDER_DIR/evidence/runs/$RUN_ID}"
BASE_URL="${MAAS_BASE_URL:-https://api.cloudwise.ai}"
PROJECT_NAME="${MAAS_PROJECT_NAME:-default}"
SHORT_ID="$(printf '%s' "$RUN_ID" | tail -c 25)"
GROUP_NAME="${MAAS_ASSET_GROUP_NAME:-qcut-smoke-$SHORT_ID}"
ASSET_NAME="${MAAS_ASSET_NAME:-qcut-face-$SHORT_ID}"
ASSET_DESCRIPTION="${MAAS_ASSET_DESCRIPTION:-QCut MaaS Seedance real-person upload smoke test}"
ASSET_URL="${MAAS_ASSET_URL:-}"
ASSET_IMAGE_PATH="${MAAS_ASSET_IMAGE_PATH:-}"
POLL_INTERVAL_SECONDS="${MAAS_ASSET_POLL_INTERVAL_SECONDS:-3}"
TIMEOUT_SECONDS="${MAAS_ASSET_TIMEOUT_SECONDS:-120}"

log() {
	printf '[maas-seedance-asset-upload] %s\n' "$*" >&2
}

read_api_key() {
	local env_file
	for env_file in "$PWD/.env" "$PROVIDER_DIR/.env" "$REPO_ROOT/.env" "$REPO_ROOT/qcut/.env"; do
		if [ -z "${MAAS_API_KEY:-}" ] && [ -n "$env_file" ] && [ -f "$env_file" ]; then
			set -a
			# shellcheck disable=SC1090
			source "$env_file"
			set +a
		fi
	done

	if [ -n "${MAAS_API_KEY:-}" ]; then
		printf '%s' "$MAAS_API_KEY"
		return
	fi

	log "Missing MAAS_API_KEY. Set MAAS_API_KEY before running a real Cloudwise MaaS asset test."
	exit 3
}

require_tool() {
	if ! command -v "$1" >/dev/null 2>&1; then
		log "Missing required tool: $1"
		exit 3
	fi
}

mime_type_for_path() {
	case "${1##*.}" in
		jpg | jpeg | JPG | JPEG) printf 'image/jpeg' ;;
		png | PNG) printf 'image/png' ;;
		webp | WEBP) printf 'image/webp' ;;
		*)
			log "Unsupported asset image extension: $1"
			exit 2
			;;
	esac
}

resolve_asset_url() {
	if [ -n "$ASSET_URL" ]; then
		printf '%s' "$ASSET_URL"
		return
	fi

	if [ -z "$ASSET_IMAGE_PATH" ]; then
		log "Set MAAS_ASSET_URL or MAAS_ASSET_IMAGE_PATH."
		exit 2
	fi

	if [ ! -f "$ASSET_IMAGE_PATH" ]; then
		log "Asset image not found: $ASSET_IMAGE_PATH"
		exit 2
	fi

	local mime base64_image
	mime="$(mime_type_for_path "$ASSET_IMAGE_PATH")"
	base64_image="$(base64 < "$ASSET_IMAGE_PATH" | tr -d '\n')"
	printf 'data:%s;base64,%s' "$mime" "$base64_image"
}

post_json() {
	local url="$1"
	local body_file="$2"
	local output_file="$3"
	local status_file="$4"
	local api_key="$5"

	curl -sS -X POST "$url" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $api_key" \
		-d @"$body_file" \
		-w '%{http_code}' \
		-o "$output_file" > "$status_file"
}

main() {
	require_tool curl
	require_tool jq

	local api_key asset_url
	api_key="$(read_api_key)"
	asset_url="$(resolve_asset_url)"
	mkdir -p "$OUT_DIR"

	local group_payload="$OUT_DIR/group-create-payload.json"
	local group_response="$OUT_DIR/group-create-response.json"
	local group_status_file="$OUT_DIR/group-create.http-status"
	jq -n \
		--arg name "$GROUP_NAME" \
		--arg description "QCut MaaS Seedance asset upload smoke group" \
		--arg projectName "$PROJECT_NAME" \
		'{name:$name, description:$description, projectName:$projectName}' \
		> "$group_payload"

	log "Creating asset group"
	post_json \
		"$BASE_URL/api/v1/assets/groups/create" \
		"$group_payload" \
		"$group_response" \
		"$group_status_file" \
		"$api_key"

	local group_status group_id
	group_status="$(cat "$group_status_file")"
	if [ "$group_status" -lt 200 ] || [ "$group_status" -ge 300 ]; then
		log "Group create failed with HTTP $group_status"
		jq -n --arg status failed --arg phase group_create --arg http_status "$group_status" --slurpfile response "$group_response" \
			'{status:$status, phase:$phase, http_status:($http_status|tonumber), response:$response[0]}' > "$OUT_DIR/result.json"
		exit 1
	fi

	group_id="$(jq -r '.data.id // .id // empty' "$group_response")"
	if [ -z "$group_id" ]; then
		log "Group create response did not include group id"
		jq -n --arg status failed --arg phase group_create --slurpfile response "$group_response" \
			'{status:$status, phase:$phase, response:$response[0]}' > "$OUT_DIR/result.json"
		exit 1
	fi
	log "Group id: $group_id"

	local asset_payload="$OUT_DIR/asset-create-payload.json"
	local asset_response="$OUT_DIR/asset-create-response.json"
	local asset_status_file="$OUT_DIR/asset-create.http-status"
	jq -n \
		--arg name "$ASSET_NAME" \
		--arg description "$ASSET_DESCRIPTION" \
		--arg groupId "$group_id" \
		--arg url "$asset_url" \
		'{name:$name, description:$description, groupId:$groupId, url:$url}' \
		> "$asset_payload"

	log "Creating asset"
	post_json \
		"$BASE_URL/api/v1/assets/create" \
		"$asset_payload" \
		"$asset_response" \
		"$asset_status_file" \
		"$api_key"

	local asset_status asset_id
	asset_status="$(cat "$asset_status_file")"
	if [ "$asset_status" -lt 200 ] || [ "$asset_status" -ge 300 ]; then
		log "Asset create failed with HTTP $asset_status"
		jq -n --arg status failed --arg phase asset_create --arg group_id "$group_id" --arg http_status "$asset_status" --slurpfile response "$asset_response" \
			'{status:$status, phase:$phase, group_id:$group_id, http_status:($http_status|tonumber), response:$response[0]}' > "$OUT_DIR/result.json"
		exit 1
	fi

	if jq -e '.error' "$asset_response" >/dev/null 2>&1; then
		log "Provider rejected asset create"
		jq -n --arg status blocked --arg phase asset_create --arg group_id "$group_id" --slurpfile response "$asset_response" \
			'{status:$status, phase:$phase, group_id:$group_id, response:$response[0]}' > "$OUT_DIR/result.json"
		exit 1
	fi

	asset_id="$(jq -r '.data.id // .id // empty' "$asset_response")"
	if [ -z "$asset_id" ]; then
		log "Asset create response did not include asset id"
		jq -n --arg status failed --arg phase asset_create --arg group_id "$group_id" --slurpfile response "$asset_response" \
			'{status:$status, phase:$phase, group_id:$group_id, response:$response[0]}' > "$OUT_DIR/result.json"
		exit 1
	fi
	log "Asset id: $asset_id"

	local get_payload="$OUT_DIR/asset-get-payload.json"
	local get_response="$OUT_DIR/asset-get-response.json"
	local get_status_file="$OUT_DIR/asset-get.http-status"
	jq -n --arg id "$asset_id" '{id:$id}' > "$get_payload"

	local started_at elapsed get_status asset_state
	started_at="$(date +%s)"
	while true; do
		post_json \
			"$BASE_URL/api/v1/assets/get" \
			"$get_payload" \
			"$get_response" \
			"$get_status_file" \
			"$api_key"

		get_status="$(cat "$get_status_file")"
		asset_state="$(jq -r '.data.Status // .data.status // empty' "$get_response")"
		log "Asset status: ${asset_state:-unknown}"

		if [ "$asset_state" = "Active" ]; then
			break
		fi

		if [ "$asset_state" = "Failed" ] || [ "$asset_state" = "Error" ]; then
			log "Asset reached terminal failure status: $asset_state"
			jq -n --arg status failed --arg phase asset_get --arg group_id "$group_id" --arg asset_id "$asset_id" --arg asset_state "$asset_state" --slurpfile response "$get_response" \
				'{status:$status, phase:$phase, group_id:$group_id, asset_id:$asset_id, asset_state:$asset_state, response:$response[0]}' > "$OUT_DIR/result.json"
			exit 1
		fi

		elapsed=$(($(date +%s) - started_at))
		if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
			log "Timed out waiting for asset to become Active"
			jq -n --arg status failed --arg phase asset_get_timeout --arg group_id "$group_id" --arg asset_id "$asset_id" --arg asset_state "$asset_state" --argjson elapsed "$elapsed" --slurpfile response "$get_response" \
				'{status:$status, phase:$phase, group_id:$group_id, asset_id:$asset_id, asset_state:$asset_state, elapsed_seconds:$elapsed, response:$response[0]}' > "$OUT_DIR/result.json"
			exit 1
		fi
		sleep "$POLL_INTERVAL_SECONDS"
	done

	jq -n \
		--arg status passed \
		--arg provider cloudwise-maas \
		--arg base_url "$BASE_URL" \
		--arg run_id "$RUN_ID" \
		--arg out_dir "$OUT_DIR" \
		--arg group_id "$group_id" \
		--arg asset_id "$asset_id" \
		--arg asset_state "$asset_state" \
		--arg get_http_status "$get_status" \
		--arg source_image "$ASSET_IMAGE_PATH" \
		--slurpfile group "$group_response" \
		--slurpfile asset "$asset_response" \
		--slurpfile asset_get "$get_response" \
		'{
			status:$status,
			provider:$provider,
			base_url:$base_url,
			run_id:$run_id,
			out_dir:$out_dir,
			group_id:$group_id,
			asset_id:$asset_id,
			asset_state:$asset_state,
			source_image:$source_image,
			get_http_status:($get_http_status|tonumber),
			group_response:$group[0],
			asset_response:$asset[0],
			asset_get_response:$asset_get[0]
		}' > "$OUT_DIR/result.json"

	log "MAAS_SEEDANCE_ASSET_UPLOAD_OK group_id=$group_id asset_id=$asset_id"
	log "result=$OUT_DIR/result.json"
}

main "$@"
