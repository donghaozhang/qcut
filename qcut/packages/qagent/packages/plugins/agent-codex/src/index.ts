import {
	shellEscape,
	type Agent,
	type AgentSessionInfo,
	type AgentLaunchConfig,
	type ActivityState,
	type ActivityDetection,
	type PluginModule,
	type RuntimeHandle,
	type Session,
	type WorkspaceHooksConfig,
} from "@composio/ao-core";
import { execFile } from "node:child_process";
import {
	writeFile,
	mkdir,
	readFile,
	rename,
	readdir,
	stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);
const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");

/** Shared bin directory for qagent shell wrappers (prepended to PATH) */
const QAGENT_BIN_DIR = join(homedir(), ".qagent", "bin");

// =============================================================================
// Plugin Manifest
// =============================================================================

export const manifest = {
	name: "codex",
	slot: "agent" as const,
	description: "Agent plugin: OpenAI Codex CLI",
	version: "0.1.0",
};

// =============================================================================
// Shell Wrappers (automatic metadata updates — like Claude Code's PostToolUse)
// =============================================================================

/**
 * Helper script sourced by both gh and git wrappers.
 * Provides update_qagent_metadata() for writing key=value to the session file.
 */
/* eslint-disable no-useless-escape -- \$ escapes are intentional: bash scripts in JS template literals */
const QAGENT_METADATA_HELPER = `#!/usr/bin/env bash
# qagent-metadata-helper — shared by gh/git wrappers
# Provides: update_qagent_metadata <key> <value>

update_qagent_metadata() {
  local key="$1" value="$2"
  local qagent_dir="\${QAGENT_DATA_DIR:-}"
  local qagent_session="\${QAGENT_SESSION:-}"

  [[ -z "$qagent_dir" || -z "$qagent_session" ]] && return 0

  # Validate: session name must not contain path separators or traversal
  case "$qagent_session" in
    */* | *..*) return 0 ;;
  esac

  # Validate: qagent_dir must be an absolute path under known qagent directories or /tmp
  case "$qagent_dir" in
    "$HOME"/.qagent/* | /tmp/*) ;;
    *) return 0 ;;
  esac

  local metadata_file="$qagent_dir/$qagent_session"

  # Resolve and verify the file is still within qagent_dir
  local real_dir real_qagent_dir
  real_qagent_dir="$(cd "$qagent_dir" 2>/dev/null && pwd -P)" || return 0
  real_dir="$(cd "$(dirname "$metadata_file")" 2>/dev/null && pwd -P)" || return 0
  [[ "$real_dir" == "$real_qagent_dir"* ]] || return 0

  [[ -f "$metadata_file" ]] || return 0

  local temp_file="\${metadata_file}.tmp.$$"

  # Strip newlines from value to prevent metadata line injection
  local clean_value="$(printf '%s' "$value" | tr -d '\\n')"

  # Escape sed metacharacters in value (& expands to matched text, | breaks delimiter)
  local escaped_value="$(printf '%s' "$clean_value" | sed 's/[&|\\\\]/\\\\&/g')"

  if grep -q "^\${key}=" "$metadata_file" 2>/dev/null; then
    sed "s|^\${key}=.*|\${key}=\${escaped_value}|" "$metadata_file" > "$temp_file"
  else
    cp "$metadata_file" "$temp_file"
    printf '%s=%s\\n' "$key" "$clean_value" >> "$temp_file"
  fi

  mv "$temp_file" "$metadata_file"
}
`;

/**
 * gh wrapper — intercepts `gh pr create` and `gh pr merge` to auto-update
 * session metadata. All other commands pass through transparently.
 */
