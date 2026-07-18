import { basename, dirname, extname, join, resolve } from "node:path";
import {
	VLOG_BACKGROUND_FITS,
	VLOG_PRESETS,
	type VlogBackgroundFit,
	type VlogOptions,
	type VlogPaths,
	type VlogPreset,
} from "./types";

const DEFAULT_SILENCE_THRESHOLD = 1;
const DEFAULT_KEEP_PADDING = 0.15;
const DEFAULT_SRT_MAX_WORDS = 8;
const DEFAULT_SRT_MAX_DURATION = 4;
const DEFAULT_PORTRAIT_FILTER = "soft-skin";
const DEFAULT_BEAUTY = 25;

interface ParsedTokens {
	input?: string;
	outputDir?: string;
	finalName?: string;
	background?: string;
	backgroundFit?: string;
	portraitFilter?: string;
	filterIntensity?: number;
	beauty?: number;
	preset?: string;
	style?: string;
	model?: string;
	language?: string;
	silenceThreshold?: number;
	keepPadding?: number;
	srtMaxWords?: number;
	srtMaxDuration?: number;
	keepFillers: boolean;
	keepSilences: boolean;
	analyzeOnly: boolean;
	resume: boolean;
	force: boolean;
	json: boolean;
	help: boolean;
}

function readOptionValue({
	argv,
	index,
	flag,
}: {
	argv: string[];
	index: number;
	flag: string;
}): string {
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

function parseNumber({
	value,
	flag,
	min,
	max,
	integer = false,
}: {
	value: string;
	flag: string;
	min: number;
	max: number;
	integer?: boolean;
}): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
		throw new Error(`${flag} must be between ${min} and ${max}`);
	}
	if (integer && !Number.isInteger(parsed)) {
		throw new Error(`${flag} must be an integer`);
	}
	return parsed;
}

function parseStyle({ value }: { value: string }): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error("--style must be valid JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("--style must be a JSON object");
	}
	return value;
}

function parseTokens({ argv }: { argv: string[] }): ParsedTokens {
	const parsed: ParsedTokens = {
		keepFillers: false,
		keepSilences: false,
		analyzeOnly: false,
		resume: false,
		force: false,
		json: false,
		help: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--analyze-only") {
			parsed.analyzeOnly = true;
			continue;
		}
		if (token === "--resume") {
			parsed.resume = true;
			continue;
		}
		if (token === "--force") {
			parsed.force = true;
			continue;
		}
		if (token === "--json") {
			parsed.json = true;
			continue;
		}
		if (token === "--keep-fillers") {
			parsed.keepFillers = true;
			continue;
		}
		if (token === "--keep-silences") {
			parsed.keepSilences = true;
			continue;
		}
		if (token === "--input" || token === "-i") {
			parsed.input = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--output-dir" || token === "-o") {
			parsed.outputDir = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--final-name") {
			parsed.finalName = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--background" || token === "-b") {
			parsed.background = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--background-fit") {
			parsed.backgroundFit = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--portrait-filter") {
			parsed.portraitFilter = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--filter-intensity") {
			parsed.filterIntensity = parseNumber({
				value: readOptionValue({ argv, index, flag: token }),
				flag: token,
				min: 0,
				max: 100,
			});
			index += 1;
			continue;
		}
		if (token === "--beauty") {
			parsed.beauty = parseNumber({
				value: readOptionValue({ argv, index, flag: token }),
				flag: token,
				min: 0,
				max: 100,
			});
			index += 1;
			continue;
		}
		if (token === "--preset") {
			parsed.preset = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--style") {
			parsed.style = parseStyle({
				value: readOptionValue({ argv, index, flag: token }),
			});
			index += 1;
			continue;
		}
		if (token === "--model") {
			parsed.model = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--language") {
			parsed.language = readOptionValue({ argv, index, flag: token });
			index += 1;
			continue;
		}
		if (token === "--silence-threshold") {
			parsed.silenceThreshold = parseNumber({
				value: readOptionValue({ argv, index, flag: token }),
				flag: token,
				min: 0.1,
				max: 30,
			});
			index += 1;
			continue;
		}
		if (token === "--keep-padding") {
			parsed.keepPadding = parseNumber({
				value: readOptionValue({ argv, index, flag: token }),
				flag: token,
				min: 0,
				max: 2,
			});
			index += 1;
			continue;
		}
		if (token === "--srt-max-words") {
			parsed.srtMaxWords = parseNumber({
				value: readOptionValue({ argv, index, flag: token }),
				flag: token,
				min: 1,
				max: 50,
				integer: true,
			});
			index += 1;
			continue;
		}
		if (token === "--srt-max-duration") {
			parsed.srtMaxDuration = parseNumber({
				value: readOptionValue({ argv, index, flag: token }),
				flag: token,
				min: 0.25,
				max: 30,
			});
			index += 1;
			continue;
		}
		if (token.startsWith("-")) {
			throw new Error(`Unknown option: ${token}`);
		}
		if (parsed.input) {
			throw new Error(`Unexpected positional argument: ${token}`);
		}
		parsed.input = token;
	}

	return parsed;
}

