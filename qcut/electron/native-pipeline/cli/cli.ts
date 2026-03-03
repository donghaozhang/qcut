#!/usr/bin/env node
/**
 * CLI entry point for the native video agent pipeline.
 *
 * Run AI content generation pipelines from the command line
 * without the Electron GUI. Uses the same native TypeScript
 * pipeline modules as the QCut editor.
 *
 * Usage: bun run electron/native-pipeline/cli.ts <command> [options]
 *
 * @module electron/native-pipeline/cli
 */

import { parseArgs } from "node:util";
import { initRegistry } from "../init.js";
import {
	CLIPipelineRunner,
	createProgressReporter,
} from "../cli/cli-runner.js";
import type { CLIRunOptions } from "./cli-runner/types.js";
import { getExitCode, formatErrorForCli } from "../output/errors.js";
import { CLIOutput } from "../cli/cli-output.js";
import { StreamEmitter, NullEmitter } from "../infra/stream-emitter.js";
import { formatCommandOutput } from "./cli-output-formatters.js";
import { runSession } from "./cli-runner/session.js";
import { emitJsonResult, jsonOk, jsonError } from "./json-output.js";
import {
	COMMANDS_REGISTRY,
	CATEGORIES,
	GLOBAL_FLAGS,
	getCommand,
	getCommandFlag,
} from "./command-registry.js";
const VERSION = "1.0.0";

/** Command list derived from the central registry. */
const COMMANDS = Object.keys(COMMANDS_REGISTRY);

type Command = string;