const GH_WRAPPER = `#!/usr/bin/env bash
# qagent gh wrapper — auto-updates session metadata on PR operations

# Find real gh by removing our wrapper directory from PATH
qagent_bin_dir="$(cd "$(dirname "$0")" && pwd)"
clean_path="$(echo "$PATH" | tr ':' '\\n' | grep -Fxv "$qagent_bin_dir" | grep . | tr '\\n' ':')"
clean_path="\${clean_path%:}"
real_gh="$(PATH="$clean_path" command -v gh 2>/dev/null)"

if [[ -z "$real_gh" ]]; then
  echo "qagent-wrapper: gh not found in PATH" >&2
  exit 127
fi

# Source the metadata helper
source "$qagent_bin_dir/qagent-metadata-helper.sh" 2>/dev/null || true

# Only capture output for commands we need to parse (pr/create, pr/merge).
# All other commands pass through transparently without stream merging.
case "$1/$2" in
  pr/create|pr/merge)
    tmpout="$(mktemp)"
    trap 'rm -f "$tmpout"' EXIT

    "$real_gh" "$@" 2>&1 | tee "$tmpout"
    exit_code=\${PIPESTATUS[0]}

    if [[ $exit_code -eq 0 ]]; then
      output="$(cat "$tmpout")"
      case "$1/$2" in
        pr/create)
          pr_url="$(echo "$output" | grep -Eo 'https://github\\.com/[^/]+/[^/]+/pull/[0-9]+' | head -1)"
          if [[ -n "$pr_url" ]]; then
            update_qagent_metadata pr "$pr_url"
            update_qagent_metadata status pr_open
          fi
          ;;
        pr/merge)
          update_qagent_metadata status merged
          ;;
      esac
    fi

    exit $exit_code
    ;;
  *)
    exec "$real_gh" "$@"
    ;;
esac
`;

/**
 * git wrapper — intercepts branch creation commands to auto-update metadata.
 * All other commands pass through transparently.
 */
const GIT_WRAPPER = `#!/usr/bin/env bash
# qagent git wrapper — auto-updates session metadata on branch operations

# Find real git by removing our wrapper directory from PATH
qagent_bin_dir="$(cd "$(dirname "$0")" && pwd)"
clean_path="$(echo "$PATH" | tr ':' '\\n' | grep -Fxv "$qagent_bin_dir" | grep . | tr '\\n' ':')"
clean_path="\${clean_path%:}"
real_git="$(PATH="$clean_path" command -v git 2>/dev/null)"

if [[ -z "$real_git" ]]; then
  echo "qagent-wrapper: git not found in PATH" >&2
  exit 127
fi

# Source the metadata helper
source "$qagent_bin_dir/qagent-metadata-helper.sh" 2>/dev/null || true

# Run real git
"$real_git" "$@"
exit_code=$?

# Only update metadata on success
if [[ $exit_code -eq 0 ]]; then
  case "$1/$2" in
    checkout/-b)
      update_qagent_metadata branch "$3"
      ;;
    switch/-c)
      update_qagent_metadata branch "$3"
      ;;
  esac
fi

exit $exit_code
`;

// =============================================================================
// Workspace Setup
// =============================================================================

/**
 * Section appended to AGENTS.md as a secondary signal. The PATH-based wrappers
 * handle metadata updates automatically, but AGENTS.md reinforces the intent
 * and helps if the wrappers are bypassed.
 */
const QAGENT_AGENTS_MD_SECTION = `
## Agent Orchestrator (qagent) Session

You are running inside an Agent Orchestrator managed workspace.
Session metadata is updated automatically via shell wrappers.

If automatic updates fail, you can manually update metadata:
\`\`\`bash
~/.qagent/bin/qagent-metadata-helper.sh  # sourced automatically
# Then call: update_qagent_metadata <key> <value>
\`\`\`
`;
/* eslint-enable no-useless-escape */

/**
 * Atomically write a file by writing to a temp file in the same directory,
 * then renaming. This prevents concurrent sessions from reading partially
 * written wrapper scripts.
 */
async function atomicWriteFile(
	filePath: string,
	content: string,
	mode: number
): Promise<void> {
	const suffix = randomBytes(6).toString("hex");
	const tmpPath = `${filePath}.tmp.${suffix}`;
	await writeFile(tmpPath, content, { encoding: "utf-8", mode });
	await rename(tmpPath, filePath);
}

