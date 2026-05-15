#!/usr/bin/env bash
#
# Container entrypoint: materialize ~/.qcut/.env from injected env vars,
# then exec the requested CMD (default `bash`). Workspace secrets arrive
# as plain env vars (set by the agent worker / Spawn Edge Function); we
# project them onto the file format that key-manager.ts expects.
#
# Key list MUST stay in sync with KEY_NAMES in
# electron/native-pipeline/infra/key-manager.ts.

set -euo pipefail

ENV_DIR="${HOME}/.qcut"
ENV_FILE="${ENV_DIR}/.env"
CODEX_DIR="${CODEX_HOME:-${HOME}/.codex}"
CODEX_AUTH_FILE="${CODEX_DIR}/auth.json"

mkdir -p "${ENV_DIR}"
chmod 0700 "${ENV_DIR}"

# Allow-list (mirrors key-manager.ts KEY_NAMES). Drift-safe: adding a new
# key here without adding it to KEY_NAMES is harmless; the reverse is also
# OK — qcut will just read process.env directly via the env tier.
ALLOWED_KEYS=(
  FAL_KEY
  FREESOUND_API_KEY
  GEMINI_API_KEY
  GOOGLE_AI_API_KEY
  OPENROUTER_API_KEY
  ANTHROPIC_API_KEY
  ELEVENLABS_API_KEY
  OPENAI_API_KEY
  RUNWAY_API_KEY
  HEYGEN_API_KEY
  DID_API_KEY
  SYNTHESIA_API_KEY
  ARK_API_KEY
  GMI_API_KEY
  IMAROUTER_API_KEY
  QCUT_AUTH_TOKEN
)

# Always rewrite the file so a stale prior session can't leak. Plain
# overwrite — not append.
: > "${ENV_FILE}"
for key in "${ALLOWED_KEYS[@]}"; do
  value="${!key:-}"
  if [[ -n "${value}" ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
done
chmod 0600 "${ENV_FILE}"

bootstrap_codex_auth() {
  mkdir -p "${CODEX_DIR}"
  chmod 0700 "${CODEX_DIR}"

  if [[ -n "${CODEX_AUTH_JSON:-}" ]]; then
    printf '%s' "${CODEX_AUTH_JSON}" | jq -e . >/dev/null
    printf '%s' "${CODEX_AUTH_JSON}" > "${CODEX_AUTH_FILE}"
    chmod 0600 "${CODEX_AUTH_FILE}"
    return
  fi

  if [[ -n "${OPENAI_API_KEY:-}" && "${QCUT_BOOTSTRAP_CODEX:-}" == "1" ]]; then
    printf '%s' "${OPENAI_API_KEY}" | codex login --with-api-key >/dev/null
  fi
}

bootstrap_codex_auth "$@"

# If no command was provided, fall through to bash (interactive shell).
exec "$@"