function printHelp(): void {
	console.log(
		`
qcut-pipeline v${VERSION} — AI content generation CLI

Usage: qcut-pipeline <command> [options]

Commands:
  generate-image      Generate an image from text
  create-video        Create a video from text or image
  generate-avatar     Generate a talking avatar video
  run-pipeline        Run a multi-step YAML pipeline
  list-models         List available AI models
  estimate-cost       Estimate generation cost
  analyze-video       Analyze a video with AI vision
  query-video         Query a video with a custom prompt (keep/cut segments)
  transcribe          Transcribe audio to text
  generate-remotion   Generate a Remotion component from a prompt
  transfer-motion     Transfer motion from video to image
  generate-grid       Generate an image grid
  upscale-image       Upscale an image
  setup               Create API key template file
  set-key             Set an API key
  get-key             Get an API key (masked)
  delete-key          Delete a stored API key
  check-keys          Check configured API keys
  init-project        Initialize project directory structure
  organize-project    Organize media files into categories
  structure-info      Show project structure and file counts
  create-examples     Create example pipeline configs
Moyin Commands:
  moyin:parse-script  Parse screenplay into structured data (characters/scenes)

ViMax Commands:
  vimax:idea2video    Generate video from an idea
  vimax:script2video  Generate video from a script
  vimax:novel2movie   Generate movie from a novel
  vimax:extract-characters  Extract characters from text
  vimax:generate-script     Generate screenplay from idea
  vimax:generate-storyboard Generate storyboard from script
  vimax:generate-portraits  Generate character portraits
  vimax:create-registry     Create portrait registry from files
  vimax:show-registry       Display registry contents
  vimax:list-models         List ViMax-specific models
  list-avatar-models  List avatar/video/motion/speech models
  list-video-models   list-motion-models  list-speech-models

Editor Commands (requires running QCut — use --project-id for most):
  editor:health                     Check editor connectivity
  editor:media:*                    list, info, import, import-url, batch-import,
                                    extract-frame, rename, delete
  editor:project:*                  settings, update-settings, stats, summary,
                                    report, create, delete, rename, duplicate, list, info
  editor:timeline:*                 export, import, add-element, batch-add,
                                    update-element, batch-update, delete-element,
                                    batch-delete, split, move, arrange, select,
                                    get-selection, clear-selection, play, pause,
                                    toggle-play, seek, info, add-clip, trim
  editor:editing:*                  batch-cuts, delete-range, auto-edit,
                                    auto-edit-status, auto-edit-list, suggest-cuts, suggest-status
  editor:analyze:*                  video, models, scenes, frames, fillers
  editor:transcribe:*               run, start, status, list-jobs, cancel
  editor:generate:*                 start, status, list-jobs, cancel, models, estimate-cost
  editor:export:*                   presets, recommend, start, status, list-jobs
  editor:diagnostics:analyze        Analyze error (--message)
  editor:mcp:forward-html           Forward HTML to MCP preview
  editor:navigator:projects/open    List or open projects
  editor:screen-recording:*         sources, start, stop, force-stop, status
  editor:remotion:*                 list, inspect, update-props, export
  editor:ui:switch-panel            Switch editor panel (--panel, --tab)
  editor:moyin:*                    set-script, parse, status
  editor:screenshot:capture         Take screenshot (--filename)
  pipeline:status                   Get pipeline job status (--job-id)

  Use <command> --help --json for detailed flag info per command.

Global Options:
  --output-dir, -o    Output directory (default: ./output)
  --model, -m         Model key (e.g. kling_2_6_pro, flux_dev)
  --json              Output results as JSON
  --quiet, -q         Suppress progress output
  --help, -h          Show help
  --version           Show version

Generation Options:
  --text, -t          Text prompt for generation
  --image-url         Input image URL
  --video-url         Input video URL
  --audio-url         Input audio URL
  --duration, -d      Duration (e.g. "5s", "10")
  --aspect-ratio      Aspect ratio (e.g. "16:9", "9:16")
  --resolution        Resolution (e.g. "1080p", "720p")
  --count             Generate N copies in parallel (e.g. --count 3)
  --prompts           Multiple prompts for parallel generation (repeatable)

Pipeline Options:
  --config, -c        Path to YAML pipeline config
  --input, -i         Pipeline input text or file path
  --save-intermediates Save intermediate step outputs
  --parallel          Enable parallel step execution
  --max-workers       Max concurrent workers (default: 8)

Performance Options:
  --skip-health           Skip editor health check (use when editor is known up)
  --no-capability-check   Skip per-request capability warnings
  --session               Session mode: read commands from stdin, one per line

Editor Options (see docs for full list):
  --project-id   Project ID    --media-id   Media ID
  --element-id   Element ID    --track-id   Track ID
  --job-id       Job ID        --data       JSON input (@file/inline/-)
  --to-track     Target track  --split-time Split point (s)
  --time         Seek time (s) --start-time Start (s)
  --end-time     End (s)
  --mode         Arrange mode  --replace    Replace on import
  --ripple       Ripple edit   --poll       Auto-poll async jobs
  --host/--port  API endpoint (default: 127.0.0.1:8765)
  --token        API auth      --timeout    Job timeout (s)

Environment Variables:
  FAL_KEY             FAL.ai API key
  GEMINI_API_KEY      Google Gemini API key
  OPENROUTER_API_KEY  OpenRouter API key
  ELEVENLABS_API_KEY  ElevenLabs API key

Examples:
  qcut-pipeline generate-image -t "A cat in space"
  qcut-pipeline create-video -m kling_2_6_pro -t "Ocean waves" -d 5s
  qcut-pipeline run-pipeline -c pipeline.yaml -i "A sunset"
  qcut-pipeline editor:timeline:export --project-id my-proj --json
`.trim()
	);
}

// ─── JSON Help Output (3-Level Progressive) ─────────────────────────

/** Level 1: Root overview — version, categories, command list. */
function printHelpJson(): void {
	const commands = Object.values(COMMANDS_REGISTRY).map((cmd) => ({
		name: cmd.name,
		description: cmd.description,
		category: cmd.category,
	}));
	jsonOk({
		version: VERSION,
		description: "AI content generation CLI",
		categories: CATEGORIES,
		commands,
		globalFlags: GLOBAL_FLAGS,
	});
}

/** Level 2: Command detail — flags, examples, usage. */
function printCommandHelpJson(command: string): void {
	const def = getCommand(command);
	if (!def) {
		jsonError(`Unknown command: ${command}`, "help:unknown-command");
		return;
	}
	const required = def.flags.filter((fl) => fl.required);
	const optional = def.flags.filter((fl) => !fl.required);
	jsonOk({
		command: def.name,
		description: def.description,
		category: def.category,
		usage: def.usage ?? `qcut-pipeline ${def.name} [options]`,
		required,
		optional,
		examples: def.examples,
	});
}