async function setupCodexWorkspace(workspacePath: string): Promise<void> {
	// 1. Write shared wrappers to ~/.qagent/bin/
	await mkdir(QAGENT_BIN_DIR, { recursive: true });

	await atomicWriteFile(
		join(QAGENT_BIN_DIR, "qagent-metadata-helper.sh"),
		QAGENT_METADATA_HELPER,
		0o755
	);

	// Only write wrappers if they don't exist or are outdated (check marker)
	const markerPath = join(QAGENT_BIN_DIR, ".qagent-version");
	const currentVersion = "0.1.0";
	let needsUpdate = true;
	try {
		const existing = await readFile(markerPath, "utf-8");
		if (existing.trim() === currentVersion) needsUpdate = false;
	} catch {
		// File doesn't exist — needs update
	}

	if (needsUpdate) {
		// Write wrappers atomically, then write the version marker last.
		// If we crash between wrapper writes and marker write, the next
		// invocation will redo the writes (safe: wrappers are idempotent).
		await atomicWriteFile(join(QAGENT_BIN_DIR, "gh"), GH_WRAPPER, 0o755);
		await atomicWriteFile(join(QAGENT_BIN_DIR, "git"), GIT_WRAPPER, 0o755);
		await atomicWriteFile(markerPath, currentVersion, 0o644);
	}

	// 2. Append qagent section to AGENTS.md (create if missing, skip if already present)
	const agentsMdPath = join(workspacePath, "AGENTS.md");
	let existing = "";
	try {
		existing = await readFile(agentsMdPath, "utf-8");
	} catch {
		// File doesn't exist yet
	}

	if (!existing.includes("Agent Orchestrator (qagent) Session")) {
		const content = existing
			? existing.trimEnd() + "\n" + QAGENT_AGENTS_MD_SECTION
			: QAGENT_AGENTS_MD_SECTION.trimStart();
		await writeFile(agentsMdPath, content, "utf-8");
	}
}

interface CodexSessionMetaLine {
	type: "session_meta";
	timestamp?: string;
	payload?: {
		id?: string;
		timestamp?: string;
		cwd?: string;
	};
}

interface CodexTokenCountUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
}

interface CodexTokenCountLine {
	type: "event_msg";
	payload?: {
		type?: string;
		info?: {
			total_token_usage?: CodexTokenCountUsage;
			last_token_usage?: CodexTokenCountUsage;
		};
	};
}

function safeFiniteNumber({ value }: { value: unknown }): number {
	try {
		if (typeof value !== "number" || !Number.isFinite(value)) return 0;
		if (value < 0) return 0;
		return value;
	} catch {
		return 0;
	}
}

function firstLine({ content }: { content: string }): string {
	try {
		const line = content.split("\n")[0];
		return line ?? "";
	} catch {
		return "";
	}
}

function parseJsonRecord({ line }: { line: string }): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(line);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function toEpochMs({ value }: { value: string | Date | undefined | null }): number {
	try {
		if (!value) return 0;
		const input = value instanceof Date ? value.toISOString() : value;
		const epochMs = Date.parse(input);
		return Number.isFinite(epochMs) ? epochMs : 0;
	} catch {
		return 0;
	}
}

function dayPath({
	base,
	offsetDays,
}: {
	base: Date;
	offsetDays: number;
}): string {
	const d = new Date(base);
	d.setUTCDate(d.getUTCDate() + offsetDays);
	const yyyy = d.getUTCFullYear().toString();
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return join(CODEX_SESSIONS_DIR, yyyy, mm, dd);
}

async function listCandidateRolloutFiles({
	around,
}: {
	around: Date;
}): Promise<string[]> {
	try {
		const dayOffsets = [0, -1, 1, -2, 2];
		const files = await Promise.all(
			dayOffsets.map(async (offsetDays) => {
				try {
					const dir = dayPath({ base: around, offsetDays });
					const entries = await readdir(dir);
					return entries
						.filter((name) => name.endsWith(".jsonl"))
						.map((name) => join(dir, name));
				} catch {
					return [];
				}
			})
		);
		return files.flat();
	} catch {
		return [];
	}
}

async function readCodexSessionMeta({
	filePath,
}: {
	filePath: string;
}): Promise<CodexSessionMetaLine | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		const line = firstLine({ content }).trim();
		if (!line) return null;
		const parsed = parseJsonRecord({ line });
		if (!parsed || parsed.type !== "session_meta") return null;
		return parsed as unknown as CodexSessionMetaLine;
	} catch {
		return null;
	}
}

