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

/** Parse process argv into CLIRunOptions, exiting on --help/--version. */
export function parseCliArgs(argv: string[]): CLIRunOptions {
	let command = argv[0];
	let wasGroupResolved = false;
	let argsOffset = 1; // how many positional args to skip before flags

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
		argsOffset = 2; // skip group + action
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

	// Emit deprecation warning for flat commands that have group equivalents
	const isQuiet =
		argv.includes("--json") || argv.includes("--quiet") || argv.includes("-q");
	warnIfDeprecated(command, wasGroupResolved, isQuiet);

	const { values } = parseArgs({
		args: argv.slice(argsOffset),
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
			policy: { type: "string" },
			resume: { type: "string" },
			input: { type: "string", short: "i" },
			profile: { type: "string", multiple: true },
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
			email: { type: "string" },
			password: { type: "string" },
			"frontal-image": { type: "string" },
			"refer-images": { type: "string", multiple: true },
			"refer-video": { type: "string" },
			"element-ids": { type: "string", multiple: true },
			description: { type: "string" },
			idea: { type: "string" },
			genre: { type: "string" },
			"target-duration": { type: "string" },
			script: { type: "string" },
			novel: { type: "string" },
			title: { type: "string" },
			"max-scenes": { type: "string" },
			"max-clips": { type: "string" },
			"scripts-only": { type: "boolean", default: false },
			"storyboard-only": { type: "boolean", default: false },
			"max-images": { type: "string" },
			"no-portraits": { type: "boolean", default: false },
			"llm-model": { type: "string" },
			"image-model": { type: "string" },
			"video-model": { type: "string" },
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
			// speech generation options
			exaggeration: { type: "string" },
			temperature: { type: "string" },
			cfg: { type: "string" },
			seed: { type: "string" },
			voice: { type: "string" },
			stability: { type: "string" },
			"language-code": { type: "string" },
			// transfer-motion options
			orientation: { type: "string" },
			"no-sound": { type: "boolean", default: false },
			// generate-avatar options
			"reference-images": { type: "string", multiple: true },
			// analyze-video options
			"analysis-type": { type: "string" },
			"output-format": { type: "string", short: "f" },
			before: { type: "string" },
			after: { type: "string" },
			// upscale-image options
			target: { type: "string" },
			// vimax options
			"no-references": { type: "boolean", default: false },
			"project-id": { type: "string" },
			// grid options
			grid: { type: "string" },
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
			"debug-trace": { type: "boolean", default: false },
			"poll-interval": { type: "string" },
			level: { type: "string" },
			since: { type: "string" },
			limit: { type: "string" },
			clear: { type: "boolean", default: false },
			interactive: { type: "boolean", default: false },
			depth: { type: "string" },
			ref: { type: "string" },
			checked: { type: "boolean" },
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
			"system-audio": { type: "boolean", default: false },
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
			// state snapshot flags
			include: { type: "string" },
			// performance flags
			"skip-health": { type: "boolean", default: false },
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
			const helpParam = findHelpParam(argv.slice(argsOffset));
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
		outputDir:
			(values["output-dir"] as string) ||
			path.join(os.homedir(), "Documents", "QCut", "exports"),
		outputDirExplicit: !!(values["output-dir"] as string),
		duration: values.duration as string | undefined,
		aspectRatio: values["aspect-ratio"] as string | undefined,
		resolution: values.resolution as string | undefined,
		config: values.config as string | undefined,
		policy: values.policy as string | undefined,
		resume: values.resume as string | undefined,
		input: values.input as string | undefined,
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
		elementDescription: values.description as string | undefined,
		idea: values.idea as string | undefined,
		genre: values.genre as string | undefined,
		targetDuration: values["target-duration"] as string | undefined,
		script: values.script as string | undefined,
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
		noPortraits: (values["no-portraits"] as boolean) ?? false,
		llmModel: values["llm-model"] as string | undefined,
		imageModel: values["image-model"] as string | undefined,
		videoModel: values["video-model"] as string | undefined,
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
		// speech generation options
		exaggeration: values.exaggeration
			? parseFloat(values.exaggeration as string)
			: undefined,
		temperature: values.temperature
			? parseFloat(values.temperature as string)
			: undefined,
		cfg: values.cfg ? parseFloat(values.cfg as string) : undefined,
		seed: values.seed ? parseInt(values.seed as string, 10) : undefined,
		voice: values.voice as string | undefined,
		stability: values.stability
			? parseFloat(values.stability as string)
			: undefined,
		languageCode: values["language-code"] as string | undefined,
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
		before: values.before as string | undefined,
		after: values.after as string | undefined,
		// upscale-image options
		target: values.target as string | undefined,
		// vimax options
		noReferences: (values["no-references"] as boolean) ?? false,
		projectId: values["project-id"] as string | undefined,
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
		ref: values.ref as string | undefined,
		selectValue: values.value as string | undefined,
		checked: values.checked as boolean | undefined,
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
		// state snapshot flags
		include: values.include as string | undefined,
		// performance flags
		skipHealth: (values["skip-health"] as boolean) ?? false,
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