/** Level 3: Single parameter detail — type, enum, default. */
function printParamHelpJson(command: string, paramName: string): void {
	const flag = getCommandFlag(command, paramName);
	if (!flag) {
		jsonError(
			`Unknown parameter '${paramName}' for command '${command}'`,
			"help:unknown-param"
		);
		return;
	}
	const data: Record<string, unknown> = {
		name: flag.name,
		type: flag.type,
		description: flag.description,
	};
	if (flag.short) data.short = flag.short;
	if (flag.required) data.required = flag.required;
	if (flag.default !== undefined) data.default = flag.default;
	if (flag.enum) data.enum = flag.enum;
	jsonOk(data);
}

/**
 * Find a bare parameter name after --help in argv.
 * e.g. ["--help", "model", "--json"] → "model"
 */
function findHelpParam(argv: string[]): string | null {
	const helpIdx = argv.indexOf("--help");
	if (helpIdx === -1) return null;
	const next = argv[helpIdx + 1];
	if (next && !next.startsWith("-")) return next;
	return null;
}

/** Parse process argv into CLIRunOptions, exiting on --help/--version. */
export function parseCliArgs(argv: string[]): CLIRunOptions {
	const command = argv[0];

	if (!command || command === "--help" || command === "-h") {
		if (argv.includes("--json")) {
			printHelpJson();
		} else {
			printHelp();
		}
		process.exit(0);
	}

	if (command === "--version") {
		console.log(VERSION);
		process.exit(0);
	}

	if (!COMMANDS.includes(command)) {
		console.error(`Unknown command: ${command}`);
		console.error("Run with --help for usage.");
		process.exit(2);
	}

	const { values } = parseArgs({
		args: argv.slice(1),
		options: {
			model: { type: "string", short: "m" },
			text: { type: "string", short: "t" },
			"image-url": { type: "string" },
			"video-url": { type: "string" },
			"audio-url": { type: "string" },
			"output-dir": { type: "string", short: "o" },
			duration: { type: "string", short: "d" },
			"aspect-ratio": { type: "string" },
			resolution: { type: "string" },
			config: { type: "string", short: "c" },
			input: { type: "string", short: "i" },
			"save-intermediates": { type: "boolean", default: false },
			parallel: { type: "boolean", default: false },
			"max-workers": { type: "string" },
			json: { type: "boolean", default: false },
			quiet: { type: "boolean", short: "q", default: false },
			verbose: { type: "boolean", short: "v", default: false },
			help: { type: "boolean", short: "h", default: false },
			category: { type: "string" },
			prompt: { type: "string" },
			layout: { type: "string" },
			upscale: { type: "string" },
			name: { type: "string" },
			value: { type: "string" },
			idea: { type: "string" },
			script: { type: "string" },
			novel: { type: "string" },
			title: { type: "string" },
			"max-scenes": { type: "string" },
			"scripts-only": { type: "boolean", default: false },
			"storyboard-only": { type: "boolean", default: false },
			"no-portraits": { type: "boolean", default: false },
			"llm-model": { type: "string" },
			"image-model": { type: "string" },
			"video-model": { type: "string" },
			image: { type: "string" },
			stream: { type: "boolean", default: false },
			"config-dir": { type: "string" },
			"cache-dir": { type: "string" },
			"state-dir": { type: "string" },
			"negative-prompt": { type: "string" },
			"voice-id": { type: "string" },
			directory: { type: "string" },
			"dry-run": { type: "boolean", default: false },
			recursive: { type: "boolean", default: false },
			"include-output": { type: "boolean", default: false },
			source: { type: "string" },
			reveal: { type: "boolean", default: false },
			"no-confirm": { type: "boolean", default: false },
			"prompt-file": { type: "string" },
			portraits: { type: "string", short: "p" },
			views: { type: "string" },
			"max-characters": { type: "string" },
			"save-registry": { type: "boolean", default: true },
			style: { type: "string" },
			"reference-model": { type: "string" },
			"reference-strength": { type: "string" },
			// transcribe options
			language: { type: "string" },
			"no-diarize": { type: "boolean", default: false },
			"no-tag-events": { type: "boolean", default: false },
			keyterms: { type: "string", multiple: true },
			srt: { type: "boolean", default: false },
			"srt-max-words": { type: "string" },
			"srt-max-duration": { type: "string" },
			"raw-json": { type: "boolean", default: false },
			// transfer-motion options
			orientation: { type: "string" },
			"no-sound": { type: "boolean", default: false },
			// generate-avatar options
			"reference-images": { type: "string", multiple: true },
			// analyze-video options
			"analysis-type": { type: "string" },
			"output-format": { type: "string", short: "f" },
			// upscale-image options
			target: { type: "string" },
			// vimax options
			"no-references": { type: "boolean", default: false },
			"project-id": { type: "string" },
			// grid upscale
			"grid-upscale": { type: "string" },
			// editor flags
			"media-id": { type: "string" },
			"element-id": { type: "string" },
			"job-id": { type: "string" },
			"track-id": { type: "string" },
			"to-track": { type: "string" },
			"split-time": { type: "string" },
			time: { type: "string" },
			"start-time": { type: "string" },
			"end-time": { type: "string" },
			"new-name": { type: "string" },
			changes: { type: "string" },
			updates: { type: "string" },
			elements: { type: "string" },
			cuts: { type: "string" },
			items: { type: "string" },
			preset: { type: "string" },
			threshold: { type: "string" },
			timestamps: { type: "string" },
			host: { type: "string" },
			port: { type: "string" },
			token: { type: "string" },
			poll: { type: "boolean", default: false },
			"poll-interval": { type: "string" },
			replace: { type: "boolean", default: false },
			ripple: { type: "boolean", default: false },
			"cross-track-ripple": { type: "boolean", default: false },
			"remove-fillers": { type: "boolean", default: false },
			"remove-silences": { type: "boolean", default: false },
			html: { type: "string" },
			message: { type: "string" },
			stack: { type: "string" },
			"add-to-timeline": { type: "boolean", default: false },
			"export": { type: "boolean", default: false },
			"export-format": { type: "string" },
			"include-fillers": { type: "boolean", default: false },
			"include-silences": { type: "boolean", default: false },
			"include-scenes": { type: "boolean", default: false },
			"tool-name": { type: "string" },
			"clear-log": { type: "boolean", default: false },
			"load-speech": { type: "boolean", default: false },
			data: { type: "string" },
			url: { type: "string" },
			filename: { type: "string" },
			fps: { type: "string" },
			width: { type: "string" },
			height: { type: "string" },
			mode: { type: "string" },
			gap: { type: "string" },
			timeout: { type: "string" },
			provider: { type: "string" },
			// screen-recording options
			"source-id": { type: "string" },
			discard: { type: "boolean", default: false },
			force: { type: "boolean", default: false },
			// ui options
			panel: { type: "string" },
			tab: { type: "string" },
			// batch generation options
			count: { type: "string" },
			prompts: { type: "string", multiple: true },
			// batch import convenience
			sources: { type: "string" },
			// format alias (for editor:export --format)
			format: { type: "string" },
			// project-json flags
			full: { type: "boolean", default: false },
			output: { type: "string" },
			// performance flags
			"skip-health": { type: "boolean", default: false },
			"no-capability-check": { type: "boolean", default: false },
			session: { type: "boolean", default: false },
		},
		strict: false,
	});

	if (values.help) {
		if (values.json) {
			// Level 3: <command> --help <param> --json
			const helpParam = findHelpParam(argv.slice(1));
			if (helpParam) {
				printParamHelpJson(command, helpParam);
			} else {
				// Level 2: <command> --help --json
				printCommandHelpJson(command);
			}
			// Exit non-zero if jsonError was emitted (unknown command/param)
			const def = getCommand(command);
			if (!def) process.exit(1);
			if (helpParam) {
				const flag = getCommandFlag(command, helpParam);
				if (!flag) process.exit(1);
			}
		} else {
			printHelp();
		}
		process.exit(0);
	}

	return {
		command,
		model: values.model as string | undefined,
		text: values.text as string | undefined,
		imageUrl: values["image-url"] as string | undefined,
		videoUrl: values["video-url"] as string | undefined,
		audioUrl: values["audio-url"] as string | undefined,
		outputDir: (values["output-dir"] as string) || "./output",
		duration: values.duration as string | undefined,
		aspectRatio: values["aspect-ratio"] as string | undefined,
		resolution: values.resolution as string | undefined,
		config: values.config as string | undefined,
		input: values.input as string | undefined,
		saveIntermediates: (values["save-intermediates"] as boolean) ?? false,
		parallel: (values.parallel as boolean) ?? false,
		maxWorkers: values["max-workers"]
			? Number.isNaN(parseInt(values["max-workers"] as string, 10))
				? undefined
				: parseInt(values["max-workers"] as string, 10)
			: undefined,
		json: (values.json as boolean) ?? false,
		verbose: (values.verbose as boolean) ?? false,
		quiet: (values.quiet as boolean) ?? false,
		category: values.category as string | undefined,
		prompt: values.prompt as string | undefined,
		layout: values.layout as string | undefined,
		upscale: values.upscale as string | undefined,
		keyName: values.name as string | undefined,
		keyValue: values.value as string | undefined,
		idea: values.idea as string | undefined,
		script: values.script as string | undefined,
		novel: values.novel as string | undefined,
		title: values.title as string | undefined,
		maxScenes: values["max-scenes"]
			? Number.isNaN(parseInt(values["max-scenes"] as string, 10))
				? undefined
				: parseInt(values["max-scenes"] as string, 10)
			: undefined,
		scriptsOnly: (values["scripts-only"] as boolean) ?? false,
		storyboardOnly: (values["storyboard-only"] as boolean) ?? false,
		noPortraits: (values["no-portraits"] as boolean) ?? false,
		llmModel: values["llm-model"] as string | undefined,
		imageModel: values["image-model"] as string | undefined,
		videoModel: values["video-model"] as string | undefined,
		image: values.image as string | undefined,
		stream: (values.stream as boolean) ?? false,
		configDir: values["config-dir"] as string | undefined,
		cacheDir: values["cache-dir"] as string | undefined,
		stateDir: values["state-dir"] as string | undefined,
		negativePrompt: values["negative-prompt"] as string | undefined,
		voiceId: values["voice-id"] as string | undefined,
		directory: values.directory as string | undefined,
		dryRun: (values["dry-run"] as boolean) ?? false,
		recursive: (values.recursive as boolean) ?? false,
		includeOutput: (values["include-output"] as boolean) ?? false,
		source: values.source as string | undefined,
		reveal: (values.reveal as boolean) ?? false,
		noConfirm: (values["no-confirm"] as boolean) ?? false,
		promptFile: values["prompt-file"] as string | undefined,
		portraits: values.portraits as string | undefined,
		views: values.views as string | undefined,
		maxCharacters: values["max-characters"]
			? Number.isNaN(parseInt(values["max-characters"] as string, 10))
				? undefined
				: parseInt(values["max-characters"] as string, 10)
			: undefined,
		saveRegistry: (values["save-registry"] as boolean) ?? true,
		style: values.style as string | undefined,
		referenceModel: values["reference-model"] as string | undefined,
		referenceStrength: values["reference-strength"]
			? Number.isNaN(parseFloat(values["reference-strength"] as string))
				? undefined
				: parseFloat(values["reference-strength"] as string)
			: undefined,
		// transcribe options
		language: values.language as string | undefined,
		noDiarize: (values["no-diarize"] as boolean) ?? false,
		noTagEvents: (values["no-tag-events"] as boolean) ?? false,
		keyterms: values.keyterms as string[] | undefined,
		srt: (values.srt as boolean) ?? false,
		srtMaxWords: values["srt-max-words"]
			? Number.isNaN(parseInt(values["srt-max-words"] as string, 10))
				? undefined
				: parseInt(values["srt-max-words"] as string, 10)
			: undefined,
		srtMaxDuration: values["srt-max-duration"]
			? Number.isNaN(parseFloat(values["srt-max-duration"] as string))
				? undefined
				: parseFloat(values["srt-max-duration"] as string)
			: undefined,
		rawJson: (values["raw-json"] as boolean) ?? false,
		// transfer-motion options
		orientation: values.orientation as string | undefined,
		noSound: (values["no-sound"] as boolean) ?? false,
		// generate-avatar options
		referenceImages: values["reference-images"] as string[] | undefined,
		// analyze-video options
		analysisType: values["analysis-type"] as string | undefined,
		outputFormat: values["output-format"] as string | undefined,
		// upscale-image options
		target: values.target as string | undefined,
		// vimax options
		noReferences: (values["no-references"] as boolean) ?? false,
		projectId: values["project-id"] as string | undefined,
		// grid upscale
		gridUpscale: values["grid-upscale"]
			? Number.isNaN(parseFloat(values["grid-upscale"] as string))
				? undefined
				: parseFloat(values["grid-upscale"] as string)
			: undefined,
		// editor options
		mediaId: values["media-id"] as string | undefined,
		elementId: values["element-id"] as string | undefined,
		jobId: values["job-id"] as string | undefined,
		trackId: values["track-id"] as string | undefined,
		toTrack: values["to-track"] as string | undefined,
		splitTime: values["split-time"]
			? Number.isNaN(parseFloat(values["split-time"] as string))
				? undefined
				: parseFloat(values["split-time"] as string)
			: undefined,
		seekTime: values.time
			? Number.isNaN(parseFloat(values.time as string))
				? undefined
				: parseFloat(values.time as string)
			: undefined,
		startTime: values["start-time"]
			? Number.isNaN(parseFloat(values["start-time"] as string))
				? undefined
				: parseFloat(values["start-time"] as string)
			: undefined,
		endTime: values["end-time"]
			? Number.isNaN(parseFloat(values["end-time"] as string))
				? undefined
				: parseFloat(values["end-time"] as string)
			: undefined,
		newName: values["new-name"] as string | undefined,
		changes: values.changes as string | undefined,
		updates: values.updates as string | undefined,
		elements: values.elements as string | undefined,
		cuts: values.cuts as string | undefined,
		items: values.items as string | undefined,
		preset: values.preset as string | undefined,
		threshold: values.threshold
			? Number.isNaN(parseFloat(values.threshold as string))
				? undefined
				: parseFloat(values.threshold as string)
			: undefined,
		timestamps: values.timestamps as string | undefined,
		host: values.host as string | undefined,
		port: values.port as string | undefined,
		token: values.token as string | undefined,
		poll: (values.poll as boolean) ?? false,
		pollInterval: values["poll-interval"]
			? Number.isNaN(parseFloat(values["poll-interval"] as string))
				? undefined
				: parseFloat(values["poll-interval"] as string)
			: undefined,
		replace: (values.replace as boolean) ?? false,
		ripple: (values.ripple as boolean) ?? false,
		crossTrackRipple: (values["cross-track-ripple"] as boolean) ?? false,
		removeFillers: (values["remove-fillers"] as boolean) ?? false,
		removeSilences: (values["remove-silences"] as boolean) ?? false,
		html: values.html as string | undefined,
		message: values.message as string | undefined,
		stack: values.stack as string | undefined,
		addToTimeline: (values["add-to-timeline"] as boolean) ?? false,
		exportAfterGenerate: (values.export as boolean) ?? false,
		exportFormat: values["export-format"] as string | undefined,
		includeFillers: (values["include-fillers"] as boolean) ?? false,
		includeSilences: (values["include-silences"] as boolean) ?? false,
		includeScenes: (values["include-scenes"] as boolean) ?? false,
		toolName: values["tool-name"] as string | undefined,
		clearLog: (values["clear-log"] as boolean) ?? false,
		data: values.data as string | undefined,
		url: values.url as string | undefined,
		filename: values.filename as string | undefined,
		fps: values.fps ? Number(values.fps) : undefined,
		width: values.width ? Number(values.width) : undefined,
		height: values.height ? Number(values.height) : undefined,
		mode: values.mode as string | undefined,
		gap: values.gap
			? Number.isNaN(parseFloat(values.gap as string))
				? undefined
				: parseFloat(values.gap as string)
			: undefined,
		timeout: values.timeout
			? Number.isNaN(parseFloat(values.timeout as string))
				? undefined
				: parseFloat(values.timeout as string)
			: undefined,
		provider: values.provider as string | undefined,
		loadSpeech: (values["load-speech"] as boolean) ?? false,
		// screen-recording options
		sourceId: values["source-id"] as string | undefined,
		discard: (values.discard as boolean) ?? false,
		force: (values.force as boolean) ?? false,
		// ui options
		panel: values.panel as string | undefined,
		tab: values.tab as string | undefined,
		// batch generation options
		count: values.count
			? Number.isNaN(parseInt(values.count as string, 10))
				? undefined
				: parseInt(values.count as string, 10)
			: undefined,
		prompts: values.prompts as string[] | undefined,
		// batch import convenience
		sources: values.sources as string | undefined,
		format: values.format as string | undefined,
		// project-json flags
		full: (values.full as boolean) ?? false,
		output: values.output as string | undefined,
		// performance flags
		skipHealth: (values["skip-health"] as boolean) ?? false,
		noCapabilityCheck: (values["no-capability-check"] as boolean) ?? false,
		session: (values.session as boolean) ?? false,
	};
}