async function findCodexRolloutForWorkspace({
	workspacePath,
	createdAt,
}: {
	workspacePath: string;
	createdAt: Date;
}): Promise<{ filePath: string; sessionId: string | null } | null> {
	try {
		const candidates = await listCandidateRolloutFiles({ around: createdAt });
		if (candidates.length === 0) return null;

		const matching: Array<{
			filePath: string;
			sessionId: string | null;
			diffMs: number;
			mtimeMs: number;
		}> = [];

		const createdAtMs = toEpochMs({ value: createdAt });

		for (const filePath of candidates) {
			try {
				const [meta, stats] = await Promise.all([
					readCodexSessionMeta({ filePath }),
					stat(filePath),
				]);
				const cwd = meta?.payload?.cwd;
				if (cwd !== workspacePath) continue;

				const sessionTimestampMs = toEpochMs({
					value: meta?.payload?.timestamp ?? meta?.timestamp ?? null,
				});
				const diffMs =
					createdAtMs > 0 && sessionTimestampMs > 0
						? Math.abs(sessionTimestampMs - createdAtMs)
						: Number.MAX_SAFE_INTEGER;

				matching.push({
					filePath,
					sessionId: meta?.payload?.id ?? null,
					diffMs,
					mtimeMs: safeFiniteNumber({ value: stats.mtimeMs }),
				});
			} catch {
				continue;
			}
		}

		if (matching.length === 0) return null;

		matching.sort((a, b) => {
			if (a.diffMs !== b.diffMs) return a.diffMs - b.diffMs;
			return b.mtimeMs - a.mtimeMs;
		});

		const best = matching[0];
		return { filePath: best.filePath, sessionId: best.sessionId };
	} catch {
		return null;
	}
}

function usageFromTokenCountLine({
	record,
}: {
	record: CodexTokenCountLine;
}): CodexTokenCountUsage | null {
	try {
		if (record.type !== "event_msg") return null;
		if (record.payload?.type !== "token_count") return null;
		return (
			record.payload.info?.total_token_usage ??
			record.payload.info?.last_token_usage ??
			null
		);
	} catch {
		return null;
	}
}

async function extractCodexUsage({
	filePath,
}: {
	filePath: string;
}): Promise<{ inputTokens: number; outputTokens: number } | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		const lines = content.split("\n");

		let usage: CodexTokenCountUsage | null = null;
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const parsed = parseJsonRecord({ line: trimmed });
			if (!parsed) continue;

			const tokenUsage = usageFromTokenCountLine({
				record: parsed as unknown as CodexTokenCountLine,
			});
			if (!tokenUsage) continue;
			usage = tokenUsage;
		}

		if (!usage) return null;

		const inputTokens = Math.round(safeFiniteNumber({ value: usage.input_tokens }));
		const outputFromUsage = Math.round(
			safeFiniteNumber({ value: usage.output_tokens })
		);
		const totalFromUsage = Math.round(
			safeFiniteNumber({ value: usage.total_tokens })
		);
		const outputTokens =
			totalFromUsage > 0
				? Math.max(0, totalFromUsage - inputTokens)
				: outputFromUsage;

		return { inputTokens, outputTokens };
	} catch {
		return null;
	}
}

// =============================================================================
// Agent Implementation
// =============================================================================

