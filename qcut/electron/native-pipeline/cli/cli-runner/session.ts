/**
 * Session/REPL mode for the CLI.
 *
 * Reads commands line-by-line from stdin and dispatches them through
 * a single CLIPipelineRunner instance, avoiding per-command process
 * startup, env loading, and health check overhead.
 *
 * Usage:
 *   qcut-pipeline --session <<'EOF'
 *   editor:navigator:projects
 *   editor:navigator:open --project-id abc123
 *   generate-image -t "sci-fi city" --count 2
 *   EOF
 *
 * Or interactively:
 *   qcut-pipeline --session
 *   > editor:health
 *   > generate-image -t "A cat"
 *   > exit
 *
 * @module electron/native-pipeline/cli/cli-runner/session
 */

import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";
import type { CLIPipelineRunner } from "./runner.js";
import {
	EditorApiClient,
	createEditorClient,
} from "../../editor/editor-api-client.js";
import { emitJsonResult } from "../json-output.js";
import {
	applySessionStateToOptions,
	createEmptySessionState,
	loadSessionState,
	saveSessionState,
	updateSessionState,
	type SessionState,
} from "../session-state.js";

/**
 * Shared editor client for session mode.
 * Created once on the first editor command and reused for all subsequent ones.
 */
let sessionClient: EditorApiClient | null = null;
let sessionHealthChecked = false;

/**
 * Get or create the shared editor client for session mode.
 */
export function getSessionClient(options: CLIRunOptions): EditorApiClient {
	if (!sessionClient) {
		sessionClient = createEditorClient(options);
	}
	return sessionClient;
}

/**
 * Check if the session health has already been verified.
 */
export function isSessionHealthChecked(): boolean {
	return sessionHealthChecked;
}

/**
 * Mark session health as checked.
 */
export function markSessionHealthChecked(): void {
	sessionHealthChecked = true;
}

/**
 * Reset session state (for testing).
 */
export function resetSessionState(): void {
	sessionClient = null;
	sessionHealthChecked = false;
}

/**
 * Parse a single command line into CLIRunOptions.
 * Uses lightweight arg parsing without process.exit.
 */
export function parseSessionLine(
	line: string,
	baseOptions: Partial<CLIRunOptions>
): CLIRunOptions | null {
	const trimmed = line.trim();

	// Skip empty lines, comments
	if (!trimmed || trimmed.startsWith("#")) {
		return null;
	}

	// Exit commands
	if (trimmed === "exit" || trimmed === "quit") {
		return null;
	}

	// Tokenize respecting quoted strings
	const tokens = tokenize(trimmed);
	if (tokens.length === 0) return null;

	const command = tokens[0];
	const argTokens = tokens.slice(1);

	// Build a minimal options object by parsing known flags
	const parsed = parseSessionArgs(argTokens);

	return {
		command,
		outputDir: baseOptions.outputDir ?? "./output",
		saveIntermediates: false,
		json: baseOptions.json ?? false,
		verbose: baseOptions.verbose ?? false,
		quiet: baseOptions.quiet ?? false,
		// Carry over host/port/token/performance flags from base options
		host: baseOptions.host,
		port: baseOptions.port,
		token: baseOptions.token,
		policy: baseOptions.policy,
		stateDir: baseOptions.stateDir,
		resume: baseOptions.resume,
		skipHealth: baseOptions.skipHealth,
		noCapabilityCheck: baseOptions.noCapabilityCheck,
		projectId: baseOptions.projectId,
		panel: baseOptions.panel,
		tab: baseOptions.tab,
		session: baseOptions.session,
		...parsed,
	};
}

/**
 * Tokenize a string respecting double and single quotes.
 * Supports backslash-escaped quotes inside quoted strings.
 */
function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	let escaped = false;

	for (const ch of input) {
		if (escaped) {
			current += ch;
			escaped = false;
			continue;
		}
		if (ch === "\\" && (inDouble || inSingle)) {
			escaped = true;
			continue;
		}
		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
		} else if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
		} else if (ch === " " && !inSingle && !inDouble) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += ch;
		}
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

/**
 * Parse session-mode arguments into a partial CLIRunOptions.
 * Does not call process.exit on errors.
 */
