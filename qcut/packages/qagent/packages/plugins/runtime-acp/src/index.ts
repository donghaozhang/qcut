/**
 * Runtime plugin: ACP (Agent Client Protocol) over stdio.
 *
 * Spawns an ACP-compatible agent as a subprocess, communicates via
 * JSON-RPC 2.0 over newline-delimited JSON on stdin/stdout.
 *
 * Replaces tmux terminal scraping with structured protocol messages.
 * Works with any agent implementing ACP: Gemini CLI, OpenCode, Goose,
 * Kiro CLI, and ~25 others.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type {
	PluginModule,
	Runtime,
	RuntimeCreateConfig,
	RuntimeHandle,
	RuntimeMetrics,
	AttachInfo,
} from "@composio/ao-core";

export const manifest = {
	name: "acp",
	slot: "runtime" as const,
	description: "Runtime plugin: ACP (Agent Client Protocol) over stdio",
	version: "0.1.0",
};

/** Only allow safe characters in session IDs */
const SAFE_SESSION_ID = /^[a-zA-Z0-9_-]+$/;

function assertValidSessionId(id: string): void {
	if (!SAFE_SESSION_ID.test(id)) {
		throw new Error(
			`Invalid session ID "${id}": must match ${SAFE_SESSION_ID}`
		);
	}
}

// =============================================================================
// ACP State (shared with agent-acp via handle.data)
// =============================================================================

/**
 * Mutable state object stored in RuntimeHandle.data.acpState.
 * Updated by the session/update handler in real-time.
 * Read by agent-acp for activity detection without cross-plugin imports.
 */
export interface AcpState {
	lastUpdateType: string | null;
	lastUpdateAt: number;
	promptInProgress: boolean;
}

// =============================================================================
// Session State
// =============================================================================

interface AcpSessionEntry {
	process: ChildProcess;
	connection: acp.ClientSideConnection;
	acpSessionId: string | null;
	outputBuffer: string[];
	createdAt: number;
	/** Mutable state shared via handle.data.acpState */
	state: AcpState;
}

const MAX_OUTPUT_LINES = 1000;

// =============================================================================
// ACP Client Handler
// =============================================================================

function createClientHandler(
	entry: AcpSessionEntry,
	autoApprove: boolean
): acp.Client {
	return {
		async requestPermission(
			params: acp.RequestPermissionRequest
		): Promise<acp.RequestPermissionResponse> {
			if (autoApprove) {
				const allowAlways = params.options.find(
					(o) => o.kind === "allow_always"
				);
				const allowOnce = params.options.find(
					(o) => o.kind === "allow_once"
				);
				const option = allowAlways ?? allowOnce;
				if (option) {
					return {
						outcome: { outcome: "selected", optionId: option.optionId },
					};
				}
			}

			const reject = params.options.find((o) => o.kind === "reject_once");
			if (reject) {
				return {
					outcome: { outcome: "selected", optionId: reject.optionId },
				};
			}

			return { outcome: { outcome: "cancelled" } };
		},

		async sessionUpdate(params: acp.SessionNotification): Promise<void> {
			const update = params.update;
			entry.state.lastUpdateAt = Date.now();

			switch (update.sessionUpdate) {
				case "agent_message_chunk":
					entry.state.lastUpdateType = "message";
					if (
						"type" in update.content &&
						update.content.type === "text"
					) {
						const text = (update.content as { text: string }).text;
						for (const line of text.split("\n")) {
							entry.outputBuffer.push(line);
						}
						trimBuffer(entry);
					}
					break;

				case "tool_call": {
					entry.state.lastUpdateType = "tool_call";
					const title =
						"title" in update
							? (update as Record<string, unknown>).title
							: "";
					const status =
						"status" in update
							? (update as Record<string, unknown>).status
							: "";
					entry.outputBuffer.push(`[tool] ${title} (${status})`);
					trimBuffer(entry);
					break;
				}

				case "tool_call_update": {
					entry.state.lastUpdateType = "tool_call_update";
					const id =
						"toolCallId" in update
							? (update as Record<string, unknown>).toolCallId
							: "";
					const st =
						"status" in update
							? (update as Record<string, unknown>).status
							: "";
					entry.outputBuffer.push(`[tool_update] ${id}: ${st}`);
					trimBuffer(entry);
					break;
				}

				case "plan":
					entry.state.lastUpdateType = "plan";
					break;

				default:
					entry.state.lastUpdateType = update.sessionUpdate;
					break;
			}
		},

		async readTextFile(
			params: acp.ReadTextFileRequest
		): Promise<acp.ReadTextFileResponse> {
			const fs = await import("node:fs/promises");
			const content = await fs.readFile(params.path, "utf-8");
			return { content };
		},

		async writeTextFile(
			params: acp.WriteTextFileRequest
		): Promise<acp.WriteTextFileResponse> {
			const fs = await import("node:fs/promises");
			await fs.writeFile(params.path, params.content, "utf-8");
			return {};
		},
	};
}

