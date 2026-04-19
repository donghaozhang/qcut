#!/usr/bin/env bash
# Orchestrates every CLI e2e suite. Stops on first failure.
#
# Usage:
#   bash apps/web/src/test/cli-e2e/run-all.sh
#   QCUT_API_PORT=8765 bash apps/web/src/test/cli-e2e/run-all.sh
#   bash apps/web/src/test/cli-e2e/run-all.sh 01 03    # run a subset

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

require_cmd qcut
require_cmd jq

assert_editor_reachable
log_ok "editor reachable at http://${QCUT_API_HOST}:${QCUT_API_PORT}"

# Pick which suites to run. No args = all. Args like "01 03" = those numbers only.
requested=("$@")
all_suites=(01-project-lifecycle 02-timeline-and-export 03-ui-panel-state 04-screen-recording)

should_run() {
	local name=$1
	[ ${#requested[@]} -eq 0 ] && return 0
	local prefix=${name%%-*}
	for req in "${requested[@]}"; do
		[ "$req" = "$prefix" ] && return 0
	done
	return 1
}

total_pass=0
total_fail=0
for suite in "${all_suites[@]}"; do
	if ! should_run "$suite"; then
		continue
	fi
	script="$SCRIPT_DIR/suites/$suite.sh"
	if [ ! -x "$script" ]; then
		chmod +x "$script" 2>/dev/null || true
	fi
	if bash "$script"; then
		total_pass=$((total_pass + 1))
	else
		total_fail=$((total_fail + 1))
	fi
done

printf "\n%sTOTAL: %d suites passed, %d suites failed%s\n" \
	"$([ $total_fail -eq 0 ] && printf '%s' "$GREEN" || printf '%s' "$RED")" \
	"$total_pass" "$total_fail" "$RESET"

[ $total_fail -eq 0 ]