function resolvePreset({ value }: { value?: string }): VlogPreset {
	const preset = value ?? "default";
	if (!VLOG_PRESETS.includes(preset as VlogPreset)) {
		throw new Error(`--preset must be one of: ${VLOG_PRESETS.join(", ")}`);
	}
	return preset as VlogPreset;
}

function resolveBackgroundFit({
	value,
}: {
	value?: string;
}): VlogBackgroundFit {
	const fit = value ?? "cover";
	if (!VLOG_BACKGROUND_FITS.includes(fit as VlogBackgroundFit)) {
		throw new Error(
			`--background-fit must be one of: ${VLOG_BACKGROUND_FITS.join(", ")}`
		);
	}
	return fit as VlogBackgroundFit;
}

function resolveFinalName({ input, value }: { input: string; value?: string }) {
	const defaultName = `${basename(input, extname(input))}_vlog.mp4`;
	const finalName = value ?? defaultName;
	if (
		basename(finalName) !== finalName ||
		extname(finalName).toLowerCase() !== ".mp4"
	) {
		throw new Error("--final-name must be an MP4 filename without directories");
	}
	return finalName;
}

export function parseVlogOptions({
	argv,
	cwd = process.cwd(),
}: {
	argv: string[];
	cwd?: string;
}): VlogOptions {
	const parsed = parseTokens({ argv });
	if (parsed.resume && parsed.force) {
		throw new Error("--resume and --force cannot be used together");
	}
	if (parsed.help) {
		return {
			input: "",
			outputDir: "",
			finalName: "",
			backgroundFit: "cover",
			portraitFilter: DEFAULT_PORTRAIT_FILTER,
			beauty: DEFAULT_BEAUTY,
			preset: "default",
			model: "scribe_v2",
			silenceThreshold: DEFAULT_SILENCE_THRESHOLD,
			keepPadding: DEFAULT_KEEP_PADDING,
			srtMaxWords: DEFAULT_SRT_MAX_WORDS,
			srtMaxDuration: DEFAULT_SRT_MAX_DURATION,
			keepFillers: false,
			keepSilences: false,
			analyzeOnly: false,
			resume: false,
			force: false,
			json: parsed.json,
			help: true,
		};
	}
	if (!parsed.input) {
		throw new Error("Missing input video. Pass a path or use --input/-i");
	}

	const input = resolve(cwd, parsed.input);
	const outputDir = parsed.outputDir
		? resolve(cwd, parsed.outputDir)
		: join(dirname(input), `${basename(input, extname(input))}-vlog`);

	return {
		input,
		outputDir,
		finalName: resolveFinalName({ input, value: parsed.finalName }),
		background: parsed.background ? resolve(cwd, parsed.background) : undefined,
		backgroundFit: resolveBackgroundFit({ value: parsed.backgroundFit }),
		portraitFilter: parsed.portraitFilter ?? DEFAULT_PORTRAIT_FILTER,
		filterIntensity: parsed.filterIntensity,
		beauty: parsed.beauty ?? DEFAULT_BEAUTY,
		preset: resolvePreset({ value: parsed.preset }),
		style: parsed.style,
		model: parsed.model ?? "scribe_v2",
		language: parsed.language,
		silenceThreshold: parsed.silenceThreshold ?? DEFAULT_SILENCE_THRESHOLD,
		keepPadding: parsed.keepPadding ?? DEFAULT_KEEP_PADDING,
		srtMaxWords: parsed.srtMaxWords ?? DEFAULT_SRT_MAX_WORDS,
		srtMaxDuration: parsed.srtMaxDuration ?? DEFAULT_SRT_MAX_DURATION,
		keepFillers: parsed.keepFillers,
		keepSilences: parsed.keepSilences,
		analyzeOnly: parsed.analyzeOnly,
		resume: parsed.resume,
		force: parsed.force,
		json: parsed.json,
		help: false,
	};
}

