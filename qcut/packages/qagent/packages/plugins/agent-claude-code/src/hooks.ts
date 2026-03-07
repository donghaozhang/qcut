/**
 * Claude Code PostToolUse hook setup.
 *
 * Writes a metadata-updater.sh script that automatically updates session
 * metadata when the agent runs git/gh commands (branch switches, PR creation, merges).
 */

import { writeFile, readFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Metadata Updater Hook Script
// =============================================================================

/** Hook script content that updates session metadata on git/gh commands */
export const METADATA_UPDATER_SCRIPT = `#!/usr/bin/env bash
# Metadata Updater Hook for Agent Orchestrator
#
# This PostToolUse hook automatically updates session metadata when:
# - gh pr create: extracts PR URL and writes to metadata
# - git checkout -b / git switch -c: extracts branch name and writes to metadata
# - gh pr merge: updates status to "merged"

set -euo pipefail

# Configuration
QAGENT_DATA_DIR="\${QAGENT_DATA_DIR:-$HOME/.qagent-sessions}"

# Read hook input from stdin
input=$(cat)

# Extract fields from JSON (using jq if available, otherwise basic parsing)
if command -v jq &>/dev/null; then
  tool_name=$(echo "$input" | jq -r '.tool_name // empty')
  command=$(echo "$input" | jq -r '.tool_input.command // empty')
  output=$(echo "$input" | jq -r '.tool_response // empty')
  exit_code=$(echo "$input" | jq -r '.exit_code // 0')
else
  # Fallback: basic JSON parsing without jq
  tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "")
  command=$(echo "$input" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "")
  output=$(echo "$input" | grep -o '"tool_response"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "")
  exit_code=$(echo "$input" | grep -o '"exit_code"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "0")
fi

# Only process successful commands (exit code 0)
if [[ "$exit_code" -ne 0 ]]; then
  echo '{}'
  exit 0
fi

# Only process Bash tool calls
if [[ "$tool_name" != "Bash" ]]; then
  echo '{}' # Empty JSON output
  exit 0
fi

# Validate QAGENT_SESSION is set
if [[ -z "\${QAGENT_SESSION:-}" ]]; then
  echo '{"systemMessage": "QAGENT_SESSION environment variable not set, skipping metadata update"}'
  exit 0
fi

# Construct metadata file path
# QAGENT_DATA_DIR is already set to the project-specific sessions directory
metadata_file="$QAGENT_DATA_DIR/$QAGENT_SESSION"

# Ensure metadata file exists
if [[ ! -f "$metadata_file" ]]; then
  echo '{"systemMessage": "Metadata file not found: '"$metadata_file"'"}'
  exit 0
fi

# Update a single key in metadata
update_metadata_key() {
  local key="$1"
  local value="$2"

  # Create temp file
  local temp_file="\${metadata_file}.tmp"

  # Escape special sed characters in value (& | / \\)
  local escaped_value=$(echo "$value" | sed 's/[&|\\/]/\\\\&/g')

  # Check if key already exists
  if grep -q "^$key=" "$metadata_file" 2>/dev/null; then
    # Update existing key
    sed "s|^$key=.*|$key=$escaped_value|" "$metadata_file" > "$temp_file"
  else
    # Append new key
    cp "$metadata_file" "$temp_file"
    echo "$key=$value" >> "$temp_file"
  fi

  # Atomic replace
  mv "$temp_file" "$metadata_file"
}

# ============================================================================
# Command Detection and Parsing
# ============================================================================

# Detect: gh pr create
if [[ "$command" =~ ^gh[[:space:]]+pr[[:space:]]+create ]]; then
  # Extract PR URL from output
  pr_url=$(echo "$output" | grep -Eo 'https://github[.]com/[^/]+/[^/]+/pull/[0-9]+' | head -1)

  if [[ -n "$pr_url" ]]; then
    update_metadata_key "pr" "$pr_url"
    update_metadata_key "status" "pr_open"
    echo '{"systemMessage": "Updated metadata: PR created at '"$pr_url"'"}'
    exit 0
  fi
fi

# Detect: git checkout -b <branch> or git switch -c <branch>
if [[ "$command" =~ ^git[[:space:]]+checkout[[:space:]]+-b[[:space:]]+([^[:space:]]+) ]] || \\
   [[ "$command" =~ ^git[[:space:]]+switch[[:space:]]+-c[[:space:]]+([^[:space:]]+) ]]; then
  branch="\${BASH_REMATCH[1]}"

  if [[ -n "$branch" ]]; then
    update_metadata_key "branch" "$branch"
    echo '{"systemMessage": "Updated metadata: branch = '"$branch"'"}'
    exit 0
  fi
fi

# Detect: git checkout <branch> (without -b) or git switch <branch> (without -c)
# Only update if the branch name looks like a feature branch (contains / or -)
if [[ "$command" =~ ^git[[:space:]]+checkout[[:space:]]+([^[:space:]-]+[/-][^[:space:]]+) ]] || \\
   [[ "$command" =~ ^git[[:space:]]+switch[[:space:]]+([^[:space:]-]+[/-][^[:space:]]+) ]]; then
  branch="\${BASH_REMATCH[1]}"

  # Avoid updating for checkout of commits/tags
  if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
    update_metadata_key "branch" "$branch"
    echo '{"systemMessage": "Updated metadata: branch = '"$branch"'"}'
    exit 0
  fi
fi

# Detect: gh pr merge
if [[ "$command" =~ ^gh[[:space:]]+pr[[:space:]]+merge ]]; then
  update_metadata_key "status" "merged"
  echo '{"systemMessage": "Updated metadata: status = merged"}'
  exit 0
fi

# No matching command, exit silently
echo '{}'
exit 0
`;

// =============================================================================
// Hook Setup
// =============================================================================

/**
 * Shared helper to setup PostToolUse hooks in a workspace.
 * Writes metadata-updater.sh script and updates settings.json.
 *
 * @param workspacePath - Path to the workspace directory
 * @param hookCommand - Command string for the hook
 */
export async function setupHookInWorkspace(
	workspacePath: string,
	hookCommand: string
): Promise<void> {
	const claudeDir = join(workspacePath, ".claude");
	const settingsPath = join(claudeDir, "settings.json");
	const hookScriptPath = join(claudeDir, "metadata-updater.sh");

	// Create .claude directory if it doesn't exist
	try {
		await mkdir(claudeDir, { recursive: true });
	} catch {
		// Directory might already exist
	}

	// Write the metadata updater script
	await writeFile(hookScriptPath, METADATA_UPDATER_SCRIPT, "utf-8");
	await chmod(hookScriptPath, 0o755); // Make executable

	// Read existing settings if present
	let existingSettings: Record<string, unknown> = {};
	if (existsSync(settingsPath)) {
		try {
			const content = await readFile(settingsPath, "utf-8");
			existingSettings = JSON.parse(content) as Record<string, unknown>;
		} catch {
			// Invalid JSON or read error — start fresh
		}
	}

	// Merge hooks configuration
	const hooks = (existingSettings.hooks as Record<string, unknown>) ?? {};
	const postToolUse = (hooks.PostToolUse as Array<unknown>) ?? [];

	// Check if our hook is already configured
	let hookIndex = -1;
	let hookDefIndex = -1;
	for (let i = 0; i < postToolUse.length; i++) {
		const hook = postToolUse[i];
		if (typeof hook !== "object" || hook === null || Array.isArray(hook))
			continue;
		const h = hook as Record<string, unknown>;
		const hooksList = h.hooks;
		if (!Array.isArray(hooksList)) continue;
		for (let j = 0; j < hooksList.length; j++) {
			const hDef = hooksList[j];
			if (typeof hDef !== "object" || hDef === null || Array.isArray(hDef))
				continue;
			const def = hDef as Record<string, unknown>;
			if (
				typeof def.command === "string" &&
				def.command.includes("metadata-updater.sh")
			) {
				hookIndex = i;
				hookDefIndex = j;
				break;
			}
		}
		if (hookIndex >= 0) break;
	}

	// Add or update our hook
	if (hookIndex === -1) {
		// No metadata hook exists, add it
		postToolUse.push({
			matcher: "Bash",
			hooks: [
				{
					type: "command",
					command: hookCommand,
					timeout: 5000,
				},
			],
		});
	} else {
		// Hook exists, update the command
		const hook = postToolUse[hookIndex] as Record<string, unknown>;
		const hooksList = hook.hooks as Array<Record<string, unknown>>;
		hooksList[hookDefIndex].command = hookCommand;
	}

	hooks.PostToolUse = postToolUse;
	existingSettings.hooks = hooks;

	// Write updated settings
	await writeFile(
		settingsPath,
		JSON.stringify(existingSettings, null, 2) + "\n",
		"utf-8"
	);
}