function parseSessionArgs(args: string[]): Partial<CLIRunOptions> {
	try {
		const { values } = parseArgs({
			args,
			options: {
				model: { type: "string", short: "m" },
				text: { type: "string", short: "t" },
				"image-url": { type: "string" },
				"video-url": { type: "string" },
				"audio-url": { type: "string" },
				"output-dir": { type: "string", short: "o" },
				policy: { type: "string" },
				resume: { type: "string" },
				"state-dir": { type: "string" },
				before: { type: "string" },
				after: { type: "string" },
				duration: { type: "string", short: "d" },
				"aspect-ratio": { type: "string" },
				resolution: { type: "string" },
				"project-id": { type: "string" },
				"media-id": { type: "string" },
				"element-id": { type: "string" },
				"job-id": { type: "string" },
				source: { type: "string" },
				"source-id": { type: "string" },
				data: { type: "string" },
				items: { type: "string" },
				sources: { type: "string" },
				elements: { type: "string" },
				time: { type: "string" },
				"new-name": { type: "string" },
				filename: { type: "string" },
				panel: { type: "string" },
				tab: { type: "string" },
				url: { type: "string" },
				count: { type: "string" },
				prompts: { type: "string", multiple: true },
				force: { type: "boolean", default: false },
				discard: { type: "boolean", default: false },
				replace: { type: "boolean", default: false },
				poll: { type: "boolean", default: false },
				json: { type: "boolean", default: false },
				"negative-prompt": { type: "string" },
				"voice-id": { type: "string" },
				// sticker options
				x: { type: "string" },
				y: { type: "string" },
				opacity: { type: "string" },
				rotation: { type: "string" },
				"sticker-id": { type: "string" },
				"start-time": { type: "string" },
				"end-time": { type: "string" },
				width: { type: "string" },
				height: { type: "string" },
			},
			strict: false,
		});

		const result: Partial<CLIRunOptions> = {};
		if (values.model) result.model = values.model as string;
		if (values.text) result.text = values.text as string;
		if (values["image-url"]) result.imageUrl = values["image-url"] as string;
		if (values["video-url"]) result.videoUrl = values["video-url"] as string;
		if (values["audio-url"]) result.audioUrl = values["audio-url"] as string;
		if (values["output-dir"]) result.outputDir = values["output-dir"] as string;
		if (values.policy) result.policy = values.policy as string;
		if (values.resume) result.resume = values.resume as string;
		if (values["state-dir"]) result.stateDir = values["state-dir"] as string;
		if (values.before) result.before = values.before as string;
		if (values.after) result.after = values.after as string;
		if (values.duration) result.duration = values.duration as string;
		if (values["aspect-ratio"])
			result.aspectRatio = values["aspect-ratio"] as string;
		if (values.resolution) result.resolution = values.resolution as string;
		if (values["project-id"]) result.projectId = values["project-id"] as string;
		if (values["media-id"]) result.mediaId = values["media-id"] as string;
		if (values["element-id"]) result.elementId = values["element-id"] as string;
		if (values["job-id"]) result.jobId = values["job-id"] as string;
		if (values.source) result.source = values.source as string;
		if (values["source-id"]) result.sourceId = values["source-id"] as string;
		if (values.data) result.data = values.data as string;
		if (values.items) result.items = values.items as string;
		if (values.sources) result.sources = values.sources as string;
		if (values.elements) result.elements = values.elements as string;
		if (values["new-name"]) result.newName = values["new-name"] as string;
		if (values.filename) result.filename = values.filename as string;
		if (values.panel) result.panel = values.panel as string;
		if (values.tab) result.tab = values.tab as string;
		if (values.url) result.url = values.url as string;
		if (values["negative-prompt"])
			result.negativePrompt = values["negative-prompt"] as string;
		if (values["voice-id"]) result.voiceId = values["voice-id"] as string;
		if (values.force) result.force = true;
		if (values.discard) result.discard = true;
		if (values.replace) result.replace = true;
		if (values.poll) result.poll = true;
		if (values.json) result.json = true;
		if (values.time) {
			result.seekTime = Number.isNaN(parseFloat(values.time as string))
				? undefined
				: parseFloat(values.time as string);
		}
		if (values.count) {
			result.count = Number.isNaN(parseInt(values.count as string, 10))
				? undefined
				: parseInt(values.count as string, 10);
		}
		if (values.prompts) result.prompts = values.prompts as string[];
		// sticker options
		if (values.x !== undefined) result.x = Number(values.x);
		if (values.y !== undefined) result.y = Number(values.y);
		if (values.opacity !== undefined) result.opacity = Number(values.opacity);
		if (values.rotation !== undefined)
			result.rotation = Number(values.rotation);
		if (values["sticker-id"]) result.stickerId = values["sticker-id"] as string;
		if (values["start-time"] !== undefined)
			result.startTime = parseFloat(values["start-time"] as string);
		if (values["end-time"] !== undefined)
			result.endTime = parseFloat(values["end-time"] as string);
		if (values.width !== undefined) result.width = Number(values.width);
		if (values.height !== undefined) result.height = Number(values.height);

		return result;
	} catch {
		// If parsing fails, return empty — runner will report the error
		return {};
	}
}