/** CLI entry point: parse args and run the appropriate command or session. */
export async function main(
	argv: string[] = process.argv.slice(2)
): Promise<void> {
	initRegistry();

	// Check for --session before command parsing (session doesn't require a command)
	if (argv.includes("--session")) {
		const sessionArgv = argv.filter((a) => a !== "--session");
		const { values: sessionValues } = parseArgs({
			args: sessionArgv,
			options: {
				json: { type: "boolean", default: false },
				quiet: { type: "boolean", short: "q", default: false },
				verbose: { type: "boolean", short: "v", default: false },
				"skip-health": { type: "boolean", default: false },
				"no-capability-check": { type: "boolean", default: false },
				host: { type: "string" },
				port: { type: "string" },
				token: { type: "string" },
				"output-dir": { type: "string", short: "o" },
			},
			strict: false,
		});
		const baseOptions: Partial<CLIRunOptions> = {
			json: sessionValues.json as boolean,
			quiet: sessionValues.quiet as boolean,
			verbose: sessionValues.verbose as boolean,
			skipHealth: sessionValues["skip-health"] as boolean,
			noCapabilityCheck: sessionValues["no-capability-check"] as boolean,
			host: sessionValues.host as string | undefined,
			port: sessionValues.port as string | undefined,
			token: sessionValues.token as string | undefined,
			outputDir: sessionValues["output-dir"] as string | undefined,
			session: true,
		};

		const runner = new CLIPipelineRunner();
		const reporter = createProgressReporter({
			json: baseOptions.json ?? false,
			quiet: baseOptions.quiet ?? false,
		});

		process.on("SIGINT", () => {
			runner.abort();
			process.exit(0);
		});

		await runSession(runner, baseOptions, reporter);
		return;
	}

	const options = parseCliArgs(argv);
	const output = new CLIOutput({
		jsonMode: options.json,
		quiet: options.quiet,
		debug: options.verbose,
	});
	const emitter = options.stream
		? new StreamEmitter({ enabled: true })
		: new NullEmitter();
	const runner = new CLIPipelineRunner();
	const reporter = createProgressReporter({
		json: options.json,
		quiet: options.quiet,
	});

	process.on("SIGINT", () => {
		if (!options.quiet) console.error("\nCancelling...");
		runner.abort();
	});
	process.on("SIGTERM", () => {
		runner.abort();
	});

	emitter.pipelineStart(options.command, 1);
	const result = await runner.run(options, reporter);

	if (options.json) {
		emitJsonResult(options.command, result);
		if (!result.success) {
			process.exit(1);
		}
	} else if (result.success) {
		if (result.outputPath) {
			output.success(`Output: ${result.outputPath}`);
		}
		if (result.cost !== undefined) {
			output.cost(result.cost);
		}
		if (result.duration !== undefined) {
			output.info(`Duration: ${result.duration.toFixed(1)}s`);
		}
		formatCommandOutput(options.command, result);
		emitter.pipelineComplete({ ...result, success: true });
	} else {
		output.error(result.error || "Unknown error");
		emitter.pipelineComplete({ success: false, error: result.error });
		const { exitCode } = formatErrorForCli(new Error(result.error));
		process.exit(exitCode);
	}
}

// Direct execution check
const scriptPath = process.argv[1];
if (
	scriptPath &&
	(scriptPath.endsWith("cli.ts") ||
		scriptPath.endsWith("cli.js") ||
		scriptPath.endsWith("qcut-pipeline"))
) {
	main().catch((err) => {
		console.error(err.message || err);
		process.exit(1);
	});
}