export function createVlogPaths({
	options,
}: {
	options: VlogOptions;
}): VlogPaths {
	const stem = basename(options.input, extname(options.input));
	const metadataDir = join(options.outputDir, "clean-metadata");
	const verificationDir = join(options.outputDir, "verification");
	const cleanVideo = join(
		options.outputDir,
		`${stem}_clean${extname(options.input)}`
	);
	const portraitVideo = join(options.outputDir, `${stem}_vlog_portrait.mp4`);
	const cutoutVideo = join(options.outputDir, `${stem}_cutout.webm`);
	const editableVideo = join(options.outputDir, `${stem}_vlog_editable.mp4`);
	const finalVideo = join(options.outputDir, options.finalName);
	if (resolve(cleanVideo) === resolve(options.input)) {
		throw new Error("Clean-video output cannot replace the source video");
	}
	if (resolve(finalVideo) === resolve(options.input)) {
		throw new Error("Final-video output cannot replace the source video");
	}
	if (resolve(editableVideo) === resolve(options.input)) {
		throw new Error("Editable-video output cannot replace the source video");
	}
	if (resolve(portraitVideo) === resolve(options.input)) {
		throw new Error("Portrait-video output cannot replace the source video");
	}
	if (resolve(finalVideo) === resolve(editableVideo)) {
		throw new Error("Final and editable video outputs must be different files");
	}
	if (
		options.background &&
		[cutoutVideo, editableVideo, finalVideo].some(
			(outputPath) => resolve(outputPath) === resolve(options.background ?? "")
		)
	) {
		throw new Error("Vlog outputs cannot replace the background image");
	}
	return {
		input: options.input,
		outputDir: options.outputDir,
		metadataDir,
		logsDir: join(options.outputDir, "logs"),
		verificationDir,
		words: join(metadataDir, "words.json"),
		decisions: join(metadataDir, "decisions.json"),
		cuts: join(metadataDir, "cuts.json"),
		keeps: join(metadataDir, "keeps.json"),
		cleanVideo,
		portraitVideo,
		cutoutVideo,
		editableVideo,
		cleanAudio: join(options.outputDir, `${stem}_clean_audio.mp3`),
		srt: join(options.outputDir, "transcription.srt"),
		finalVideo,
		previewImage: join(verificationDir, "subtitle-preview.png"),
		backgroundPreviewImage: join(verificationDir, "background-preview.png"),
		manifest: join(options.outputDir, "vlog-manifest.json"),
	};
}

export function renderUsage(): string {
	return `QCut Vlog

Usage:
  bun scripts/main.ts <video> [options]

Options:
  -i, --input <path>              Input talking-head video
  -o, --output-dir <path>         Output directory (default: <name>-vlog)
      --final-name <name.mp4>     Final filename
  -b, --background <image>        Cut out the person and composite this image
      --background-fit <mode>     cover|contain|stretch (default: cover)
      --portrait-filter <name>    Portrait preset (default: soft-skin; use none to disable)
      --filter-intensity <0-100>  Override the portrait preset intensity
      --beauty <0-100>            Skin smoothing amount (default: 25)
      --preset <name>             default|cinematic|bold|minimal|karaoke|news
      --style <json>              Subtitle style overrides
      --model <name>              Transcription model (default: scribe_v2)
      --language <code>           Optional transcription language
      --silence-threshold <sec>   Long-pause threshold (default: 1.0)
      --keep-padding <sec>        Extra cut padding per side (default: 0.15)
      --srt-max-words <count>     Subtitle tokens per card (default: 8)
      --srt-max-duration <sec>    Subtitle card duration limit (default: 4)
      --keep-fillers              Keep filler words
      --keep-silences             Keep long silences
      --analyze-only              Write cut metadata without rendering
      --resume                    Reuse only fresh, validated artifacts
      --force                     Replace known workflow artifacts
      --json                      Suppress child output and print JSON result
  -h, --help                      Show help
`;
}
