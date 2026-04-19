#!/usr/bin/env bash
# CLI e2e helpers — assertion primitives and project lifecycle utilities.
#
# Source this from each suite:
#   source "$(dirname "$0")/../lib.sh"
#
# Requirements on PATH: bun, qcut, jq, ffprobe (suite 02 only).

set -euo pipefail

: "${QCUT_API_HOST:=127.0.0.1}"
: "${QCUT_API_PORT:=8765}"
export QCUT_API_HOST QCUT_API_PORT

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RESET=$'\033[0m'

_pass_count=0
_fail_count=0
_current_suite=""

log_step() { printf "%s▶%s %s\n" "$YELLOW" "$RESET" "$*"; }
log_ok()   { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; _pass_count=$((_pass_count + 1)); }
log_fail() { printf "%s✗%s %s\n" "$RED" "$RESET" "$*"; _fail_count=$((_fail_count + 1)); }
log_skip() { printf "%s↷%s %s\n" "$YELLOW" "$RESET" "$*"; }

# Fail the suite immediately — bash `set -e` already does this, but an
# explicit exit gives us a stable line for the driver to report.
die() {
	log_fail "$*"
	exit 1
}

# Verify the editor HTTP server is reachable. Called from the driver so
# suites can assume connectivity.
assert_editor_reachable() {
	if ! qcut editor:health --json >/dev/null 2>&1; then
		die "editor not reachable at http://${QCUT_API_HOST}:${QCUT_API_PORT} — start it with: bun run electron:dev"
	fi
}

# Require a CLI tool on PATH. Used by suites with external deps (jq, ffprobe).
require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "required command not on PATH: $1"
}

# Every `qcut editor:*` response is wrapped as:
#   { "status": "ok", "data": { "schema_version": "1", "command": "...",
#     "data": <actual payload> }, "command_id": "...", "duration_ms": N }
# This helper extracts the inner payload; suites assert against its output.
# If the response is an error, prints the error body and dies.
unwrap() {
	local raw=$1
	local status
	status=$(jq -r '.status // empty' <<<"$raw")
	if [ "$status" = "error" ]; then
		die "CLI returned error: $(jq -r '.error // .code // .' <<<"$raw")"
	fi
	jq '.data.data' <<<"$raw"
}

# assert_json_eq <json-string> <jq-expr> <expected> <message>
assert_json_eq() {
	local actual
	actual=$(jq -r "$2" <<<"$1")
	if [ "$actual" = "$3" ]; then
		log_ok "$4 (got '$actual')"
	else
		die "$4 — expected '$3', got '$actual' (expr: $2)"
	fi
}

# assert_json_ge <json-string> <jq-expr> <expected-min> <message>
assert_json_ge() {
	local actual
	actual=$(jq -r "$2" <<<"$1")
	# jq returns numbers as JSON numbers; bash -ge works fine on those.
	if [ "$actual" -ge "$3" ] 2>/dev/null; then
		log_ok "$4 (got '$actual', min '$3')"
	else
		die "$4 — expected ≥ '$3', got '$actual' (expr: $2)"
	fi
}

# assert_json_truthy <json-string> <jq-expr> <message>
# Fails if jq returns "null", "false", or "" for the path.
assert_json_truthy() {
	local actual
	actual=$(jq -r "$2" <<<"$1")
	case "$actual" in
		null|false|"")
			die "$3 — path '$2' is falsy ('$actual')"
			;;
		*)
			log_ok "$3 ($2 = '$actual')"
			;;
	esac
}

# Wrap a block in a named project that is deleted on exit (even on failure).
# Usage:
#   with_project "suite-01-lifecycle" PID
#   qcut editor:timeline:add-element --project-id "$PID" …
#   end_project
_active_project_id=""
with_project() {
	local name=$1
	local outvar=$2
	local created inner pid
	created=$(qcut editor:project:create --new-name "$name" --json)
	inner=$(unwrap "$created")
	pid=$(jq -r '.projectId // .id // .project.id' <<<"$inner")
	[ -n "$pid" ] && [ "$pid" != "null" ] || die "project:create returned no id (inner: $inner)"
	_active_project_id=$pid
	# shellcheck disable=SC2034
	printf -v "$outvar" '%s' "$pid"
	log_step "created project '$name' → $pid"
	trap '_cleanup_active_project' EXIT
}

end_project() {
	_cleanup_active_project
	trap - EXIT
}

_cleanup_active_project() {
	local pid=$_active_project_id
	_active_project_id=""
	if [ -n "$pid" ]; then
		# --force needed: editor:project:delete is policy-gated.
		qcut editor:project:delete --project-id "$pid" --force --json >/dev/null 2>&1 || true
		log_step "cleaned up project $pid"
	fi
}

# Summary helper for the driver.
suite_summary() {
	printf "\n%s=== %s: %d passed, %d failed ===%s\n" \
		"$([ $_fail_count -eq 0 ] && printf '%s' "$GREEN" || printf '%s' "$RED")" \
		"$_current_suite" "$_pass_count" "$_fail_count" "$RESET"
	[ $_fail_count -eq 0 ]
}

suite_start() {
	_current_suite=$1
	_pass_count=0
	_fail_count=0
	printf "\n%s▸▸▸ %s ▸▸▸%s\n" "$YELLOW" "$_current_suite" "$RESET"
}
