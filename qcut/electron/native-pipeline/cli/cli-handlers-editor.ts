/**
 * Editor Command Dispatcher
 *
 * Routes all `editor:*` CLI commands to the appropriate handler module.
 * Performs health check before dispatching (except for editor:health itself).
 *
 * @module electron/native-pipeline/cli-handlers-editor
 */

import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import { createEditorClient } from "../editor/editor-api-client.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import {
	getSessionClient,
	isSessionHealthChecked,
	markSessionHealthChecked,
} from "./cli-runner/session.js";
import {
	handleEditorHealth,
	handleMediaProjectCommand,
} from "../editor/editor-handlers-media.js";
import { handleTimelineEditingCommand } from "../editor/editor-handlers-timeline.js";
import { handleAnalysisCommand } from "../editor/editor-handlers-analysis.js";
import { handleGenerateExportCommand } from "../editor/editor-handlers-generate.js";
import { handleRemotionCommand } from "../editor/editor-handlers-remotion.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

interface ScreenRecordingStatusResponse {
	recording?: boolean;
}

const SCREEN_RECORDING_STATUS_MAX_ATTEMPTS = 3;
const SCREEN_RECORDING_STATUS_RETRY_DELAY_MS = 250;

function toObjectRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	try {
		if (typeof value !== "object" || value === null) {
			return undefined;
		}
		return value as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function isRecordingActive({ status }: { status: unknown }): boolean {
	try {
		const statusRecord = toObjectRecord({ value: status });
		if (!statusRecord) {
			return false;
		}
		return statusRecord.recording === true;
	} catch {
		return false;
	}
}

async function waitMs({ delayMs }: { delayMs: number }): Promise<void> {
	try {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, delayMs);
		});
	} catch (error) {
		throw new Error(
			`Failed to wait before status retry: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

async function fetchStatusWithRetry({
	client,
	remainingAttempts,
}: {
	client: EditorApiClient;
	remainingAttempts: number;
}): Promise<ScreenRecordingStatusResponse> {
	try {
		const statusAfterStop = await client.get<ScreenRecordingStatusResponse>(
			"/api/claude/screen-recording/status"
		);
		const isActive = isRecordingActive({ status: statusAfterStop });
		if (!isActive || remainingAttempts <= 1) {
			return statusAfterStop;
		}

		await waitMs({ delayMs: SCREEN_RECORDING_STATUS_RETRY_DELAY_MS });
		return await fetchStatusWithRetry({
			client,
			remainingAttempts: remainingAttempts - 1,
		});
	} catch (error) {
		throw new Error(
			`Failed to fetch screen recording status: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

async function verifyScreenRecordingStopped({
	client,
}: {
	client: EditorApiClient;
}): Promise<{
	recoveredViaForceStop: boolean;
	forceStopData?: unknown;
}> {
	try {
		const statusAfterStop = await fetchStatusWithRetry({
			client,
			remainingAttempts: SCREEN_RECORDING_STATUS_MAX_ATTEMPTS,
		});
		if (!isRecordingActive({ status: statusAfterStop })) {
			return { recoveredViaForceStop: false };
		}

		const forceStopData = await client.post(
			"/api/claude/screen-recording/force-stop",
			{}
		);
		const statusAfterForceStop = await fetchStatusWithRetry({
			client,
			remainingAttempts: SCREEN_RECORDING_STATUS_MAX_ATTEMPTS,
		});
		if (isRecordingActive({ status: statusAfterForceStop })) {
			throw new Error(
				"Screen recording is still active after force-stop recovery"
			);
		}

		return {
			recoveredViaForceStop: true,
			forceStopData,
		};
	} catch (error) {
		throw new Error(
			`Failed to verify screen recording stop state: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Main entry point for all `editor:*` commands.
 * Called from cli-runner.ts when command starts with "editor:".
 */
export async function handleEditorCommand(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	// In session mode, reuse the shared client. Otherwise create a new one.
	const client = options.session
		? getSessionClient(options)
		: createEditorClient(options);

	// Health check before any command (skip for editor:health itself)
	// --skip-health: in one-shot mode, skip unconditionally (caller guarantees editor is up)
	//                in session mode, skip after first successful check
	const shouldSkipHealth =
		options.command === "editor:health" ||
		(options.skipHealth && (!options.session || isSessionHealthChecked()));

	if (!shouldSkipHealth) {
		const healthy = await client.checkHealth();
		if (!healthy) {
			const host = options.host ?? process.env.QCUT_API_HOST ?? "127.0.0.1";
			const port = options.port ?? process.env.QCUT_API_PORT ?? "8765";
			return {
				success: false,
				error: `QCut editor not running at http://${host}:${port}\nStart QCut with: bun run electron:dev`,
			};
		}
		markSessionHealthChecked();
	}

	// Extract module: "editor:media:list" → "media"
	const parts = options.command.split(":");
	const module = parts[1];

	try {
		switch (module) {
			case "health":
				return await handleEditorHealth(client, options);

			case "media":
			case "project":
				return await handleMediaProjectCommand(client, options, onProgress);

			case "timeline":
			case "editing":
				return await handleTimelineEditingCommand(client, options, onProgress);

			case "analyze":
			case "transcribe":
				return await handleAnalysisCommand(client, options, onProgress);

			case "generate":
			case "export":
			case "diagnostics":
			case "mcp":
				return await handleGenerateExportCommand(client, options, onProgress);

			case "remotion":
				return await handleRemotionCommand(client, options);

			case "undo":
			case "redo":
			case "state":
				return await handleStateCommand(client, options);

			case "navigator":
				return await handleNavigatorCommand(client, options);

			case "screen-recording":
				return await handleScreenRecordingCommand(client, options);

			case "ui":
				return await handleUiCommand(client, options);

			case "moyin":
				return await handleMoyinCommand(client, options);

			case "novel":
				return await handleNovelCommand(client, options, onProgress);

			case "screenshot":
				return await handleScreenshotCommand(client, options);

			default:
				return {
					success: false,
					error: `Unknown editor module: ${module}. Available: health, media, project, timeline, editing, analyze, transcribe, generate, export, diagnostics, mcp, remotion, navigator, screen-recording, ui, moyin, novel, screenshot, undo, redo, state`,
				};
		}
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Handle `editor:undo`, `editor:redo`, and `editor:state:*` commands.
 */
async function handleStateCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const module = parts[1]; // "undo", "redo", or "state"

	switch (module) {
		case "undo": {
			const data = await client.post("/api/claude/undo", {});
			return { success: true, data };
		}
		case "redo": {
			const data = await client.post("/api/claude/redo", {});
			return { success: true, data };
		}
		case "state": {
			const action = parts[2]; // "snapshot"
			if (action !== "snapshot") {
				return {
					success: false,
					error: `Unknown state action: ${action}. Available: snapshot`,
				};
			}
			const queryParams = options.include
				? `?include=${encodeURIComponent(options.include)}`
				: "";
			const data = await client.get(`/api/claude/state${queryParams}`);
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown state module: ${module}`,
			};
	}
}

/**
 * Handle `editor:navigator:*` commands.
 * - `projects` — list all saved projects
 * - `open` — navigate the editor to a specific project
 */
async function handleNavigatorCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "projects" or "open"

	switch (action) {
		case "projects": {
			const data = await client.get("/api/claude/navigator/projects");
			return { success: true, data };
		}
		case "open": {
			if (!options.projectId) {
				return {
					success: false,
					error: "Missing --project-id",
				};
			}
			const data = await client.post("/api/claude/navigator/open", {
				projectId: options.projectId,
			});
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown navigator action: ${action}. Available: projects, open`,
			};
	}
}

/**
 * Handle `editor:screen-recording:*` commands.
 * - `sources` — list available capture sources
 * - `start` — start screen recording
 * - `stop` — stop screen recording
 * - `force-stop` — force stop active screen recording
 * - `status` — get current recording status
 */
async function handleScreenRecordingCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2];

	switch (action) {
		case "sources": {
			const data = await client.get("/api/claude/screen-recording/sources");
			return { success: true, data };
		}
		case "start": {
			if (options.force) {
				try {
					await client.post("/api/claude/screen-recording/force-stop", {});
				} catch {
					// best-effort pre-cleanup for orphaned sessions
				}
			}
			const body: Record<string, unknown> = {};
			if (options.sourceId) body.sourceId = options.sourceId;
			if (options.filename) body.fileName = options.filename;
			const data = await client.post(
				"/api/claude/screen-recording/start",
				body
			);
			return { success: true, data };
		}
		case "stop": {
			const body: Record<string, unknown> = {};
			if (options.discard) body.discard = true;
			const stopData = await client.post(
				"/api/claude/screen-recording/stop",
				body,
				{ timeout: 30_000 }
			);
			const verification = await verifyScreenRecordingStopped({ client });
			if (!verification.recoveredViaForceStop) {
				return { success: true, data: stopData };
			}

			const stopDataRecord = toObjectRecord({ value: stopData });
			if (stopDataRecord) {
				return {
					success: true,
					data: {
						...stopDataRecord,
						recoveredViaForceStop: true,
						forceStopData: verification.forceStopData,
					},
				};
			}

			return {
				success: true,
				data: {
					stopData,
					recoveredViaForceStop: true,
					forceStopData: verification.forceStopData,
				},
			};
		}
		case "force-stop": {
			const data = await client.post(
				"/api/claude/screen-recording/force-stop",
				{}
			);
			return { success: true, data };
		}
		case "status": {
			const data = await client.get("/api/claude/screen-recording/status");
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown screen-recording action: ${action}. Available: sources, start, stop, force-stop, status`,
			};
	}
}

/**
 * Handle `editor:ui:*` commands.
 * - `switch-panel` — switch to a specific editor panel
 */
async function handleUiCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "switch-panel"

	switch (action) {
		case "switch-panel": {
			const panel = options.panel;
			if (!panel) {
				return {
					success: false,
					error:
						"Missing --panel. Available: media, text, stickers, video-edit, effects, transitions, filters, text2image, nano-edit, ai, sounds, segmentation, remotion, pty, word-timeline, project-folder, upscale, moyin. Aliases: terminal, skills, library, ai-video, ai-images, audio-studio, smart-speech, project. Use --tab for moyin inner tabs: overview (structure), characters, scenes, shots, generate",
				};
			}
			const body: Record<string, string> = { panel };
			if (options.tab) {
				body.tab = options.tab;
			}
			const data = await client.post("/api/claude/ui/switch-panel", body);
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown ui action: ${action}. Available: switch-panel`,
			};
	}
}