function createCodexAgent(): Agent {
	return {
		name: "codex",
		processName: "codex",

		getLaunchCommand(config: AgentLaunchConfig): string {
			const parts: string[] = ["codex"];

			if (config.permissions === "skip") {
				parts.push("--dangerously-bypass-approvals-and-sandbox");
			}

			if (config.model) {
				parts.push("--model", shellEscape(config.model));
			}

			if (config.systemPromptFile) {
				// Codex reads developer instructions from a file via config override
				parts.push(
					"-c",
					`model_instructions_file=${shellEscape(config.systemPromptFile)}`
				);
			} else if (config.systemPrompt) {
				// Codex accepts inline developer instructions via config override
				parts.push(
					"-c",
					`developer_instructions=${shellEscape(config.systemPrompt)}`
				);
			}

			if (config.prompt) {
				// Use `--` to end option parsing so prompts starting with `-` aren't
				// misinterpreted as flags.
				parts.push("--", shellEscape(config.prompt));
			}

			return parts.join(" ");
		},

		getEnvironment(config: AgentLaunchConfig): Record<string, string> {
			const env: Record<string, string> = {};
			env.QAGENT_SESSION_ID = config.sessionId;
			// NOTE: QAGENT_PROJECT_ID is the caller's responsibility (spawn.ts sets it)
			if (config.issueId) {
				env.QAGENT_ISSUE_ID = config.issueId;
			}

			// Prepend ~/.qagent/bin to PATH so our gh/git wrappers intercept commands.
			// The wrappers strip this directory from PATH before calling the real
			// binary, so there's no infinite recursion.
			env.PATH =
				`${QAGENT_BIN_DIR}:${process.env.PATH ?? "/usr/bin:/bin"}`;

			return env;
		},

		detectActivity(terminalOutput: string): ActivityState {
			if (!terminalOutput.trim()) return "idle";

			const lines = terminalOutput.trim().split("\n");
			const lastLine = lines[lines.length - 1]?.trim() ?? "";

			// If Codex is showing its input prompt, it's idle
			if (/^[>$#]\s*$/.test(lastLine)) return "idle";

			// Check last few lines for approval prompts
			const tail = lines.slice(-5).join("\n");
			if (/approval required/i.test(tail)) return "waiting_input";
			if (/\(y\)es.*\(n\)o/i.test(tail)) return "waiting_input";

			// Default to active — specific patterns (esc to interrupt, spinner
			// symbols) all map to "active" so no need to check them individually.
			return "active";
		},

		async getActivityState(
			session: Session,
			_readyThresholdMs?: number
		): Promise<ActivityDetection | null> {
			// Check if process is running first
			if (!session.runtimeHandle) return { state: "exited" };
			const running = await this.isProcessRunning(session.runtimeHandle);
			if (!running) return { state: "exited" };

			// NOTE: Codex stores rollout files in a global ~/.codex/sessions/ directory
			// without workspace-specific scoping. When multiple Codex sessions run in
			// parallel, we cannot reliably determine which rollout file belongs to which
			// session. Until Codex provides per-workspace session tracking, we return
			// null (unknown) rather than guessing. See issue #13 for details.
			//
			// TODO: Implement proper per-session activity detection when Codex supports it.
			return null;
		},

		async isProcessRunning(handle: RuntimeHandle): Promise<boolean> {
			try {
				if (handle.runtimeName === "tmux" && handle.id) {
					const { stdout: ttyOut } = await execFileAsync(
						"tmux",
						["list-panes", "-t", handle.id, "-F", "#{pane_tty}"],
						{ timeout: 30_000 }
					);
					const ttys = ttyOut
						.trim()
						.split("\n")
						.map((t) => t.trim())
						.filter(Boolean);
					if (ttys.length === 0) return false;

					const { stdout: psOut } = await execFileAsync(
						"ps",
						["-eo", "pid,tty,args"],
						{
							timeout: 30_000,
						}
					);
					const ttySet = new Set(ttys.map((t) => t.replace(/^\/dev\//, "")));
					const processRe = /(?:^|\/)codex(?:\s|$)/;
					for (const line of psOut.split("\n")) {
						const cols = line.trimStart().split(/\s+/);
						if (cols.length < 3 || !ttySet.has(cols[1] ?? "")) continue;
						const args = cols.slice(2).join(" ");
						if (processRe.test(args)) {
							return true;
						}
					}
					return false;
				}

				const rawPid = handle.data.pid;
				const pid = typeof rawPid === "number" ? rawPid : Number(rawPid);
				if (Number.isFinite(pid) && pid > 0) {
					try {
						process.kill(pid, 0);
						return true;
					} catch (err: unknown) {
						if (err instanceof Error && "code" in err && err.code === "EPERM") {
							return true;
						}
						return false;
					}
				}

				return false;
			} catch {
				return false;
			}
		},

		async getSessionInfo(session: Session): Promise<AgentSessionInfo | null> {
			try {
				if (!session.workspacePath) return null;

				const rollout = await findCodexRolloutForWorkspace({
					workspacePath: session.workspacePath,
					createdAt: session.createdAt,
				});
				if (!rollout) return null;

				const usage = await extractCodexUsage({ filePath: rollout.filePath });
				return {
					summary: null,
					agentSessionId: rollout.sessionId,
					...(usage
						? {
								cost: {
									inputTokens: usage.inputTokens,
									outputTokens: usage.outputTokens,
									estimatedCostUsd: 0,
								},
							}
						: {}),
				};
			} catch {
				return null;
			}
		},

		async setupWorkspaceHooks(
			workspacePath: string,
			_config: WorkspaceHooksConfig
		): Promise<void> {
			await setupCodexWorkspace(workspacePath);
		},

		async postLaunchSetup(session: Session): Promise<void> {
			if (!session.workspacePath) return;
			await setupCodexWorkspace(session.workspacePath);
		},
	};
}

// =============================================================================
// Plugin Export
// =============================================================================

export function create(): Agent {
	return createCodexAgent();
}

export default { manifest, create } satisfies PluginModule<Agent>;