function trimBuffer(entry: AcpSessionEntry): void {
	if (entry.outputBuffer.length > MAX_OUTPUT_LINES) {
		entry.outputBuffer.splice(
			0,
			entry.outputBuffer.length - MAX_OUTPUT_LINES
		);
	}
}

// =============================================================================
// Runtime Implementation
// =============================================================================

export function create(): Runtime {
	const sessions = new Map<string, AcpSessionEntry>();

	return {
		name: "acp",

		async create(config: RuntimeCreateConfig): Promise<RuntimeHandle> {
			assertValidSessionId(config.sessionId);
			const handleId = config.sessionId;

			if (sessions.has(handleId)) {
				throw new Error(
					`Session "${handleId}" already exists — destroy it before re-creating`
				);
			}

			// Parse the launch command to extract binary and args
			const parts = config.launchCommand.split(/\s+/).filter(Boolean);
			const command = parts[0];
			if (!command) {
				throw new Error("Empty launch command");
			}
			const args = parts.slice(1);

			// Spawn the agent process with stdio pipes for ACP
			const child = spawn(command, args, {
				cwd: config.workspacePath,
				env: { ...process.env, ...config.environment },
				stdio: ["pipe", "pipe", "inherit"],
				detached: true,
			});

			const acpState: AcpState = {
				lastUpdateType: null,
				lastUpdateAt: Date.now(),
				promptInProgress: false,
			};

			const entry: AcpSessionEntry = {
				process: child,
				connection: null as unknown as acp.ClientSideConnection,
				acpSessionId: null,
				outputBuffer: [],
				createdAt: Date.now(),
				state: acpState,
			};
			sessions.set(handleId, entry);

			child.once("exit", (code) => {
				entry.outputBuffer.push(
					`[process exited with code ${code}]`
				);
			});
			child.on("error", () => {
				// Prevent unhandled error crash
			});

			// Wait for spawn
			await new Promise<void>((resolve, reject) => {
				const onError = (err: Error) => {
					child.removeListener("spawn", onSpawn);
					sessions.delete(handleId);
					reject(
						new Error(
							`Failed to spawn ACP agent for session ${handleId}: ${err.message}`
						)
					);
				};
				const onSpawn = () => {
					child.removeListener("error", onError);
					resolve();
				};
				child.once("error", onError);
				child.once("spawn", onSpawn);
			});

			// Set up ACP connection over stdio
			const input = Writable.toWeb(
				child.stdin!
			) as WritableStream<Uint8Array>;
			const output = Readable.toWeb(
				child.stdout!
			) as ReadableStream<Uint8Array>;
			const stream = acp.ndJsonStream(input, output);

			const autoApprove =
				config.environment.QAGENT_ACP_AUTO_APPROVE === "true";

			const connection = new acp.ClientSideConnection(
				() => createClientHandler(entry, autoApprove),
				stream
			);
			entry.connection = connection;

			// Initialize ACP handshake
			try {
				await connection.initialize({
					protocolVersion: acp.PROTOCOL_VERSION,
					clientCapabilities: {
						fs: {
							readTextFile: true,
							writeTextFile: true,
						},
						terminal: true,
					},
					clientInfo: {
						name: "qagent",
						title: "QAgent Orchestrator",
						version: "0.1.0",
					},
				});
			} catch (err) {
				child.kill("SIGTERM");
				sessions.delete(handleId);
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(
					`ACP initialization failed for session ${handleId}: ${msg}`
				);
			}

			// Create ACP session
			try {
				const session = await connection.newSession({
					cwd: config.workspacePath,
					mcpServers: [],
				});
				entry.acpSessionId = session.sessionId;
			} catch (err) {
				child.kill("SIGTERM");
				sessions.delete(handleId);
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(
					`ACP session creation failed for session ${handleId}: ${msg}`
				);
			}

			return {
				id: handleId,
				runtimeName: "acp",
				data: {
					pid: child.pid,
					createdAt: entry.createdAt,
					acpSessionId: entry.acpSessionId,
					// Mutable reference — agent-acp reads this for activity detection
					acpState,
				},
			};
		},

		async destroy(handle: RuntimeHandle): Promise<void> {
			const entry = sessions.get(handle.id);
			if (!entry) return;

			if (entry.acpSessionId) {
				try {
					await entry.connection.cancel({
						sessionId: entry.acpSessionId,
					});
				} catch {
					// Best effort
				}
			}

			const child = entry.process;
			if (child.exitCode === null && child.signalCode === null) {
				const pid = child.pid;
				if (pid) {
					try {
						process.kill(-pid, "SIGTERM");
					} catch {
						child.kill("SIGTERM");
					}
				} else {
					child.kill("SIGTERM");
				}

				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						if (
							child.exitCode === null &&
							child.signalCode === null
						) {
							if (pid) {
								try {
									process.kill(-pid, "SIGKILL");
								} catch {
									child.kill("SIGKILL");
								}
							} else {
								child.kill("SIGKILL");
							}
						}
						resolve();
					}, 5000);
					child.once("exit", () => {
						clearTimeout(timeout);
						resolve();
					});
				});
			}

			sessions.delete(handle.id);
		},

		async sendMessage(
			handle: RuntimeHandle,
			message: string
		): Promise<void> {
			const entry = sessions.get(handle.id);
			if (!entry) {
				throw new Error(`No ACP session found for ${handle.id}`);
			}
			if (!entry.acpSessionId) {
				throw new Error(
					`ACP session not initialized for ${handle.id}`
				);
			}

			entry.state.promptInProgress = true;
			entry.outputBuffer.push(
				`[prompt] ${message.slice(0, 100)}${message.length > 100 ? "..." : ""}`
			);
			try {
				const result = await entry.connection.prompt({
					sessionId: entry.acpSessionId,
					prompt: [{ type: "text", text: message }],
				});
				entry.outputBuffer.push(
					`[prompt complete] stopReason=${result.stopReason}`
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				entry.outputBuffer.push(`[prompt error] ${msg}`);
				throw err;
			} finally {
				entry.state.promptInProgress = false;
			}
		},

		async getOutput(handle: RuntimeHandle, lines = 50): Promise<string> {
			const entry = sessions.get(handle.id);
			if (!entry) return "";

			const buffer = entry.outputBuffer;
			const start = Math.max(0, buffer.length - lines);
			return buffer.slice(start).join("\n");
		},

		async isAlive(handle: RuntimeHandle): Promise<boolean> {
			const entry = sessions.get(handle.id);
			if (!entry) return false;
			return (
				entry.process.exitCode === null &&
				entry.process.signalCode === null
			);
		},

		async getMetrics(handle: RuntimeHandle): Promise<RuntimeMetrics> {
			const entry = sessions.get(handle.id);
			const createdAt = entry?.createdAt ?? Date.now();
			return {
				uptimeMs: Date.now() - createdAt,
			};
		},

		async getAttachInfo(handle: RuntimeHandle): Promise<AttachInfo> {
			const entry = sessions.get(handle.id);
			if (
				!entry ||
				entry.process.exitCode !== null ||
				entry.process.signalCode !== null
			) {
				return {
					type: "process",
					target: "",
					command: `# ACP process for session ${handle.id} is no longer running`,
				};
			}
			return {
				type: "process",
				target: String(entry.process.pid),
			};
		},
	};
}

export default { manifest, create } satisfies PluginModule<Runtime>;
