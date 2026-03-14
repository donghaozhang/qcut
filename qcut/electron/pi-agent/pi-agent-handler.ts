/**
 * IPC handlers for Pi Agent — streaming chat, reset, model switching.
 *
 * Follows the same streaming pattern as gemini-chat-handler.ts:
 *   - Request via ipcMain.handle
 *   - Stream events via event.sender.send
 *   - Cleanup on completion/error
 *
 * @module electron/pi-agent/pi-agent-handler
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { PiAgentSettings } from "./agent-factory.js";

// Dynamic imports to avoid ESM/CJS issues at module load time
let _createPiAgent: typeof import("./agent-factory.js").createPiAgent | undefined;
let _AVAILABLE_MODELS: typeof import("./agent-factory.js").AVAILABLE_MODELS | undefined;

type AgentEvent = Record<string, any>;

async function ensurePiModules() {
	if (!_createPiAgent) {
		const factory = await import("./agent-factory.js");
		_createPiAgent = factory.createPiAgent;
		_AVAILABLE_MODELS = factory.AVAILABLE_MODELS;
	}
}

// Per-webContents agent instance
const agents = new Map<number, any>();

function getOrCreateAgent(
	webContentsId: number,
	settings?: PiAgentSettings,
	apiKey?: string
): any {
	let agent = agents.get(webContentsId);
	if (!agent) {
		agent = _createPiAgent!(
			settings ?? { provider: "anthropic", model: "claude-sonnet-4-20250514" },
			apiKey
		);
		agents.set(webContentsId, agent);
	}
	return agent;
}

/** Register all Pi Agent IPC handlers. */
export function setupPiAgentIPCImpl(): void {
	// ── Chat ──────────────────────────────────────────────────────────
	ipcMain.handle(
		"pi-agent:chat",
		async (
			event: IpcMainInvokeEvent,
			request: { message: string; settings?: PiAgentSettings; apiKey?: string }
		): Promise<{ success: boolean; error?: string }> => {
			await ensurePiModules();
			const sender = event.sender;
			const agent = getOrCreateAgent(
				sender.id,
				request.settings,
				request.apiKey
			);

			let unsubscribe: (() => void) | null = null;

			try {
				unsubscribe = agent.subscribe((e: AgentEvent) => {
					if (sender.isDestroyed()) return;

					switch (e.type) {
						case "message_update": {
							// Extract text from the latest content
							const msg = e.message as any;
							if (msg?.content) {
								const textParts = msg.content
									.filter((c: any) => c.type === "text")
									.map((c: any) => c.text);
								if (textParts.length > 0) {
									sender.send("pi-agent:stream-chunk", {
										text: textParts.join(""),
									});
								}
							}
							break;
						}

						case "tool_execution_start":
							sender.send("pi-agent:tool-call", {
								toolCallId: e.toolCallId,
								toolName: e.toolName,
								params: e.args,
							});
							break;

						case "tool_execution_end":
							sender.send("pi-agent:tool-result", {
								toolCallId: e.toolCallId,
								toolName: e.toolName,
								result: e.result,
								isError: e.isError,
							});
							break;

						case "agent_end":
							if (!sender.isDestroyed()) {
								sender.send("pi-agent:stream-complete");
							}
							break;
					}
				});

				await agent.prompt(request.message);
				return { success: true };
			} catch (error: any) {
				if (!sender.isDestroyed()) {
					sender.send("pi-agent:stream-error", {
						message: error.message ?? String(error),
					});
				}
				return {
					success: false,
					error: error.message ?? String(error),
				};
			} finally {
				unsubscribe?.();
			}
		}
	);

	// ── Reset ─────────────────────────────────────────────────────────
	ipcMain.handle("pi-agent:reset", async (event: IpcMainInvokeEvent) => {
		const agent = agents.get(event.sender.id);
		if (agent) {
			agent.reset();
			agents.delete(event.sender.id);
		}
		return { success: true };
	});

	// ── Set Model ─────────────────────────────────────────────────────
	ipcMain.handle(
		"pi-agent:set-model",
		async (
			event: IpcMainInvokeEvent,
			settings: PiAgentSettings & { apiKey?: string }
		) => {
			// Destroy old agent and create new one with updated model
			const oldAgent = agents.get(event.sender.id);
			if (oldAgent) {
				oldAgent.abort();
				agents.delete(event.sender.id);
			}

			await ensurePiModules();
			const agent = _createPiAgent!(settings, settings.apiKey);
			agents.set(event.sender.id, agent);
			return { success: true };
		}
	);

	// ── Get Models ────────────────────────────────────────────────────
	ipcMain.handle("pi-agent:get-models", async () => {
		await ensurePiModules();
		return _AVAILABLE_MODELS;
	});

	console.log("✅ PiAgentIPC registered");
}
