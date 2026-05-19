#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVIDER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$PROVIDER_DIR" rev-parse --show-toplevel 2>/dev/null || true)"

RUN_ID="${RUN_ID:-$(date -u +"%Y-%m-%dT%H-%M-%SZ")}"
OUT_DIR="${OUT_DIR:-$PROVIDER_DIR/evidence/runs/$RUN_ID}"
BASE_URL="${MAAS_BASE_URL:-https://api.cloudwise.ai}"
MODEL="${MAAS_MODEL:-dreamina-seedance-2-0-260128}"
PROMPT="${MAAS_PROMPT:-A concise cinematic shot of a glass cube on a white table, soft daylight, slow camera push.}"
RATIO="${MAAS_RATIO:-16:9}"
DURATION="${MAAS_DURATION:-11}"
GENERATE_AUDIO="${MAAS_GENERATE_AUDIO:-false}"
WATERMARK="${MAAS_WATERMARK:-false}"
POLL_INTERVAL_SECONDS="${MAAS_POLL_INTERVAL_SECONDS:-10}"
TIMEOUT_SECONDS="${MAAS_TIMEOUT_SECONDS:-900}"
REFERENCE_IMAGE_PATH="${MAAS_REFERENCE_IMAGE_PATH:-}"
REFERENCE_IMAGE_URL="${MAAS_REFERENCE_IMAGE_URL:-}"
REFERENCE_IMAGE_ROLE="${MAAS_REFERENCE_IMAGE_ROLE:-reference_image}"

SUBMIT_JSON="$OUT_DIR/submit-response.json"
STATUS_JSON="$OUT_DIR/status-response.json"
PAYLOAD_JSON="$OUT_DIR/request-payload.json"
RESULT_JSON="$OUT_DIR/result.json"
VIDEO_PATH="$OUT_DIR/maas-seedance.mp4"
FFPROBE_JSON="$OUT_DIR/ffprobe.json"

log() {
	printf '[maas-seedance-smoke] %s\n' "$*" >&2
}

json_bool() {
	case "$1" in
		true | TRUE | 1 | yes | YES) printf 'true' ;;
		false | FALSE | 0 | no | NO) printf 'false' ;;
		*)
			log "Invalid boolean value: $1"
			exit 2
			;;
	esac
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

	if [ "${MAAS_ALLOW_SEEDANCE_2_0_API_FALLBACK:-false}" = "true" ] && [ -n "${SEEDANCE_2_0_API:-}" ]; then
		log "Using SEEDANCE_2_0_API as an explicit fallback for this MaaS smoke run."
		printf '%s' "$SEEDANCE_2_0_API"
		return
	fi

	log "Missing MAAS_API_KEY. Set MAAS_API_KEY before running a real Cloudwise MaaS test."
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
			log "Unsupported reference image extension: $1"
			exit 2
			;;
	esac
}