/**
 * Handle `editor:moyin:*` commands.
 * - `set-script` — push script text into the moyin textarea
 * - `parse` — trigger the "Parse Script" button
 * - `status` — poll pipeline progress
 */
async function handleMoyinCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "set-script", "parse", "status"

	switch (action) {
		case "set-script": {
			if (options.text && options.script) {
				return {
					success: false,
					error:
						"--text and --script are mutually exclusive. Use --text for inline text or --script for a file path.",
				};
			}
			if (!options.text && !options.script) {
				return {
					success: false,
					error:
						"Missing --text or --script. Provide script text inline or as a file path.",
				};
			}
			// If --script is a file path, read it
			let scriptText = options.text ?? "";
			if (options.script) {
				try {
					const fs = await import("node:fs/promises");
					scriptText = await fs.readFile(options.script, "utf-8");
				} catch (error) {
					const reason = error instanceof Error ? error.message : String(error);
					return {
						success: false,
						error: `Failed to read script file: ${options.script}. ${reason}`,
					};
				}
			}
			const data = await client.post("/api/claude/moyin/set-script", {
				text: scriptText,
			});
			return { success: true, data };
		}
		case "parse": {
			const data = await client.post("/api/claude/moyin/parse", {});
			return { success: true, data };
		}
		case "status": {
			const data = await client.get("/api/claude/moyin/status");
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown moyin action: ${action}. Available: set-script, parse, status`,
			};
	}
}

/**
 * Handle `editor:novel:parse` command.
 * Reads a novel text file and sends it to the editor for parsing.
 */
async function handleNovelCommand(
	client: EditorApiClient,
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "parse"

	switch (action) {
		case "parse": {
			if (!options.input) {
				return {
					success: false,
					error: "Missing --input. Provide path to a novel text file.",
				};
			}

			let text: string;
			try {
				const fs = await import("node:fs/promises");
				text = await fs.readFile(options.input, "utf-8");
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					error: `Failed to read input file: ${options.input}. ${reason}`,
				};
			}

			if (!text.trim()) {
				return { success: false, error: "Input file is empty." };
			}

			onProgress({
				stage: "novel-parse",
				percent: 10,
				message: `Parsing novel (${text.length} chars)...`,
			});

			const body: Record<string, unknown> = {
				text,
				language: options.language ?? "auto",
			};
			if (options.maxClips != null) body.maxClips = options.maxClips;

			const data = await client.post("/api/claude/novel/parse", body);

			onProgress({
				stage: "novel-parse",
				percent: 100,
				message: "Novel parsing complete.",
			});

			// Write to output file if specified
			if (options.output) {
				const fs = await import("node:fs/promises");
				await fs.writeFile(
					options.output,
					JSON.stringify(data, null, 2),
					"utf-8"
				);
				return {
					success: true,
					data: { message: `Wrote ${options.output}`, result: data },
					outputPath: options.output,
				};
			}

			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown novel action: ${action}. Available: parse`,
			};
	}
}

/**
 * Handle `editor:screenshot:*` commands.
 * - `capture` — take a screenshot of the QCut window
 */
async function handleScreenshotCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "capture"

	switch (action) {
		case "capture": {
			const body: Record<string, unknown> = {};
			if (options.filename) body.fileName = options.filename;
			const data = await client.post("/api/claude/screenshot/capture", body);
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown screenshot action: ${action}. Available: capture`,
			};
	}
}
