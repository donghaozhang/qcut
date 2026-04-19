#!/usr/bin/env bash
# Suite 01 — project lifecycle.
#
# Parallel to Playwright tests:
#   - simple-navigation.e2e.ts:10 "should navigate to projects page successfully"
#   - simple-navigation.e2e.ts:62 "should handle project creation button click without crash"
#   - editor-navigation.e2e.ts:15 "should detect existing project on projects page"
#
# Covers: project:list, project:create, project:rename, project:delete.

set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../lib.sh
source "$SCRIPT_DIR/../lib.sh"

suite_start "suite 01 — project lifecycle"

# --- list projects (baseline) ---
initial_list=$(unwrap "$(qcut editor:project:list --json)")
initial_count=$(jq -r '.projects | length' <<<"$initial_list")
log_step "baseline project count: $initial_count"

# --- create a project ---
PID=""
with_project "cli-e2e-suite-01" PID

# --- verify list now includes it ---
list_after=$(unwrap "$(qcut editor:project:list --json)")
assert_json_truthy "$list_after" \
	".projects | map(select(.id == \"$PID\")) | .[0].name" \
	"newly created project is returned by project:list"
assert_json_eq "$list_after" \
	".projects | map(select(.id == \"$PID\")) | .[0].name" \
	"cli-e2e-suite-01" \
	"project:list returns the name we created with"

# --- info should reflect an empty timeline ---
info=$(unwrap "$(qcut editor:project:info --project-id "$PID" --json)")
# A fresh project is created with a default empty track, so .counts.tracks
# is 1, not 0. The meaningful check is that no *elements* exist yet.
assert_json_eq "$info" '.counts.elements' '0' 'new project has zero elements'

# --- rename (policy-gated, needs --force) ---
qcut editor:project:rename --project-id "$PID" --new-name "cli-e2e-suite-01-renamed" --force --json >/dev/null
renamed_info=$(unwrap "$(qcut editor:project:info --project-id "$PID" --json)")
assert_json_eq "$renamed_info" '.name' 'cli-e2e-suite-01-renamed' 'rename persisted'

# --- teardown (explicit so we assert on the cleaned-up list) ---
end_project
final_list=$(unwrap "$(qcut editor:project:list --json)")
remaining=$(jq -r ".projects | map(select(.id == \"$PID\")) | length" <<<"$final_list")
assert_json_eq "{\"remaining\":$remaining}" '.remaining' '0' 'project was deleted and is no longer listed'

suite_summary