/**
 * Run the CLI in session mode: read commands line-by-line and dispatch them.
 */
export async function runSession(
	runner: CLIPipelineRunner,
	baseOptions: Partial<CLIRunOptions>,
	onProgress: ProgressFn
): Promise<void> {
	const isInteractive = process.stdin.isTTY === true;
	const output = baseOptions.json ? "json" : "text";
	let activeSessionState: SessionState | null = null;
	let sessionBaseOptions = { ...baseOptions };

	if (baseOptions.resume) {
		activeSessionState =
			loadSessionState({
				sessionName: baseOptions.resume,
				stateDir: baseOptions.stateDir,
			}) ?? createEmptySessionState({ sessionName: baseOptions.resume });
		const hydrated = applySessionStateToOptions({
			options: {
				command: "__session__",
				outputDir: sessionBaseOptions.outputDir ?? "./output",
				saveIntermediates: false,
				json: sessionBaseOptions.json ?? false,
				verbose: sessionBaseOptions.verbose ?? false,
				quiet: sessionBaseOptions.quiet ?? false,
				host: sessionBaseOptions.host,
				port: sessionBaseOptions.port,
				token: sessionBaseOptions.token,
				policy: sessionBaseOptions.policy,
				stateDir: sessionBaseOptions.stateDir,
				resume: sessionBaseOptions.resume,
				session: true,
				projectId: sessionBaseOptions.projectId,
				panel: sessionBaseOptions.panel,
				tab: sessionBaseOptions.tab,
				skipHealth: sessionBaseOptions.skipHealth,
				noCapabilityCheck: sessionBaseOptions.noCapabilityCheck,
			},
			sessionState: activeSessionState,
		});
		sessionBaseOptions = {
			...sessionBaseOptions,
			projectId: hydrated.projectId,
			panel: hydrated.panel,
			tab: hydrated.tab,
		};
	}

	if (isInteractive) {
		process.stderr.write("qcut-pipeline session mode. Type 'exit' to quit.\n");
	}

	const rl = createInterface({
		input: process.stdin,
		output: isInteractive ? process.stderr : undefined,
		prompt: isInteractive ? "> " : "",
		terminal: isInteractive,
	});

	if (isInteractive) {
		rl.prompt();
	}

	for await (const line of rl) {
		const options = parseSessionLine(line, sessionBaseOptions);
		if (!options) {
			// null means skip (comment/empty) or exit
			const trimmed = line.trim();
			if (trimmed === "exit" || trimmed === "quit") {
				break;
			}
			if (isInteractive) rl.prompt();
			continue;
		}

		const startTime = Date.now();

		try {
			const result = await runner.run(options, onProgress);
			if (options.resume && activeSessionState) {
				activeSessionState = updateSessionState({
					sessionState: activeSessionState,
					options,
					result,
				});
				saveSessionState({
					sessionState: activeSessionState,
					stateDir: options.stateDir,
				});
				sessionBaseOptions = {
					...sessionBaseOptions,
					projectId: activeSessionState.projectId,
					panel: activeSessionState.lastPanel,
					tab: activeSessionState.lastTab,
				};
			}

			if (output === "json") {
				emitJsonResult(options.command, result, {
					sessionDuration: (Date.now() - startTime) / 1000,
				});
			} else if (result.success) {
				if (result.outputPath) {
					process.stderr.write(`Output: ${result.outputPath}\n`);
				}
				if (result.data !== undefined) {
					console.log(JSON.stringify(result.data, null, 2));
				}
			} else {
				process.stderr.write(`Error: ${result.error}\n`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (output === "json") {
				emitJsonResult(options.command, {
					success: false,
					error: msg,
				});
			} else {
				process.stderr.write(`Error: ${msg}\n`);
			}
		}

		if (isInteractive) rl.prompt();
	}
}
