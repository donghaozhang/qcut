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
import os from "node:os";
import path from "node:path";
import { initRegistry } from "../init.js";
import {
	CLIPipelineRunner,
	createProgressReporter,
} from "../cli/cli-runner.js";
import { type CLIRunOptions, generateCommandId } from "./cli-runner/types.js";
import { getExitCode, formatErrorForCli } from "../output/errors.js";
import { CLIOutput } from "../cli/cli-output.js";
import { StreamEmitter, NullEmitter } from "../infra/stream-emitter.js";
import { DebugStream } from "../infra/debug-stream.js";
import { formatCommandOutput } from "./cli-output-formatters.js";
import { runSession } from "./cli-runner/session.js";
import { emitJsonResult, jsonOk, jsonError } from "./json-output.js";
import {
	COMMANDS_REGISTRY,
	getCommand,
	getCommandFlag,
} from "./command-registry.js";
import {
	CLI_VERSION,
	findHelpParam,
	printCommandHelp,
	printCommandHelpJson,
	printGroupHelp,
	printGroupHelpJson,
	printHelp,
	printHelpJson,
	printParamHelpJson,
} from "./cli-help.js";
import {
	resolveCommandGroup,
	isCommandGroup,
	getCommandGroup,
} from "./command-groups.js";
import { warnIfDeprecated } from "./aliases.js";

/** Command list derived from the central registry. */
const COMMANDS = Object.keys(COMMANDS_REGISTRY);

type Command = string;

/**
 * Resolves the default export output directory.
 *
 * Uses the `QCUT_OUTPUT_DIR` env var when set, otherwise falls back to
 * `~/Documents/QCut/exports`.
 *
 * @returns The absolute path to the default output directory.
 */
function getDefaultOutputDir(): string {
	const envOutputDir = process.env.QCUT_OUTPUT_DIR?.trim();
	return (
		envOutputDir || path.join(os.homedir(), "Documents", "QCut", "exports")
	);
}