build_payload() {
	local generate_audio_json="$1"
	local watermark_json="$2"

	if [ -z "$REFERENCE_IMAGE_PATH" ] && [ -z "$REFERENCE_IMAGE_URL" ]; then
		jq -n \
			--arg model "$MODEL" \
			--arg prompt "$PROMPT" \
			--arg ratio "$RATIO" \
			--argjson duration "$DURATION" \
			--argjson generate_audio "$generate_audio_json" \
			--argjson watermark "$watermark_json" \
			'{
				model: $model,
				content: [{type: "text", text: $prompt}],
				generate_audio: $generate_audio,
				ratio: $ratio,
				duration: $duration,
				watermark: $watermark
			}' > "$PAYLOAD_JSON"
		return
	fi

	if [ -n "$REFERENCE_IMAGE_URL" ]; then
		jq -n \
			--arg model "$MODEL" \
			--arg prompt "$PROMPT" \
			--arg ratio "$RATIO" \
			--arg role "$REFERENCE_IMAGE_ROLE" \
			--arg image_url "$REFERENCE_IMAGE_URL" \
			--argjson duration "$DURATION" \
			--argjson generate_audio "$generate_audio_json" \
			--argjson watermark "$watermark_json" \
			'{
				model: $model,
				content: [
					{type: "text", text: $prompt},
					{type: "image_url", image_url: {url: $image_url}, role: $role}
				],
				generate_audio: $generate_audio,
				ratio: $ratio,
				duration: $duration,
				watermark: $watermark,
				_qcut_evidence: {reference_image_url: $image_url, reference_transport: "url"}
			}' > "$PAYLOAD_JSON"
		return
	fi

	if [ ! -f "$REFERENCE_IMAGE_PATH" ]; then
		log "Reference image not found: $REFERENCE_IMAGE_PATH"
		exit 2
	fi

	local mime base64_image data_uri
	mime="$(mime_type_for_path "$REFERENCE_IMAGE_PATH")"
	base64_image="$(base64 < "$REFERENCE_IMAGE_PATH" | tr -d '\n')"
	data_uri="data:${mime};base64,${base64_image}"

	jq -n \
		--arg model "$MODEL" \
		--arg prompt "$PROMPT" \
		--arg ratio "$RATIO" \
		--arg role "$REFERENCE_IMAGE_ROLE" \
		--arg image_url "$data_uri" \
		--arg reference_image "$(basename "$REFERENCE_IMAGE_PATH")" \
		--argjson duration "$DURATION" \
		--argjson generate_audio "$generate_audio_json" \
		--argjson watermark "$watermark_json" \
		'{
			model: $model,
			content: [
				{type: "text", text: $prompt},
				{type: "image_url", image_url: {url: $image_url}, role: $role}
			],
			generate_audio: $generate_audio,
			ratio: $ratio,
			duration: $duration,
			watermark: $watermark,
			_qcut_evidence: {reference_image: $reference_image, reference_transport: "data_uri"}
		}' > "$PAYLOAD_JSON"
}

write_http_response() {
	local method="$1"
	local url="$2"
	local body_file="$3"
	local output_file="$4"
	local status_file="$5"
	local api_key="$6"

	if [ -n "$body_file" ]; then
		curl -sS -X "$method" "$url" \
			-H "Content-Type: application/json" \
			-H "Authorization: Bearer $api_key" \
			-d @"$body_file" \
			-w '%{http_code}' \
			-o "$output_file" > "$status_file"
		return
	fi

	curl -sS -X "$method" "$url" \
		-H "Authorization: Bearer $api_key" \
		-w '%{http_code}' \
		-o "$output_file" > "$status_file"
}

assert_http_ok() {
	local status="$1"
	local label="$2"
	local body_file="$3"

	if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
		return
	fi

	jq -n \
		--arg status "failed" \
		--arg phase "$label" \
		--arg http_status "$status" \
		--arg body_preview "$(head -c 800 "$body_file")" \
		'{status:$status, phase:$phase, http_status:($http_status|tonumber), body_preview:$body_preview}' \
		> "$RESULT_JSON"
	log "$label failed with HTTP $status"
	exit 1
}

