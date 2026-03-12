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
import { handleStickerCommand } from "../editor/editor-handlers-sticker.js";
import { handleSearchCommand } from "../editor/editor-handlers-search.js";
import {
	handleConsoleCommand,
	handleErrorsCommand,
} from "./cli-handlers-console.js";
import { handleDiffCommand } from "./cli-handlers-diff.js";
import { handleSessionCommand } from "./cli-handlers-session.js";
import { handleSnapshotCommand } from "./cli-handlers-snapshot.js";

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

/** Handle to object record. */
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

/** Handle is recording active. */
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

/** Handle wait ms. */
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

/** Handle fetch status with retry. */
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

/** Handle verify screen recording stopped. */
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
	onProgress: ProgressFn,
	signal?: AbortSignal
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
		options.command.startsWith("editor:diff:") ||
		options.command.startsWith("editor:session:") ||
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
			case "auth":
				return await handleAuthCommand(client, options);

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

			case "sticker":
				return await handleStickerCommand(client, options);

			case "search":
				return await handleSearchCommand(client, options, onProgress);

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

			case "snapshot":
				return await handleSnapshotCommand({ client, options });

			case "diff":
				return await handleDiffCommand({ options });

			case "session":
				return await handleSessionCommand({ options });

			case "console":
				return await handleConsoleCommand({ client, options, signal });

			case "errors":
				return await handleErrorsCommand({ client, options, signal });

			case "moyin":
				return await handleMoyinCommand(client, options);

			case "novel":
				return await handleNovelCommand(client, options, onProgress);

			case "screenshot":
				return await handleScreenshotCommand(client, options);

			default:
				return {
					success: false,
					error: `Unknown editor module: ${module}. Available: auth, health, media, project, timeline, editing, analyze, transcribe, search, generate, export, diagnostics, mcp, remotion, sticker, navigator, screen-recording, ui, snapshot, diff, session, console, errors, moyin, novel, screenshot, undo, redo, state`,
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
		case "context-menu": {
			const elementId = options.elementId;
			if (!elementId) {
				return {
					success: false,
					error:
						"Missing --element-id. Provide the timeline element ID to right-click.",
				};
			}
			const body: Record<string, unknown> = { elementId };
			if (options.verbose) body.debug = true;
			const data = await client.post("/api/claude/ui/context-menu", body);
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown ui action: ${action}. Available: switch-panel, context-menu`,
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
		case "export": {
			const data = await client.get("/api/claude/moyin/export");
			const fs = await import("node:fs/promises");
			const path = await import("node:path");
			const os = await import("node:os");
			// Default: ~/Documents/QCut/exports/moyin-export-{timestamp}.json
			let outputPath = options.output;
			if (!outputPath) {
				const docsDir = path.join(os.homedir(), "Documents", "QCut", "exports");
				const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				outputPath = path.join(docsDir, `moyin-export-${ts}.json`);
			}
			try {
				const absPath = path.resolve(outputPath);
				await fs.mkdir(path.dirname(absPath), { recursive: true });
				await fs.writeFile(absPath, JSON.stringify(data, null, 2));
				const exportData =
					typeof data === "object" && data !== null ? data : {};
				return {
					success: true,
					data: {
						...(exportData as Record<string, unknown>),
						exportedTo: absPath,
					},
				};
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return {
					success: false,
					error: `Failed to write export file: ${outputPath}. ${reason}`,
				};
			}
		}
		case "generate": {
			if (!options.idea) {
				return {
					success: false,
					error:
						"Missing --idea. Provide a description/idea for script generation.",
				};
			}
			const body: Record<string, string> = { idea: options.idea };
			if (options.genre) body.genre = options.genre;
			if (options.targetDuration) body.targetDuration = options.targetDuration;
			const data = await client.post("/api/claude/moyin/generate", body);
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown moyin action: ${action}. Available: set-script, parse, status, export, generate`,
			};
	}
}

/**
 * Handle `editor:novel:parse` command.
 * Sends novel text to the running editor for parsing via HTTP,
 * using ndjson streaming to show step-by-step progress.
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
			let text: string;
			let source: string;

			if (options.example) {
				const { EXAMPLE_NOVEL_EN } = await import(
					"../../moyin/novel-parse-example.js"
				);
				text = EXAMPLE_NOVEL_EN;
				source = "built-in example";
			} else if (options.input) {
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
				source = options.input;
			} else {
				return {
					success: false,
					error:
						"Missing --input or --example. Provide a novel text file or use --example to try the built-in demo.",
				};
			}

			if (!text.trim()) {
				return { success: false, error: "Input file is empty." };
			}

			onProgress({
				stage: "novel-parse",
				percent: 5,
				message: `Read ${text.length} chars from ${source}`,
			});

			const body: Record<string, unknown> = {
				text,
				language: options.language ?? "auto",
				stream: true,
			};
			if (options.maxClips != null) body.maxClips = options.maxClips;

			const data = await client.postStream(
				"/api/claude/novel/parse",
				body,
				(line) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === "progress") {
							onProgress({
								stage: msg.step,
								percent: msg.percent,
								message: msg.message,
							});
						}
					} catch {}
				}
			);

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

/**
 * Handle `editor:auth:*` commands.
 * - `token` — get or set the current auth token
 * - `activate` — set token and activate license
 * - `logout` — clear the auth token
 */
async function handleAuthCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2];

	switch (action) {
		case "token": {
			if (options.set) {
				const data = await client.post("/api/claude/auth/token", {
					token: options.set,
				});
				return { success: true, data };
			}
			const data = await client.get<{ token: string; authenticated: boolean }>(
				"/api/claude/auth/token"
			);
			if (!options.reveal && data.token && data.token.length > 8) {
				data.token =
					data.token.substring(0, 4) +
					"..." +
					data.token.substring(data.token.length - 4);
			}
			return { success: true, data };
		}
		case "activate": {
			if (!options.token) {
				return { success: false, error: "Missing --token" };
			}
			const data = await client.post("/api/claude/auth/activate", {
				token: options.token,
			});
			return { success: true, data };
		}
		case "logout": {
			const data = await client.delete("/api/claude/auth/token");
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown auth action: ${action}. Available: token, activate, logout`,
			};
	}
}