function parseFiniteCliNumber({
	value,
}: {
	value: unknown;
}): number | undefined {
	if (typeof value !== "string") return undefined;
	// Number("") and Number("  ") are 0 — blank flags must not become valid.
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parse process argv into CLIRunOptions, exiting on --help/--version. */
export function parseCliArgs(argv: string[]): CLIRunOptions {
	let command = argv[0];
	let wasGroupResolved = false;
	let commandArgs = argv.slice(1); // args after the resolved command tokens

	if (!command || command === "--help" || command === "-h") {
		if (argv.includes("--json")) {
			printHelpJson();
		} else {
			printHelp();
		}
		process.exit(0);
	}

	if (command === "--version") {
		console.log(CLI_VERSION);
		process.exit(0);
	}

	// Try group resolution: "gen image ..." → "generate-image ..."
	const groupResult = resolveCommandGroup(argv);
	if (groupResult) {
		command = groupResult.command;
		commandArgs = groupResult.remainingArgs;
		wasGroupResolved = true;
	} else if (isCommandGroup(command)) {
		// Check if the user specified an unknown action (e.g. "gen unknown")
		const possibleAction = argv[1];
		if (possibleAction && !possibleAction.startsWith("-")) {
			console.error(
				`Unknown action "${possibleAction}" for group "${command}".`
			);
			console.error(`Run "qcut ${command} --help" for available actions.`);
			process.exit(2);
		}
		// Group name with no action or --help: show group help
		if (argv.includes("--json")) {
			printGroupHelpJson(command);
		} else {
			printGroupHelp(command);
		}
		process.exit(0);
	}

	if (!COMMANDS.includes(command)) {
		console.error(`Unknown command: ${command}`);
		console.error("Run with --help for usage.");
		process.exit(2);
	}

	if (command === "analyze-inspect") {
		commandArgs = commandArgs.map((argument) => {
			if (argument === "--start") return "--start-time";
			if (argument === "--end") return "--end-time";
			return argument;
		});
	}

	// Emit deprecation warning for flat commands that have group equivalents
	const isQuiet =
		argv.includes("--json") || argv.includes("--quiet") || argv.includes("-q");
	warnIfDeprecated(command, wasGroupResolved, isQuiet);

	const { values } = parseArgs({
		args: commandArgs,
		options: {
			model: { type: "string", short: "m" },
			text: { type: "string", short: "t" },
			"image-url": { type: "string" },
			"video-url": { type: "string" },
			"audio-url": { type: "string" },
			"source-generation-id": { type: "string" },
			"output-dir": { type: "string", short: "o" },
			duration: { type: "string", short: "d" },
			"aspect-ratio": { type: "string" },
			ratio: { type: "string" },
			aspect: { type: "string" },
			resolution: { type: "string" },
			loop: { type: "boolean", default: false },
			hdr: { type: "boolean", default: false },
			"exr-export": { type: "boolean", default: false },
			"edit-strength": { type: "string" },
			config: { type: "string", short: "c" },
			policy: { type: "string" },
			resume: { type: "string" },
			input: { type: "string", short: "i" },
			background: { type: "string", short: "b" },
			"cutout-output": { type: "string" },
			"background-fit": { type: "string" },
			"portrait-filter": { type: "string" },
			"filter-intensity": { type: "string" },
			beauty: { type: "string" },
			"list-presets": { type: "boolean", default: false },
			profile: { type: "string", multiple: true },
			"save-intermediates": { type: "boolean", default: false },
			parallel: { type: "boolean", default: false },
			"max-workers": { type: "string" },
			json: { type: "boolean", default: false },
			quiet: { type: "boolean", short: "q", default: false },
			verbose: { type: "boolean", short: "v", default: false },
			help: { type: "boolean", short: "h", default: false },
			category: { type: "string" },
			configured: { type: "boolean", default: false },
			missing: { type: "boolean", default: false },
			prompt: { type: "string" },
			layout: { type: "string" },
			upscale: { type: "string" },
			name: { type: "string" },
			value: { type: "string" },
			email: { type: "string" },
			password: { type: "string" },
			"frontal-image": { type: "string" },
			"refer-images": { type: "string", multiple: true },
			"refer-video": { type: "string" },
			"element-ids": { type: "string", multiple: true },
			"tag-list": { type: "string", multiple: true },
			sound: { type: "string" },
			watermark: { type: "boolean", default: false },
			"auto-fix": { type: "boolean", default: false },
			"style-anchor": { type: "string" },
			"style-prompt": { type: "string" },
			description: { type: "string" },
			idea: { type: "string" },
			genre: { type: "string" },
			"target-duration": { type: "string" },
			script: { type: "string" },
			scenes: { type: "string" },
			novel: { type: "string" },
			title: { type: "string" },
			"max-scenes": { type: "string" },
			"max-clips": { type: "string" },
			"scripts-only": { type: "boolean", default: false },
			"storyboard-only": { type: "boolean", default: false },
			"max-images": { type: "string" },
			"max-shots": { type: "string" },
			concurrency: { type: "string" },
			"fallback-model": { type: "string" },
			"cost-gate": { type: "string" },
			region: { type: "string" },
			"cast-quality": { type: "string" },
			"no-portraits": { type: "boolean", default: false },
			"llm-model": { type: "string" },
			"image-model": { type: "string" },
			"video-model": { type: "string" },
			"video-reference-mode": { type: "string" },
			"video-reference-images": { type: "string", multiple: true },
			"video-concurrency": { type: "string" },
			image: { type: "string" },
			stream: { type: "boolean", default: false },
			"config-dir": { type: "string" },
			"cache-dir": { type: "string" },
			"state-dir": { type: "string" },
			"session-name": { type: "string" },
			"negative-prompt": { type: "string" },
			"voice-id": { type: "string" },
			directory: { type: "string" },
			"dry-run": { type: "boolean", default: false },
			recursive: { type: "boolean", default: false },
			"include-output": { type: "boolean", default: false },
			source: { type: "string" },
			query: { type: "string" },
			collection: { type: "string" },
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
			language: { type: "string", short: "l" },
			"no-diarize": { type: "boolean", default: false },
			"no-tag-events": { type: "boolean", default: false },
			keyterms: { type: "string", multiple: true },
			srt: { type: "boolean", default: false },
			"srt-max-words": { type: "string" },
			"srt-max-duration": { type: "string" },
			"raw-json": { type: "boolean", default: false },
			// autoclip options
			"srt-file": { type: "string", short: "s" },
			"min-score": { type: "string" },
			step: { type: "string" },
			"chunk-minutes": { type: "string" },
			// translate-video options
			"audio-only": { type: "boolean", default: false },
			"output-audio": { type: "boolean", default: false },
			"no-dynamic-duration": { type: "boolean", default: false },
			speakers: { type: "string" },
			// music generation options
			lyrics: { type: "string" },
			instrumental: { type: "boolean", default: false },
			"sample-rate": { type: "string" },
			bitrate: { type: "string" },
			"audio-format": { type: "string" },
			// speech generation options
			exaggeration: { type: "string" },
			temperature: { type: "string" },
			"max-tokens": { type: "string" },
			cfg: { type: "string" },
			seed: { type: "string" },
			voice: { type: "string" },
			stability: { type: "string" },
			"language-code": { type: "string" },
			volume: { type: "string" },
			pitch: { type: "string" },
			multilingual: { type: "boolean" },
			// transfer-motion options
			orientation: { type: "string" },
			"no-sound": { type: "boolean", default: false },
			// generate-avatar options (also reused by happy_horse_ref2v / happy_horse_video_edit)
			"reference-images": { type: "string", multiple: true },
			"keyframe-images": { type: "string", multiple: true },
			"keyframe-indexes": { type: "string", multiple: true },
			// happy_horse_video_edit: 'auto' | 'origin'
			"audio-setting": { type: "string" },
			// analyze-video options
			"analysis-type": { type: "string" },
			"output-format": { type: "string", short: "f" },
			"review-language": { type: "string" },
			"review-prompt-dir": { type: "string" },
			narration: { type: "string" },
			transcript: { type: "string" },
			"candidate-duration": { type: "string" },
			"scene-threshold": { type: "string" },
			"no-ai": { type: "boolean", default: false },
			"no-recursive": { type: "boolean", default: false },
			"no-timeline-views": { type: "boolean", default: false },
			"transition-duration": { type: "string" },
			edl: { type: "string" },
			"cut-window": { type: "string" },
			before: { type: "string" },
			after: { type: "string" },
			// upscale-image options
			target: { type: "string" },
			// upscale-video options
			video: { type: "string" },
			"target-fps": { type: "string" },
			// vimax options
			"no-references": { type: "boolean", default: false },
			"project-id": { type: "string" },
			project: { type: "string" },
			"chunk-size": { type: "string" },
			overlap: { type: "string" },
			// grid options
			grid: { type: "string" },
			"grid-upscale": { type: "string" },
			// editor flags
			"media-id": { type: "string" },
			"element-id": { type: "string" },
			"job-id": { type: "string" },
			"track-id": { type: "string" },
			type: { type: "string" },
			index: { type: "string" },
			"to-track": { type: "string" },
			"split-time": { type: "string" },
			time: { type: "string" },
			"start-time": { type: "string" },
			"end-time": { type: "string" },
			"new-name": { type: "string" },
			open: { type: "boolean", default: false },
			"wait-ready": { type: "boolean", default: false },
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
			"debug-trace": { type: "boolean", default: false },
			"poll-interval": { type: "string" },
			level: { type: "string" },
			since: { type: "string" },
			limit: { type: "string" },
			clear: { type: "boolean", default: false },
			interactive: { type: "boolean", default: false },
			depth: { type: "string" },
			ref: { type: "string", multiple: true },
			from: { type: "string" },
			to: { type: "string" },
			"from-ref": { type: "string" },
			"to-ref": { type: "string" },
			"from-x": { type: "string" },
			"from-y": { type: "string" },
			"to-x": { type: "string" },
			"to-y": { type: "string" },
			"normalized-x": { type: "string" },
			"normalized-y": { type: "string" },
			"from-normalized-x": { type: "string" },
			"from-normalized-y": { type: "string" },
			"to-normalized-x": { type: "string" },
			"to-normalized-y": { type: "string" },
			"to-time": { type: "string" },
			"to-index": { type: "string" },
			via: { type: "string" },
			"hold-ms": { type: "string" },
			"duration-ms": { type: "string" },
			steps: { type: "string" },
			"release-delay-ms": { type: "string" },
			keys: { type: "string" },
			"interval-ms": { type: "string" },
			actions: { type: "string" },
			plan: { type: "string" },
			record: { type: "string" },
			"event-track": { type: "string" },
			speed: { type: "string" },
			"skip-idle": { type: "boolean", default: false },
			"wait-for": { type: "string" },
			"timeout-ms": { type: "string" },
			"delta-x": { type: "string" },
			"delta-y": { type: "string" },
			foreground: { type: "boolean", default: false },
			checked: { type: "boolean" },
			replace: { type: "boolean", default: false },
			ripple: { type: "boolean", default: false },
			"cross-track-ripple": { type: "boolean", default: false },
			"remove-fillers": { type: "boolean" },
			"remove-silences": { type: "boolean" },
			"no-remove-fillers": { type: "boolean", default: false },
			"no-remove-silences": { type: "boolean", default: false },
			push: { type: "boolean", default: false },
			pull: { type: "boolean", default: false },
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
			"scene-detect": { type: "boolean", default: false },
			"batch-size": { type: "string" },
			"min-severity": { type: "string" },
			candidate: { type: "string", multiple: true },
			dir: { type: "string" },
			rule: { type: "string" },
			"rules-file": { type: "string" },
			width: { type: "string" },
			height: { type: "string" },
			mode: { type: "string" },
			gap: { type: "string" },
			timeout: { type: "string" },
			provider: { type: "string" },
			// screen-recording options
			"source-id": { type: "string" },
			"capture-mode": { type: "string" },
			"recording-quality": { type: "string" },
			discard: { type: "boolean", default: false },
			force: { type: "boolean", default: false },
			// `qcut record` standalone options (Phase 1 of dual-mode recording)
			"record-duration": { type: "string" },
			"no-auto-launch": { type: "boolean", default: false },
			// `qcut record-daemon` subcommand flags
			stop: { type: "boolean", default: false },
			start: { type: "boolean", default: false },
			status: { type: "boolean", default: false },
			// export enhancement options
			"cursor-sway": { type: "string" },
			"cursor-blur": { type: "string" },
			"cursor-loop": { type: "boolean", default: false },
			"auto-zoom": { type: "boolean", default: false },
			"zoom-blur": { type: "string" },
			"gif-fps": { type: "string" },
			"gif-loop": { type: "boolean", default: false },
			"gif-quality": { type: "string" },
			mic: { type: "boolean", default: false },
			// Default true matches the command-registry advertisement and user
			// docs — capturing system audio is the intended out-of-box
			// behaviour for `qcut record`.
			"system-audio": { type: "boolean", default: true },
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
			example: { type: "boolean", default: false },
			full: { type: "boolean", default: false },
			output: { type: "string" },
			engine: { type: "string" },
			"verify-frames": { type: "string" },
			manifest: { type: "string" },
			atomic: { type: "boolean", default: true },
			verify: { type: "boolean", default: true },
			// Opt-out flags for the true-by-default booleans above
			"no-atomic": { type: "boolean", default: false },
			"no-verify": { type: "boolean", default: false },
			// state snapshot flags
			include: { type: "string" },
			// editor:state:snapshot — opt back into raw `data:` thumbnail URLs.
			// Default is stripped (sentinel `<stripped>`).
			"with-thumbnails": { type: "boolean", default: false },
			// editor:snapshot — render-side size guards (renderer returns a
			// `truncated: true` envelope past `--max-bytes` instead of a
			// corrupt payload). Both flags are optional.
			"max-bytes": { type: "string" },
			"max-nodes": { type: "string" },
			// performance flags
			"skip-health": { type: "boolean", default: false },
			focus: { type: "boolean", default: false },
			"download-dir": { type: "string" },
			"status-only": { type: "boolean", default: false },
			deep: { type: "boolean", default: false },
			"no-capability-check": { type: "boolean", default: false },
			session: { type: "boolean", default: false },
			set: { type: "string" },
			// sticker options
			x: { type: "string" },
			y: { type: "string" },
			opacity: { type: "string" },
			rotation: { type: "string" },
			"sticker-id": { type: "string" },
		},
		strict: false,
	});

	if (values.help) {
		if (values.json) {
			// Level 3: <command> --help <param> --json
			const helpParam = findHelpParam(commandArgs);
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
			// The command is already resolved here, so show its own flags instead
			// of the root overview, which is what `<group> <action> --help` hit.
			printCommandHelp(command);
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
		sourceGenerationId: values["source-generation-id"] as string | undefined,
		outputDir: (values["output-dir"] as string) || getDefaultOutputDir(),
		outputDirExplicit: !!(values["output-dir"] as string),
		duration: values.duration as string | undefined,
		aspectRatio: (values["aspect-ratio"] ?? values.ratio ?? values.aspect) as
			| string
			| undefined,
		resolution: values.resolution as string | undefined,
		loop: (values.loop as boolean) ?? false,
		hdr: (values.hdr as boolean) ?? false,
		exrExport: (values["exr-export"] as boolean) ?? false,
		editStrength: values["edit-strength"] as string | undefined,
		config: values.config as string | undefined,
		policy: values.policy as string | undefined,
		resume: values.resume as string | undefined,
		input: values.input as string | undefined,
		background: values.background as string | undefined,
		cutoutOutput: values["cutout-output"] as string | undefined,
		backgroundFit: values["background-fit"] as string | undefined,
		portraitFilter: values["portrait-filter"] as string | undefined,
		filterIntensity:
			values["filter-intensity"] === undefined
				? undefined
				: Number(values["filter-intensity"]),
		beauty: values.beauty === undefined ? undefined : Number(values.beauty),
		listPresets: (values["list-presets"] as boolean) ?? false,
		profile: values.profile as string[] | undefined,
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
		configured: (values.configured as boolean) ?? false,
		missing: (values.missing as boolean) ?? false,
		prompt: values.prompt as string | undefined,
		layout: values.layout as string | undefined,
		upscale: values.upscale as string | undefined,
		keyName: values.name as string | undefined,
		keyValue: values.value as string | undefined,
		email: values.email as string | undefined,
		password: values.password as string | undefined,
		frontalImage: values["frontal-image"] as string | undefined,
		referImages: values["refer-images"] as string[] | undefined,
		referVideo: values["refer-video"] as string | undefined,
		elementIds: values["element-ids"] as string[] | undefined,
		tagList: values["tag-list"] as string[] | undefined,
		sound: values.sound as string | undefined,
		watermark: (values.watermark as boolean) ?? false,
		autoFix: (values["auto-fix"] as boolean) ?? false,
		styleAnchor: values["style-anchor"] as string | undefined,
		stylePrompt: values["style-prompt"] as string | undefined,
		elementDescription: values.description as string | undefined,
		idea: values.idea as string | undefined,
		genre: values.genre as string | undefined,
		targetDuration: values["target-duration"] as string | undefined,
		script: values.script as string | undefined,
		scenes: values.scenes as string | undefined,
		novel: values.novel as string | undefined,
		title: values.title as string | undefined,
		maxScenes: values["max-scenes"]
			? Number.isNaN(parseInt(values["max-scenes"] as string, 10))
				? undefined
				: parseInt(values["max-scenes"] as string, 10)
			: undefined,
		maxClips: values["max-clips"]
			? Number.isNaN(parseInt(values["max-clips"] as string, 10))
				? undefined
				: parseInt(values["max-clips"] as string, 10)
			: undefined,
		scriptsOnly: (values["scripts-only"] as boolean) ?? false,
		storyboardOnly: (values["storyboard-only"] as boolean) ?? false,
		maxImages: values["max-images"]
			? Number.isNaN(parseInt(values["max-images"] as string, 10))
				? undefined
				: parseInt(values["max-images"] as string, 10)
			: undefined,
		maxShots: values["max-shots"]
			? Number.isNaN(parseInt(values["max-shots"] as string, 10))
				? undefined
				: parseInt(values["max-shots"] as string, 10)
			: undefined,
		concurrency: values.concurrency
			? Number.isNaN(parseInt(values.concurrency as string, 10))
				? undefined
				: parseInt(values.concurrency as string, 10)
			: undefined,
		fallbackModel: values["fallback-model"] as string | undefined,
		costGate: values["cost-gate"]
			? Number.isNaN(Number(values["cost-gate"]))
				? undefined
				: Number(values["cost-gate"])
			: undefined,
		region: values.region as string | undefined,
		castQuality: values["cast-quality"] as string | undefined,
		noPortraits: (values["no-portraits"] as boolean) ?? false,
		llmModel: values["llm-model"] as string | undefined,
		imageModel: values["image-model"] as string | undefined,
		videoModel: values["video-model"] as string | undefined,
		videoReferenceMode: values["video-reference-mode"] as string | undefined,
		videoReferenceImages: values["video-reference-images"] as
			| string[]
			| undefined,
		videoConcurrency: values["video-concurrency"]
			? Number.isNaN(parseInt(values["video-concurrency"] as string, 10))
				? undefined
				: parseInt(values["video-concurrency"] as string, 10)
			: undefined,
		image: values.image as string | undefined,
		stream: (values.stream as boolean) ?? false,
		configDir: values["config-dir"] as string | undefined,
		cacheDir: values["cache-dir"] as string | undefined,
		stateDir: values["state-dir"] as string | undefined,
		sessionName: values["session-name"] as string | undefined,
		negativePrompt: values["negative-prompt"] as string | undefined,
		voiceId: values["voice-id"] as string | undefined,
		directory: values.directory as string | undefined,
		dryRun: (values["dry-run"] as boolean) ?? false,
		recursive: (values.recursive as boolean) ?? false,
		includeOutput: (values["include-output"] as boolean) ?? false,
		source: values.source as string | undefined,
		query: values.query as string | undefined,
		collection: values.collection as string | undefined,
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
		// autoclip options
		srtFile: values["srt-file"] as string | undefined,
		minScore: values["min-score"]
			? parseFloat(values["min-score"] as string)
			: undefined,
		autoclipStep: values.step ? parseInt(values.step as string, 10) : undefined,
		chunkMinutes: values["chunk-minutes"]
			? parseInt(values["chunk-minutes"] as string, 10)
			: undefined,
		// translate-video options
		audioOnly: (values["audio-only"] as boolean) ?? false,
		outputAudio: (values["output-audio"] as boolean) ?? false,
		noDynamicDuration: (values["no-dynamic-duration"] as boolean) ?? false,
		speakers: values.speakers
			? Number.isNaN(parseInt(values.speakers as string, 10))
				? undefined
				: parseInt(values.speakers as string, 10)
			: undefined,
		// music generation options
		lyrics: values.lyrics as string | undefined,
		instrumental: (values.instrumental as boolean) ?? false,
		sampleRate: values["sample-rate"]
			? Number.isNaN(parseInt(values["sample-rate"] as string, 10))
				? undefined
				: parseInt(values["sample-rate"] as string, 10)
			: undefined,
		bitrate: values.bitrate
			? Number.isNaN(parseInt(values.bitrate as string, 10))
				? undefined
				: parseInt(values.bitrate as string, 10)
			: undefined,
		audioFormat: values["audio-format"] as string | undefined,
		// speech generation options
		exaggeration: values.exaggeration
			? parseFloat(values.exaggeration as string)
			: undefined,
		temperature: values.temperature
			? parseFloat(values.temperature as string)
			: undefined,
		maxTokens: values["max-tokens"]
			? Number.isNaN(parseInt(values["max-tokens"] as string, 10))
				? undefined
				: parseInt(values["max-tokens"] as string, 10)
			: undefined,
		cfg: values.cfg ? parseFloat(values.cfg as string) : undefined,
		seed: values.seed ? parseInt(values.seed as string, 10) : undefined,
		voice: values.voice as string | undefined,
		stability: values.stability
			? parseFloat(values.stability as string)
			: undefined,
		languageCode: values["language-code"] as string | undefined,
		volume: parseFiniteCliNumber({ value: values.volume }),
		pitch: parseFiniteCliNumber({ value: values.pitch }),
		multilingual: values.multilingual as boolean | undefined,
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
		// generate-avatar options (also reused by happy_horse_ref2v / happy_horse_video_edit)
		referenceImages: values["reference-images"] as string[] | undefined,
		keyframeImages: values["keyframe-images"] as string[] | undefined,
		keyframeIndexes: values["keyframe-indexes"] as string[] | undefined,
		// happy_horse_video_edit
		audioSetting: values["audio-setting"] as string | undefined,
		// analyze-video options
		analysisType: values["analysis-type"] as string | undefined,
		outputFormat: values["output-format"] as string | undefined,
		reviewLanguage: values["review-language"] as string | undefined,
		reviewPromptDir: values["review-prompt-dir"] as string | undefined,
		mediaIndexPath:
			command === "analyze-inspect" || command === "edit-plan"
				? (values.index as string | undefined)
				: undefined,
		narration: values.narration as string | undefined,
		transcript: values.transcript as string | undefined,
		candidateDuration: parseFiniteCliNumber({
			value: values["candidate-duration"],
		}),
		noAi: (values["no-ai"] as boolean) ?? false,
		noRecursive: (values["no-recursive"] as boolean) ?? false,
		noTimelineViews: (values["no-timeline-views"] as boolean) ?? false,
		transitionDuration: parseFiniteCliNumber({
			value: values["transition-duration"],
		}),
		edl: values.edl as string | undefined,
		cutWindow: parseFiniteCliNumber({ value: values["cut-window"] }),
		refs: values.ref as string[] | undefined,
		// analyze-image-consistency options
		candidates: values.candidate as string[] | undefined,
		dir: values.dir as string | undefined,
		rule: values.rule as string | undefined,
		rulesFile: values["rules-file"] as string | undefined,
		sceneDetect: (values["scene-detect"] as boolean) ?? false,
		batchSize: values["batch-size"]
			? Number.isNaN(parseInt(values["batch-size"] as string, 10))
				? undefined
				: parseInt(values["batch-size"] as string, 10)
			: undefined,
		minSeverity: values["min-severity"] as string | undefined,
		before: values.before as string | undefined,
		after: values.after as string | undefined,
		// upscale-image options
		target: values.target as string | undefined,
		// upscale-video options
		video: values.video as string | undefined,
		targetFps: values["target-fps"]
			? Number.isNaN(parseInt(values["target-fps"] as string, 10))
				? undefined
				: parseInt(values["target-fps"] as string, 10)
			: undefined,
		// vimax options
		noReferences: (values["no-references"] as boolean) ?? false,
		projectId:
			(values["project-id"] as string | undefined) ??
			(values.project as string | undefined),
		chunkSize: values["chunk-size"]
			? Number.isNaN(parseInt(values["chunk-size"] as string, 10))
				? undefined
				: parseInt(values["chunk-size"] as string, 10)
			: undefined,
		overlap: values.overlap
			? Number.isNaN(parseInt(values.overlap as string, 10))
				? undefined
				: parseInt(values.overlap as string, 10)
			: undefined,
		// grid options
		grid: values.grid as string | undefined,
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
		trackType: values.type as string | undefined,
		index:
			command !== "analyze-inspect" && command !== "edit-plan" && values.index
				? Number.isNaN(parseInt(values.index as string, 10))
					? undefined
					: parseInt(values.index as string, 10)
				: undefined,
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
		name: values.name as string | undefined,
		open: (values.open as boolean) ?? false,
		waitReady: (values["wait-ready"] as boolean) ?? false,
		changes: values.changes as string | undefined,
		updates: values.updates as string | undefined,
		elements: values.elements as string | undefined,
		cuts: values.cuts as string | undefined,
		items: values.items as string | undefined,
		preset: values.preset as string | undefined,
		threshold:
			(values["scene-threshold"] ?? values.threshold)
				? Number.isNaN(
						parseFloat(
							(values["scene-threshold"] ?? values.threshold) as string
						)
					)
					? undefined
					: parseFloat(
							(values["scene-threshold"] ?? values.threshold) as string
						)
				: undefined,
		timestamps: values.timestamps as string | undefined,
		host: values.host as string | undefined,
		port: values.port as string | undefined,
		token: values.token as string | undefined,
		poll: (values.poll as boolean) ?? false,
		debugTrace: (values["debug-trace"] as boolean) ?? false,
		pollInterval: values["poll-interval"]
			? Number.isNaN(parseFloat(values["poll-interval"] as string))
				? undefined
				: parseFloat(values["poll-interval"] as string)
			: undefined,
		level: values.level as string | undefined,
		since: values.since as string | undefined,
		limit: values.limit
			? Number.isNaN(parseInt(values.limit as string, 10))
				? undefined
				: parseInt(values.limit as string, 10)
			: undefined,
		clear: (values.clear as boolean) ?? false,
		interactive: (values.interactive as boolean) ?? false,
		depth: values.depth
			? Number.isNaN(parseInt(values.depth as string, 10))
				? undefined
				: parseInt(values.depth as string, 10)
			: undefined,
		ref: (values.ref as string[] | undefined)?.[0],
		from: values.from as string | undefined,
		to: values.to as string | undefined,
		fromRef: values["from-ref"] as string | undefined,
		toRef: values["to-ref"] as string | undefined,
		fromX: parseFiniteCliNumber({ value: values["from-x"] }),
		fromY: parseFiniteCliNumber({ value: values["from-y"] }),
		toX: parseFiniteCliNumber({ value: values["to-x"] }),
		toY: parseFiniteCliNumber({ value: values["to-y"] }),
		normalizedX: parseFiniteCliNumber({ value: values["normalized-x"] }),
		normalizedY: parseFiniteCliNumber({ value: values["normalized-y"] }),
		fromNormalizedX: parseFiniteCliNumber({
			value: values["from-normalized-x"],
		}),
		fromNormalizedY: parseFiniteCliNumber({
			value: values["from-normalized-y"],
		}),
		toNormalizedX: parseFiniteCliNumber({
			value: values["to-normalized-x"],
		}),
		toNormalizedY: parseFiniteCliNumber({
			value: values["to-normalized-y"],
		}),
		toTime: parseFiniteCliNumber({ value: values["to-time"] }),
		toIndex: values["to-index"]
			? Number.isNaN(parseInt(values["to-index"] as string, 10))
				? undefined
				: parseInt(values["to-index"] as string, 10)
			: undefined,
		via: values.via as string | undefined,
		holdMs: parseFiniteCliNumber({ value: values["hold-ms"] }),
		durationMs: parseFiniteCliNumber({ value: values["duration-ms"] }),
		steps: values.steps
			? Number.isNaN(parseInt(values.steps as string, 10))
				? undefined
				: parseInt(values.steps as string, 10)
			: undefined,
		releaseDelayMs: parseFiniteCliNumber({ value: values["release-delay-ms"] }),
		keys: values.keys as string | undefined,
		intervalMs: parseFiniteCliNumber({ value: values["interval-ms"] }),
		actions: values.actions as string | undefined,
		plan: values.plan as string | undefined,
		record: values.record as string | undefined,
		eventTrack: values["event-track"] as string | undefined,
		prerollMs: parseFiniteCliNumber({ value: values["preroll-ms"] }),
		postrollMs: parseFiniteCliNumber({ value: values["postroll-ms"] }),
		speed: parseFiniteCliNumber({ value: values.speed }),
		skipIdle: (values["skip-idle"] as boolean) ?? false,
		waitFor: values["wait-for"] as string | undefined,
		timeoutMs: parseFiniteCliNumber({ value: values["timeout-ms"] }),
		deltaX: parseFiniteCliNumber({ value: values["delta-x"] }),
		deltaY: parseFiniteCliNumber({ value: values["delta-y"] }),
		foreground: (values.foreground as boolean) ?? false,
		selectValue: values.value as string | undefined,
		checked: values.checked as boolean | undefined,
		replace: (values.replace as boolean) ?? false,
		ripple: (values.ripple as boolean) ?? false,
		crossTrackRipple: (values["cross-track-ripple"] as boolean) ?? false,
		push: (values.push as boolean) ?? false,
		pull: (values.pull as boolean) ?? false,
		// Absent flags stay undefined so the clean-audio runner applies its
		// documented default (true); --no-* flags force them off.
		removeFillers: values["no-remove-fillers"]
			? false
			: (values["remove-fillers"] as boolean | undefined),
		removeSilences: values["no-remove-silences"]
			? false
			: (values["remove-silences"] as boolean | undefined),
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
		captureMode: values["capture-mode"] as string | undefined,
		recordingQuality: values["recording-quality"] as string | undefined,
		discard: (values.discard as boolean) ?? false,
		force: (values.force as boolean) ?? false,
		// `qcut record` standalone options — typed camelCase mappings
		recordDuration: values["record-duration"]
			? Number.isNaN(parseFloat(values["record-duration"] as string))
				? undefined
				: parseFloat(values["record-duration"] as string)
			: undefined,
		cursorSway: values["cursor-sway"]
			? Number.isNaN(parseFloat(values["cursor-sway"] as string))
				? undefined
				: parseFloat(values["cursor-sway"] as string)
			: undefined,
		cursorLoop: (values["cursor-loop"] as boolean) ?? false,
		zoomBlur: values["zoom-blur"]
			? Number.isNaN(parseFloat(values["zoom-blur"] as string))
				? undefined
				: parseFloat(values["zoom-blur"] as string)
			: undefined,
		mic: (values.mic as boolean) ?? false,
		systemAudio: (values["system-audio"] as boolean) ?? true,
		noAutoLaunch: (values["no-auto-launch"] as boolean) ?? false,
		// `qcut record-daemon` action flags (raw pass-through for the handler's
		// `resolveAction` lookup). Spreading kebab-case isn't needed — these
		// are top-level names already.
		...(values.stop ? { stop: true } : {}),
		...(values.start ? { start: true } : {}),
		...(values.status ? { status: true } : {}),
		// export enhancement options (passed through as raw values)
		...(values["cursor-sway"] &&
		!Number.isNaN(parseFloat(values["cursor-sway"] as string))
			? { "cursor-sway": parseFloat(values["cursor-sway"] as string) }
			: {}),
		...(values["cursor-blur"] &&
		!Number.isNaN(parseFloat(values["cursor-blur"] as string))
			? { "cursor-blur": parseFloat(values["cursor-blur"] as string) }
			: {}),
		...(values["cursor-loop"] ? { "cursor-loop": true } : {}),
		...(values["auto-zoom"] ? { "auto-zoom": true } : {}),
		...(values["zoom-blur"] &&
		!Number.isNaN(parseFloat(values["zoom-blur"] as string))
			? { "zoom-blur": parseFloat(values["zoom-blur"] as string) }
			: {}),
		...(values["gif-fps"] &&
		!Number.isNaN(parseInt(values["gif-fps"] as string, 10))
			? { "gif-fps": parseInt(values["gif-fps"] as string, 10) }
			: {}),
		...(values["gif-loop"] ? { "gif-loop": true } : {}),
		...(values["gif-quality"] &&
		!Number.isNaN(parseInt(values["gif-quality"] as string, 10))
			? { "gif-quality": parseInt(values["gif-quality"] as string, 10) }
			: {}),
		...(values.mic ? { mic: true } : {}),
		...(values["system-audio"] ? { "system-audio": true } : {}),
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
		// novel example flag
		example: (values.example as boolean) ?? false,
		// project-json flags
		full: (values.full as boolean) ?? false,
		output: values.output as string | undefined,
		engine: values.engine as string | undefined,
		verifyFrames: values["verify-frames"] as string | undefined,
		trackName: values.name as string | undefined,
		manifest: values.manifest as string | undefined,
		atomic: values["no-atomic"] ? false : ((values.atomic as boolean) ?? true),
		verify: values["no-verify"] ? false : ((values.verify as boolean) ?? true),
		// state snapshot flags
		include: values.include as string | undefined,
		withThumbnails: (values["with-thumbnails"] as boolean) ?? false,
		maxBytes: values["max-bytes"]
			? Number.isNaN(parseInt(values["max-bytes"] as string, 10))
				? undefined
				: parseInt(values["max-bytes"] as string, 10)
			: undefined,
		maxNodes: values["max-nodes"]
			? Number.isNaN(parseInt(values["max-nodes"] as string, 10))
				? undefined
				: parseInt(values["max-nodes"] as string, 10)
			: undefined,
		// performance flags
		skipHealth: (values["skip-health"] as boolean) ?? false,
		focus: (values.focus as boolean) ?? false,
		downloadDir: values["download-dir"] as string | undefined,
		statusOnly: (values["status-only"] as boolean) ?? false,
		deep: (values.deep as boolean) ?? false,
		noCapabilityCheck: (values["no-capability-check"] as boolean) ?? false,
		set: values.set as string | undefined,
		session: (values.session as boolean) ?? false,
		// sticker options
		x: values.x !== undefined ? Number(values.x) : undefined,
		y: values.y !== undefined ? Number(values.y) : undefined,
		opacity: values.opacity !== undefined ? Number(values.opacity) : undefined,
		rotation:
			values.rotation !== undefined ? Number(values.rotation) : undefined,
		stickerId: values["sticker-id"] as string | undefined,
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
				focus: { type: "boolean", default: false },
				"download-dir": { type: "string" },
				"no-capability-check": { type: "boolean", default: false },
				policy: { type: "string" },
				resume: { type: "string" },
				host: { type: "string" },
				port: { type: "string" },
				token: { type: "string" },
				"output-dir": { type: "string", short: "o" },
				"state-dir": { type: "string" },
			},
			strict: false,
		});
		const baseOptions: Partial<CLIRunOptions> = {
			json: sessionValues.json as boolean,
			quiet: sessionValues.quiet as boolean,
			verbose: sessionValues.verbose as boolean,
			skipHealth: sessionValues["skip-health"] as boolean,
			noCapabilityCheck: sessionValues["no-capability-check"] as boolean,
			policy: sessionValues.policy as string | undefined,
			resume: sessionValues.resume as string | undefined,
			host: sessionValues.host as string | undefined,
			port: sessionValues.port as string | undefined,
			token: sessionValues.token as string | undefined,
			outputDir: sessionValues["output-dir"] as string | undefined,
			stateDir: sessionValues["state-dir"] as string | undefined,
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
	const commandId = generateCommandId();
	options.commandId = commandId;
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

	const debugStream = new DebugStream({
		enabled: !!(options.verbose || options.stream),
	});

	const startTime = performance.now();
	debugStream.commandStart(commandId, options.command);
	emitter.pipelineStart(options.command, 1);
	let result: Awaited<ReturnType<typeof runner.run>>;
	try {
		result = await runner.run(options, reporter);
	} catch (err) {
		const durationMs = Math.round(performance.now() - startTime);
		debugStream.commandEnd(commandId, options.command, 1, durationMs);
		throw err;
	}
	const durationMs = Math.round(performance.now() - startTime);
	const exitCode = result.success ? 0 : getExitCode(new Error(result.error));
	debugStream.commandEnd(commandId, options.command, exitCode, durationMs);

	if (options.json) {
		emitJsonResult(options.command, result, {
			command_id: commandId,
			duration_ms: durationMs,
		});
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
		// Emit exit metadata to stderr for machine consumers
		// Skip in stream mode to keep stderr parseable as JSONL
		if (!options.quiet && !options.stream) {
			const durationSec = (durationMs / 1000).toFixed(1);
			console.error(`[exit:0 | ${durationSec}s]`);
		}
	} else {
		const { hint, exitCode } = formatErrorForCli(new Error(result.error));
		output.error(result.error || "Unknown error", hint);
		emitter.pipelineComplete({ success: false, error: result.error });
		// Emit exit metadata to stderr for machine consumers
		// Skip in stream mode to keep stderr parseable as JSONL
		if (!options.quiet && !options.stream) {
			const durationSec = (durationMs / 1000).toFixed(1);
			console.error(`[exit:${exitCode} | ${durationSec}s]`);
		}
		process.exit(exitCode);
	}
}

// Direct execution check
const scriptPath = process.argv[1];
if (
	scriptPath &&
	(scriptPath.endsWith("cli.ts") ||
		scriptPath.endsWith("cli.js") ||
		scriptPath.endsWith("qcut-pipeline") ||
		scriptPath.endsWith("/qcut") ||
		scriptPath.endsWith("\\qcut"))
) {
	main().catch((err) => {
		console.error(err.message || err);
		process.exit(1);
	});
}