main() {
	require_tool curl
	require_tool jq
	require_tool ffprobe

	local api_key
	api_key="$(read_api_key)"
	mkdir -p "$OUT_DIR"

	local generate_audio_json watermark_json
	generate_audio_json="$(json_bool "$GENERATE_AUDIO")"
	watermark_json="$(json_bool "$WATERMARK")"

	build_payload "$generate_audio_json" "$watermark_json"

	log "Submitting MaaS Seedance task model=$MODEL duration=$DURATION ratio=$RATIO reference_image=${REFERENCE_IMAGE_PATH:-${REFERENCE_IMAGE_URL:-none}} out=$OUT_DIR"
	local submit_status_file="$OUT_DIR/submit.http-status"
	write_http_response \
		POST \
		"$BASE_URL/api/v1/aiproducts/video/seedance" \
		"$PAYLOAD_JSON" \
		"$SUBMIT_JSON" \
		"$submit_status_file" \
		"$api_key"

	local submit_status task_id
	submit_status="$(cat "$submit_status_file")"
	assert_http_ok "$submit_status" "submit" "$SUBMIT_JSON"
	if jq -e '.error' "$SUBMIT_JSON" >/dev/null 2>&1; then
		log "Provider rejected submit: $(jq -r '.error.code // .error.message // "provider_error"' "$SUBMIT_JSON")"
		jq -n \
			--arg status blocked \
			--arg phase submit \
			--slurpfile response "$SUBMIT_JSON" \
			'{status:$status, phase:$phase, response:$response[0]}' > "$RESULT_JSON"
		exit 1
	fi
	task_id="$(jq -r '.id // empty' "$SUBMIT_JSON")"
	if [ -z "$task_id" ]; then
		log "Submit response did not include .id"
		jq -n --arg status failed --arg phase submit --slurpfile response "$SUBMIT_JSON" \
			'{status:$status, phase:$phase, response:$response[0]}' > "$RESULT_JSON"
		exit 1
	fi
	log "Task id: $task_id"

	local started_at now elapsed status poll_status_file video_url
	started_at="$(date +%s)"
	poll_status_file="$OUT_DIR/poll.http-status"

	while true; do
		write_http_response \
			GET \
			"$BASE_URL/api/v1/aiproducts/video/seedance/tasks/$task_id" \
			"" \
			"$STATUS_JSON" \
			"$poll_status_file" \
			"$api_key"

		local poll_status
		poll_status="$(cat "$poll_status_file")"
		assert_http_ok "$poll_status" "poll" "$STATUS_JSON"

		status="$(jq -r '.status // empty' "$STATUS_JSON")"
		log "Provider status: ${status:-unknown}"

		if [ "$status" = "succeeded" ]; then
			video_url="$(jq -r '.content.video_url // empty' "$STATUS_JSON")"
			if [ -z "$video_url" ]; then
				log "Succeeded response did not include .content.video_url"
				jq -n --arg status failed --arg phase output_url --slurpfile response "$STATUS_JSON" \
					'{status:$status, phase:$phase, response:$response[0]}' > "$RESULT_JSON"
				exit 1
			fi
			break
		fi

		case "$status" in
			failed | error | cancelled | expired)
				log "Provider task reached terminal failure status: $status"
				jq -n \
					--arg status failed \
					--arg phase provider_task \
					--arg provider_status "$status" \
					--arg task_id "$task_id" \
					--slurpfile response "$STATUS_JSON" \
					'{status:$status, phase:$phase, task_id:$task_id, provider_status:$provider_status, response:$response[0]}' \
					> "$RESULT_JSON"
				exit 1
				;;
		esac

		now="$(date +%s)"
		elapsed=$((now - started_at))
		if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
			log "Timed out after ${TIMEOUT_SECONDS}s"
			jq -n \
				--arg status failed \
				--arg phase timeout \
				--arg task_id "$task_id" \
				--argjson elapsed "$elapsed" \
				--slurpfile response "$STATUS_JSON" \
				'{status:$status, phase:$phase, task_id:$task_id, elapsed_seconds:$elapsed, response:$response[0]}' \
				> "$RESULT_JSON"
			exit 1
		fi
		sleep "$POLL_INTERVAL_SECONDS"
	done

	log "Downloading video"
	curl -fL "$video_url" -o "$VIDEO_PATH"
	if [ ! -s "$VIDEO_PATH" ]; then
		log "Downloaded video is empty"
		exit 1
	fi

	ffprobe -v error \
		-show_entries format=duration,size:stream=codec_type,codec_name,width,height \
		-of json \
		"$VIDEO_PATH" > "$FFPROBE_JSON"

	local finished_at
	finished_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
	jq -n \
		--arg status passed \
		--arg provider cloudwise-maas \
		--arg base_url "$BASE_URL" \
		--arg model "$MODEL" \
		--arg task_id "$task_id" \
		--arg run_id "$RUN_ID" \
		--arg out_dir "$OUT_DIR" \
		--arg video "$VIDEO_PATH" \
		--arg reference_image "${REFERENCE_IMAGE_PATH:-$REFERENCE_IMAGE_URL}" \
		--arg finished_at "$finished_at" \
		--slurpfile submit "$SUBMIT_JSON" \
		--slurpfile response "$STATUS_JSON" \
		--slurpfile ffprobe "$FFPROBE_JSON" \
		'{
			status: $status,
			provider: $provider,
			base_url: $base_url,
			model: $model,
			task_id: $task_id,
			run_id: $run_id,
			out_dir: $out_dir,
			video: $video,
			reference_image: $reference_image,
			finished_at: $finished_at,
			submit_response: $submit[0],
			provider_response: $response[0],
			ffprobe: $ffprobe[0]
		}' > "$RESULT_JSON"

	log "MAAS_SEEDANCE_SMOKE_OK task_id=$task_id video=$VIDEO_PATH"
	log "result=$RESULT_JSON"
}

main "$@"
