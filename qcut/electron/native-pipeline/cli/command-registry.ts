/**
 * Central Command Registry — global flags, categories,
 * and non-editor command definitions.
 *
 * Editor commands (~87) live in command-registry-editor.ts to
 * stay within the 800-line-per-file limit.
 *
 * @module electron/native-pipeline/cli/command-registry
 */

import { EDITOR_COMMANDS } from "./command-registry-editor.js";
export type {
	FlagDef,
	CommandDef,
	CategoryDef,
} from "./command-registry-types.js";
import type {
	FlagDef,
	CommandDef,
	CategoryDef,
} from "./command-registry-types.js";

/** Shorthand flag builder. */
function f(
	name: string,
	type: FlagDef["type"],
	desc: string,
	opts?: Partial<FlagDef>
): FlagDef {
	return { name, type, description: desc, ...opts };
}

// ─── Global Flags ────────────────────────────────────────────────────

export const GLOBAL_FLAGS: FlagDef[] = [
	f("--output-dir", "string", "Output directory", {
		short: "-o",
		default: "./output",
	}),
	f("--model", "string", "Model key (e.g. kling_2_6_pro, flux_dev)", {
		short: "-m",
	}),
	f("--policy", "string", "Path to a JSON action policy file"),
	f("--resume", "string", "Resume and autosave a named CLI session"),
	f("--json", "boolean", "Output results as JSON", { default: false }),
	f("--quiet", "boolean", "Suppress progress output", {
		short: "-q",
		default: false,
	}),
	f("--force", "boolean", "Bypass action-policy confirmations", {
		default: false,
	}),
	f("--verbose", "boolean", "Verbose output", { short: "-v", default: false }),
	f("--help", "boolean", "Show help", { short: "-h" }),
	f("--version", "boolean", "Show version"),
	f("--session", "boolean", "Session mode: read commands from stdin", {
		default: false,
	}),
	f("--skip-health", "boolean", "Skip editor health check", { default: false }),
	f(
		"--no-capability-check",
		"boolean",
		"Skip per-request capability warnings",
		{ default: false }
	),
	f("--host", "string", "Editor API host (default: 127.0.0.1)"),
	f("--port", "string", "Editor API port (default: 8765)"),
	f("--token", "string", "Editor API auth token"),
];

// ─── Categories ──────────────────────────────────────────────────────

export const CATEGORIES: CategoryDef[] = [
	{
		name: "generation",
		label: "Generation Commands",
		commands: [
			"generate-image",
			"create-video",
			"generate-avatar",
			"generate-grid",
			"upscale-image",
			"transfer-motion",
			"generate-remotion",
			"translate-video",
			"generate-speech",
			"convert-speech",
			"clone-voice",
		],
	},
	{
		name: "pipeline",
		label: "Pipeline Commands",
		commands: ["run-pipeline", "pipeline:status"],
	},
	{
		name: "analysis",
		label: "Analysis Commands",
		commands: ["analyze-video", "query-video", "transcribe"],
	},
	{
		name: "models",
		label: "Model Listing",
		commands: [
			"list-models",
			"list-avatar-models",
			"list-video-models",
			"list-motion-models",
			"list-speech-models",
			"estimate-cost",
		],
	},
	{
		name: "keys",
		label: "API Key Management",
		commands: ["setup", "set-key", "get-key", "delete-key", "check-keys"],
	},
	{
		name: "project",
		label: "Project Setup",
		commands: [
			"init-project",
			"organize-project",
			"structure-info",
			"create-examples",
		],
	},
	{
		name: "moyin",
		label: "Moyin Commands",
		commands: ["moyin:parse-script"],
	},
	{
		name: "youtube",
		label: "YouTube Commands",
		commands: ["youtube:upload"],
	},
	{
		name: "vimax",
		label: "ViMax Commands",
		commands: [
			"vimax:idea2video",
			"vimax:script2video",
			"vimax:novel2movie",
			"vimax:extract-characters",
			"vimax:generate-script",
			"vimax:generate-storyboard",
			"vimax:generate-portraits",
			"vimax:create-registry",
			"vimax:show-registry",
			"vimax:list-models",
		],
	},
	{
		name: "subtitle",
		label: "Subtitle Commands",
		commands: ["subtitle-style", "subtitle-export"],
	},
	{
		name: "editor",
		label: "Editor Commands",
		commands: [], // populated dynamically from EDITOR_COMMANDS keys
	},
];

// ─── Non-Editor Commands ─────────────────────────────────────────────

const CORE_COMMANDS: Record<string, CommandDef> = {
	// ── Generation ──
	"generate-image": {
		name: "generate-image",
		description: "Generate an image from text",
		category: "generation",
		flags: [
			f("--text", "string", "Text prompt", { short: "-t", required: true }),
			f("--model", "string", "Model key", {
				short: "-m",
				default: "flux_dev",
				enum: [
					"flux_dev",
					"flux_pro",
					"kling_2_6_pro",
					"recraft_v4",
					"ideogram_3",
					"dall_e_3",
				],
			}),
			f("--aspect-ratio", "string", "Aspect ratio (e.g. 16:9, 9:16)"),
			f("--resolution", "string", "Resolution (e.g. 1080p, 720p)"),
			f("--negative-prompt", "string", "Negative prompt"),
			f("--count", "number", "Generate N copies in parallel"),
			f(
				"--prompts",
				"string[]",
				"Multiple prompts for batch generation (repeatable)"
			),
			f("--image-url", "string", "Reference image URL"),
		],
		examples: [
			"qcut-pipeline generate-image -t 'A cat in space'",
			"qcut-pipeline generate-image -t 'Ocean sunset' -m flux_dev --aspect-ratio 16:9",
			"qcut-pipeline generate-image -t 'Logo design' --count 4 --json",
		],
	},
	"create-video": {
		name: "create-video",
		description: "Create a video from text or image",
		category: "generation",
		flags: [
			f("--text", "string", "Text prompt", { short: "-t", required: true }),
			f("--model", "string", "Model key", {
				short: "-m",
				default: "ltx23_fast_t2v",
				enum: [
					"ltx23_fast_t2v",
					"ltx23_fast_i2v",
					"ltx23_pro_t2v",
					"ltx23_a2v",
					"kling_2_6_pro",
					"kling_2_6_standard",
					"minimax_video_01",
					"runway_gen4",
					"veo_2",
					"wan_x",
					"seedance_1_0",
					"luma_ray2",
				],
			}),
			f("--duration", "string", "Duration (e.g. 5s)", { short: "-d" }),
			f("--aspect-ratio", "string", "Aspect ratio"),
			f("--resolution", "string", "Resolution"),
			f("--image-url", "string", "Input image URL (img2vid)"),
			f("--negative-prompt", "string", "Negative prompt"),
			f("--count", "number", "Generate N copies"),
			f("--prompts", "string[]", "Multiple prompts (repeatable)"),
		],
		examples: [
			"qcut-pipeline create-video -t 'Ocean waves' -m kling_2_6_pro -d 5s",
			"qcut-pipeline create-video -t 'A flower blooming' --image-url https://example.com/flower.jpg",
		],
	},
	"generate-avatar": {
		name: "generate-avatar",
		description: "Generate a talking avatar video",
		category: "generation",
		flags: [
			f("--text", "string", "Script/speech text", {
				short: "-t",
				required: true,
			}),
			f("--model", "string", "Model key", { short: "-m" }),
			f("--image-url", "string", "Avatar face image URL"),
			f("--audio-url", "string", "Audio URL for lip sync"),
			f("--voice-id", "string", "ElevenLabs voice ID"),
			f("--duration", "string", "Duration", { short: "-d" }),
			f("--reference-images", "string[]", "Reference images (repeatable)"),
		],
		examples: [
			"qcut-pipeline generate-avatar -t 'Hello world' --image-url https://example.com/face.jpg",
		],
	},
	"generate-grid": {
		name: "generate-grid",
		description: "Generate an image grid",
		category: "generation",
		flags: [
			f("--text", "string", "Text prompt for grid images", {
				short: "-t",
				required: true,
			}),
			f("--model", "string", "Model key", { short: "-m", default: "flux_dev" }),
			f("--layout", "string", "Grid layout", {
				default: "2x2",
				enum: ["2x2", "3x3", "2x3", "3x2", "1x2", "2x1"],
			}),
			f("--count", "number", "Override grid count"),
			f("--grid-upscale", "number", "Upscale factor for grid"),
		],
		examples: [
			"qcut-pipeline generate-grid -t 'Seasons of a tree' --layout 2x2",
		],
	},
	"upscale-image": {
		name: "upscale-image",
		description: "Upscale an image",
		category: "generation",
		flags: [
			f("--image", "string", "Input image path"),
			f("--image-url", "string", "Input image URL"),
			f("--input", "string", "Input image", { short: "-i" }),
			f("--model", "string", "Model key", { short: "-m", default: "topaz" }),
			f("--upscale", "string", "Upscale factor"),
			f("--grid-upscale", "number", "Grid upscale value"),
		],
		examples: [
			"qcut-pipeline upscale-image --image photo.jpg",
			"qcut-pipeline upscale-image --image-url https://example.com/img.png --upscale 2x",
		],
	},
	"transfer-motion": {
		name: "transfer-motion",
		description: "Transfer motion from video to image",
		category: "generation",
		flags: [
			f("--image-url", "string", "Source image URL", { required: true }),
			f("--video-url", "string", "Motion source video URL", { required: true }),
			f("--model", "string", "Model key", {
				short: "-m",
				default: "kling_motion_control",
			}),
			f("--text", "string", "Prompt text", { short: "-t" }),
			f("--prompt", "string", "Prompt text (alias)"),
			f("--orientation", "string", "Orientation setting"),
			f("--no-sound", "boolean", "Disable sound", { default: false }),
		],
		examples: [
			"qcut-pipeline transfer-motion --image-url https://example.com/img.jpg --video-url https://example.com/vid.mp4",
		],
	},
	"generate-remotion": {
		name: "generate-remotion",
		description: "Generate a Remotion component from a prompt",
		category: "generation",
		flags: [
			f("--text", "string", "Component description", {
				short: "-t",
				required: true,
			}),
			f("--export", "boolean", "Export after generate", { default: false }),
			f("--export-format", "string", "Export format"),
			f("--fps", "number", "Frames per second"),
			f("--width", "number", "Width in pixels"),
			f("--height", "number", "Height in pixels"),
		],
		examples: [
			"qcut-pipeline generate-remotion -t 'Animated logo reveal'",
			"qcut-pipeline generate-remotion -t 'Countdown timer' --fps 60 --width 1920 --height 1080",
		],
	},

	// ── Pipeline ──
	"run-pipeline": {
		name: "run-pipeline",
		description: "Run a multi-step YAML pipeline",
		category: "pipeline",
		flags: [
			f("--config", "string", "Path to YAML pipeline config", {
				short: "-c",
				required: true,
			}),
			f("--input", "string", "Pipeline input text or file", { short: "-i" }),
			f("--text", "string", "Pipeline input text (alias)", { short: "-t" }),
			f("--prompt-file", "string", "Read prompt from file"),
			f("--save-intermediates", "boolean", "Save intermediate outputs", {
				default: false,
			}),
			f("--parallel", "boolean", "Enable parallel execution", {
				default: false,
			}),
			f("--max-workers", "number", "Max concurrent workers", { default: 8 }),
			f("--no-confirm", "boolean", "Skip confirmation prompt", {
				default: false,
			}),
			f("--stream", "boolean", "Stream progress to stderr", { default: false }),
		],
		examples: [
			"qcut-pipeline run-pipeline -c pipeline.yaml -i 'A sunset'",
			"qcut-pipeline run-pipeline -c pipeline.yaml --parallel --max-workers 4",
		],
	},
	"pipeline:status": {
		name: "pipeline:status",
		description: "Get pipeline job status",
		category: "pipeline",
		flags: [f("--job-id", "string", "Pipeline job ID", { required: true })],
		examples: ["qcut-pipeline pipeline:status --job-id abc-123 --json"],
	},

	// ── Analysis ──
	"analyze-video": {
		name: "analyze-video",
		description: "Analyze a video with AI vision",
		category: "analysis",
		flags: [
			f("--input", "string", "Video path or URL", {
				short: "-i",
				required: true,
			}),
			f("--model", "string", "Model key", {
				short: "-m",
				default: "fal_video_qa",
			}),
			f("--analysis-type", "string", "Analysis type", {
				enum: ["timeline", "summary", "description", "transcript"],
			}),
			f("--output-format", "string", "Output format", { short: "-f" }),
		],
		examples: [
			"qcut-pipeline analyze-video -i video.mp4 --analysis-type timeline --json",
		],
	},
	"query-video": {
		name: "query-video",
		description: "Query a video with custom prompt (keep/cut segments)",
		category: "analysis",
		flags: [
			f("--input", "string", "Video path or URL", {
				short: "-i",
				required: true,
			}),
			f("--prompt", "string", "Custom query prompt"),
			f("--text", "string", "Query text (alias)", { short: "-t" }),
			f("--model", "string", "Model key", { short: "-m" }),
		],
		examples: [
			"qcut-pipeline query-video -i video.mp4 --prompt 'Find all action scenes'",
		],
	},
	"transcribe": {
		name: "transcribe",
		description: "Transcribe audio to text",
		category: "analysis",
		flags: [
			f("--input", "string", "Audio path or URL", {
				short: "-i",
				required: true,
			}),
			f("--model", "string", "Model key", { short: "-m" }),
			f("--language", "string", "Language code"),
			f("--no-diarize", "boolean", "Disable speaker diarization", {
				default: false,
			}),
			f("--no-tag-events", "boolean", "Don't tag timestamps", {
				default: false,
			}),
			f("--keyterms", "string[]", "Key terms (repeatable)"),
			f("--srt", "boolean", "Generate SRT subtitle", { default: false }),
			f("--srt-max-words", "number", "Max words per SRT line"),
			f("--srt-max-duration", "number", "Max duration per SRT line"),
			f("--raw-json", "boolean", "Output raw JSON", { default: false }),
		],
		examples: [
			"qcut-pipeline transcribe -i audio.mp3 --srt --json",
			"qcut-pipeline transcribe -i podcast.wav --language en --no-diarize",
		],
	},

	"autoclip": {
		name: "autoclip",
		description: "Extract highlight clips from video using subtitle analysis",
		category: "analysis",
		flags: [
			f("--input", "string", "Input video file path", {
				short: "-i",
				required: true,
			}),
			f(
				"--srt-file",
				"string",
				"SRT/VTT subtitle file (auto-detects if omitted)",
				{
					short: "-s",
				}
			),
			f("--output", "string", "Output directory", { short: "-o" }),
			f(
				"--model",
				"string",
				"LLM model (default: google/gemini-3-flash-preview)",
				{
					short: "-m",
				}
			),
			f("--min-score", "number", "Minimum score threshold 0-1 (default: 0.7)"),
			f("--step", "number", "Run only a specific step (1-4)"),
			f(
				"--chunk-minutes",
				"number",
				"Subtitle chunk interval in minutes (default: 30)"
			),
			f("--dry-run", "boolean", "Run analysis only, skip video cutting", {
				default: false,
			}),
		],
		examples: [
			"qcut-pipeline autoclip -i video.mp4 -s subs.srt",
			"qcut-pipeline autoclip -i video.mp4 --min-score 0.8 --dry-run",
			"qcut-pipeline autoclip -i video.mp4 --step 1 -s subs.srt",
		],
	},

	"clean-audio": {
		name: "clean-audio",
		description: "Remove filler words, stutters, and silences from video/audio",
		category: "analysis",
		flags: [
			f("--input", "string", "Input video/audio file path", {
				short: "-i",
				required: true,
			}),
			f(
				"--srt-file",
				"string",
				"SRT file with word timestamps (transcribes if omitted)",
				{ short: "-s" }
			),
			f("--output", "string", "Output directory", { short: "-o" }),
			f("--model", "string", "LLM model for filler detection", {
				short: "-m",
			}),
			f("--remove-fillers", "boolean", "Remove filler words (default: true)", {
				default: true,
			}),
			f(
				"--remove-silences",
				"boolean",
				"Remove long silences (default: true)",
				{ default: true }
			),
			f(
				"--silence-threshold",
				"number",
				"Silence duration threshold in seconds (default: 1.0)"
			),
			f(
				"--keep-padding",
				"number",
				"Seconds of padding to keep around cuts (default: 0.15)"
			),
			f("--dry-run", "boolean", "Analyze only, skip re-encoding", {
				default: false,
			}),
		],
		examples: [
			"qcut-pipeline clean-audio -i video.mp4",
			"qcut-pipeline clean-audio -i video.mp4 --remove-silences --silence-threshold 1.5",
			"qcut-pipeline clean-audio -i video.mp4 --dry-run",
			"qcut-pipeline clean-audio -i video.mp4 -s transcript.srt -o /tmp/clean",
		],
	},

	// ── Translate ──
	"translate-video": {
		name: "translate-video",
		description:
			"Translate a video into another language using HeyGen Translate (Speed) via FAL",
		category: "generation",
		flags: [
			f("--input", "string", "Input video file path or URL", {
				short: "-i",
				required: true,
			}),
			f("--language", "string", "Target language (e.g. Spanish, Chinese)", {
				short: "-l",
				required: true,
			}),
			f("--output", "string", "Output directory", { short: "-o" }),
			f(
				"--audio-only",
				"boolean",
				"Translate audio only (keep original video)",
				{
					default: false,
				}
			),
			f(
				"--no-dynamic-duration",
				"boolean",
				"Disable dynamic duration adjustment",
				{
					default: false,
				}
			),
			f("--speakers", "number", "Number of speakers in the video"),
		],
		examples: [
			"qcut-pipeline translate-video -i video.mp4 -l Spanish",
			"qcut-pipeline translate-video -i video.mp4 -l Chinese --audio-only",
			'qcut-pipeline translate-video -i "https://example.com/video.mp4" -l Japanese --speakers 2',
		],
	},

	// ── Speech ──
	"generate-speech": {
		name: "generate-speech",
		description: "Generate speech from text (Chatterbox TTS)",
		category: "generation",
		flags: [
			f("--text", "string", "Text to speak", { short: "-t", required: true }),
			f("--model", "string", "TTS model", {
				short: "-m",
				default: "chatterbox_tts",
				enum: [
					"chatterbox_tts",
					"chatterbox_tts_turbo",
					"elevenlabs_v3",
					"qwen3_tts",
				],
			}),
			f("--audio-url", "string", "Voice reference audio URL (for cloning)"),
			f("--voice", "string", "Voice preset name (ElevenLabs/Qwen3)"),
			f(
				"--stability",
				"number",
				"Voice stability 0-1 (ElevenLabs, default: 0.5)"
			),
			f("--language-code", "string", "Language code (ElevenLabs, e.g. 'en')"),
			f(
				"--exaggeration",
				"number",
				"Expressiveness 0-1 (Chatterbox, default: 0.25)"
			),
			f(
				"--temperature",
				"number",
				"Creativity control (default varies by model)"
			),
			f(
				"--cfg",
				"number",
				"Classifier-free guidance 0.1-1.0 (Chatterbox, default: 0.5)"
			),
			f("--seed", "number", "Seed for reproducibility"),
		],
		examples: [
			"qcut-pipeline generate-speech -t 'Hello world!'",
			"qcut-pipeline generate-speech -t 'Check this out! <laugh>' --audio-url ./voice.mp3 -m chatterbox_tts_turbo",
			"qcut-pipeline generate-speech -t 'Hello' -m elevenlabs_v3 --voice Rachel --stability 0.7",
			"qcut-pipeline generate-speech -t 'Hello' -m qwen3_tts --voice Vivian --language English",
		],
	},
	"convert-speech": {
		name: "convert-speech",
		description: "Convert speech to a different voice (Chatterbox S2S)",
		category: "generation",
		flags: [
			f("--input", "string", "Source audio path or URL", {
				short: "-i",
				required: true,
			}),
			f("--audio-url", "string", "Target voice reference audio URL"),
		],
		examples: [
			"qcut-pipeline convert-speech -i source.wav --json",
			"qcut-pipeline convert-speech -i source.wav --audio-url target-voice.mp3",
		],
	},

	"clone-voice": {
		name: "clone-voice",
		description: "Clone a voice from reference audio (Qwen3)",
		category: "generation",
		flags: [
			f("--input", "string", "Reference audio path or URL", {
				short: "-i",
				required: true,
			}),
			f("--text", "string", "Reference text from the audio (optional)", {
				short: "-t",
			}),
		],
		examples: [
			"qcut-pipeline clone-voice -i reference.mp3 --json",
			"qcut-pipeline clone-voice -i reference.mp3 -t 'What was said in the audio'",
		],
	},

	// ── Models & Cost ──
	"list-models": {
		name: "list-models",
		description: "List available AI models",
		category: "models",
		flags: [
			f("--category", "string", "Filter by category", {
				enum: [
					"image",
					"video",
					"avatar",
					"speech",
					"music",
					"motion",
					"upscale",
					"analysis",
				],
			}),
		],
		examples: [
			"qcut-pipeline list-models --json",
			"qcut-pipeline list-models --category video",
		],
	},
	"list-avatar-models": {
		name: "list-avatar-models",
		description: "List avatar models",
		category: "models",
		flags: [],
		examples: ["qcut-pipeline list-avatar-models --json"],
	},
	"list-video-models": {
		name: "list-video-models",
		description: "List video models",
		category: "models",
		flags: [],
		examples: ["qcut-pipeline list-video-models --json"],
	},
	"list-motion-models": {
		name: "list-motion-models",
		description: "List motion transfer models",
		category: "models",
		flags: [],
		examples: ["qcut-pipeline list-motion-models --json"],
	},
	"list-speech-models": {
		name: "list-speech-models",
		description: "List speech/TTS models",
		category: "models",
		flags: [],
		examples: ["qcut-pipeline list-speech-models --json"],
	},
	"estimate-cost": {
		name: "estimate-cost",
		description: "Estimate generation cost",
		category: "models",
		flags: [
			f("--model", "string", "Model key", { short: "-m" }),
			f("--text", "string", "Text prompt", { short: "-t" }),
			f("--duration", "string", "Duration", { short: "-d" }),
			f("--count", "number", "Number of items"),
		],
		examples: ["qcut-pipeline estimate-cost -m kling_2_6_pro -d 5s --json"],
	},

	// ── API Key Management ──
	"setup": {
		name: "setup",
		description: "Create API key template file",
		category: "keys",
		flags: [],
		examples: ["qcut-pipeline setup"],
	},
	"set-key": {
		name: "set-key",
		description: "Set an API key",
		category: "keys",
		flags: [
			f("--name", "string", "Key name (e.g. FAL_KEY)", { required: true }),
			f("--value", "string", "Key value (prompted if omitted)"),
		],
		examples: ["qcut-pipeline set-key --name FAL_KEY --value sk-xxx"],
	},
	"get-key": {
		name: "get-key",
		description: "Get an API key (masked)",
		category: "keys",
		flags: [
			f("--name", "string", "Key name", { required: true }),
			f("--reveal", "boolean", "Show unmasked value", { default: false }),
		],
		examples: [
			"qcut-pipeline get-key --name FAL_KEY",
			"qcut-pipeline get-key --name FAL_KEY --reveal",
		],
	},
	"delete-key": {
		name: "delete-key",
		description: "Delete a stored API key",
		category: "keys",
		flags: [f("--name", "string", "Key name", { required: true })],
		examples: ["qcut-pipeline delete-key --name FAL_KEY"],
	},
	"check-keys": {
		name: "check-keys",
		description: "Check configured API keys",
		category: "keys",
		flags: [],
		examples: ["qcut-pipeline check-keys --json"],
	},

	// ── Project Setup ──
	"init-project": {
		name: "init-project",
		description: "Initialize project directory structure",
		category: "project",
		flags: [f("--directory", "string", "Project directory", { default: "." })],
		examples: ["qcut-pipeline init-project --directory ./my-project"],
	},
	"organize-project": {
		name: "organize-project",
		description: "Organize media files into categories",
		category: "project",
		flags: [
			f("--directory", "string", "Project directory", { default: "." }),
			f("--dry-run", "boolean", "Preview without moving files", {
				default: false,
			}),
			f("--recursive", "boolean", "Recurse into subdirectories", {
				default: false,
			}),
		],
		examples: ["qcut-pipeline organize-project --directory . --dry-run"],
	},
	"structure-info": {
		name: "structure-info",
		description: "Show project structure and file counts",
		category: "project",
		flags: [
			f("--directory", "string", "Project directory", { default: "." }),
			f("--include-output", "boolean", "Include output directory", {
				default: false,
			}),
		],
		examples: ["qcut-pipeline structure-info --json"],
	},
	"create-examples": {
		name: "create-examples",
		description: "Create example pipeline configs",
		category: "project",
		flags: [],
		examples: ["qcut-pipeline create-examples -o ./examples"],
	},

	// ── Moyin ──
	"moyin:parse-script": {
		name: "moyin:parse-script",
		description: "Parse screenplay into structured data",
		category: "moyin",
		flags: [
			f("--script", "string", "Script file path"),
			f("--input", "string", "Script file or stdin", { short: "-i" }),
			f("--text", "string", "Inline script text", { short: "-t" }),
			f("--model", "string", "LLM model", { short: "-m" }),
			f("--llm-model", "string", "LLM model (alias)"),
			f("--language", "string", "Language hint"),
			f("--max-scenes", "number", "Max scenes to parse"),
			f("--stream", "boolean", "Enable streaming output", { default: false }),
		],
		examples: [
			"qcut-pipeline moyin:parse-script --script screenplay.txt --json",
			"qcut-pipeline moyin:parse-script --script screenplay.txt --model kimi --stream",
		],
	},

	// ── YouTube ──
	"youtube:upload": {
		name: "youtube:upload",
		description: "Upload a video to YouTube",
		category: "youtube",
		flags: [
			f("--input", "string", "Path to video file", {
				short: "-i",
				required: true,
			}),
			f("--title", "string", "Video title", { short: "-t", required: true }),
			f("--text", "string", "Video description"),
			f("--data", "string", "Comma-separated tags"),
			f("--mode", "string", "Privacy status", {
				default: "public",
				enum: ["public", "unlisted", "private"],
			}),
			f("--category", "string", "YouTube category ID (default: 22)", {
				default: "22",
			}),
			f("--image", "string", "Path to thumbnail image"),
		],
		examples: [
			'bun run pipeline youtube:upload -i video.mp4 -t "My Video"',
			'bun run pipeline youtube:upload -i video.mp4 -t "My Video" --mode unlisted --data "vlog,travel"',
		],
	},

	// ── Subtitle ──
	"subtitle-style": {
		name: "subtitle-style",
		description: "Apply style to subtitles and output ASS file",
		category: "subtitle",
		flags: [
			f("--input", "string", "Input subtitle file (SRT/VTT/ASS)", {
				short: "-i",
				required: true,
			}),
			f("--preset", "string", "Style preset name", {
				enum: ["default", "cinematic", "bold", "minimal", "karaoke", "news"],
			}),
			f(
				"--style",
				"string",
				'JSON style overrides (e.g. \'{"fontSize":64,"fontColor":"#ffff00"}\')'
			),
			f("--output", "string", "Output ASS file path", { short: "-o" }),
		],
		examples: [
			"qcut-pipeline subtitle-style -i subs.srt --preset bold",
			"qcut-pipeline subtitle-style -i subs.srt --style '{\"fontSize\":64}' -o styled.ass",
			"qcut-pipeline subtitle-style -i subs.srt --preset cinematic --style '{\"fontSize\":72}' --json",
		],
	},
	"subtitle-export": {
		name: "subtitle-export",
		description: "Burn styled subtitles into video (video + SRT/VTT/ASS → MP4)",
		category: "subtitle",
		flags: [
			f("--input", "string", "Input video file path", {
				short: "-i",
				required: true,
			}),
			f(
				"--srt-file",
				"string",
				"Subtitle file (auto-detects .srt/.vtt/.ass next to video if omitted)",
				{ short: "-s" }
			),
			f("--preset", "string", "Style preset name", {
				enum: ["default", "cinematic", "bold", "minimal", "karaoke", "news"],
			}),
			f("--style", "string", "JSON style overrides (e.g. '{\"fontSize\":64}')"),
			f("--resolution", "string", "Override video resolution (e.g. 1920x1080)"),
			f("--output", "string", "Output video file path"),
		],
		examples: [
			"qcut-pipeline subtitle-export -i video.mp4 --srt-file subs.srt --preset bold",
			"qcut-pipeline subtitle-export -i video.mp4 --preset cinematic --json",
			'qcut-pipeline subtitle-export -i video.mp4 -s subs.srt --style \'{"fontColor":"#ffff00"}\'',
		],
	},

	// ── ViMax ──
	"vimax:idea2video": {
		name: "vimax:idea2video",
		description: "Generate video from an idea",
		category: "vimax",
		flags: [
			f("--idea", "string", "The idea/concept", { required: true }),
			f("--title", "string", "Project title"),
			f("--max-scenes", "number", "Max scenes"),
			f("--scripts-only", "boolean", "Generate scripts only", {
				default: false,
			}),
			f("--storyboard-only", "boolean", "Stop after storyboard", {
				default: false,
			}),
			f("--no-portraits", "boolean", "Skip portrait generation", {
				default: false,
			}),
			f("--llm-model", "string", "LLM model"),
			f("--image-model", "string", "Image generation model"),
			f("--video-model", "string", "Video generation model"),
			f("--no-references", "boolean", "Skip reference images", {
				default: false,
			}),
		],
		examples: [
			"qcut-pipeline vimax:idea2video --idea 'A short film about a robot learning to paint'",
		],
	},
	"vimax:script2video": {
		name: "vimax:script2video",
		description: "Generate video from a script",
		category: "vimax",
		flags: [
			f("--script", "string", "Script file path", { required: true }),
			f("--title", "string", "Project title"),
			f("--storyboard-only", "boolean", "Stop after storyboard", {
				default: false,
			}),
			f("--no-portraits", "boolean", "Skip portrait generation", {
				default: false,
			}),
			f("--image-model", "string", "Image generation model"),
			f("--video-model", "string", "Video generation model"),
			f("--no-references", "boolean", "Skip reference images", {
				default: false,
			}),
		],
		examples: ["qcut-pipeline vimax:script2video --script screenplay.txt"],
	},
	"vimax:novel2movie": {
		name: "vimax:novel2movie",
		description: "Generate movie from a novel",
		category: "vimax",
		flags: [
			f("--novel", "string", "Novel file path", { required: true }),
			f("--title", "string", "Project title"),
			f("--max-scenes", "number", "Max scenes"),
			f("--scripts-only", "boolean", "Generate scripts only", {
				default: false,
			}),
			f("--no-portraits", "boolean", "Skip portrait generation", {
				default: false,
			}),
			f("--llm-model", "string", "LLM model"),
			f("--image-model", "string", "Image generation model"),
			f("--video-model", "string", "Video generation model"),
		],
		examples: [
			"qcut-pipeline vimax:novel2movie --novel story.txt --max-scenes 10",
		],
	},
	"vimax:extract-characters": {
		name: "vimax:extract-characters",
		description: "Extract characters from text",
		category: "vimax",
		flags: [
			f("--text", "string", "Text to extract from", {
				short: "-t",
				required: true,
			}),
		],
		examples: [
			"qcut-pipeline vimax:extract-characters -t 'John met Alice at...'",
		],
	},
	"vimax:generate-script": {
		name: "vimax:generate-script",
		description: "Generate screenplay from idea",
		category: "vimax",
		flags: [
			f("--idea", "string", "The idea/concept", { required: true }),
			f("--title", "string", "Project title"),
			f("--max-scenes", "number", "Max scenes"),
			f("--llm-model", "string", "LLM model"),
		],
		examples: [
			"qcut-pipeline vimax:generate-script --idea 'A heist story set in space'",
		],
	},
	"vimax:generate-storyboard": {
		name: "vimax:generate-storyboard",
		description: "Generate storyboard from script",
		category: "vimax",
		flags: [
			f("--script", "string", "Script file path", { required: true }),
			f("--image-model", "string", "Image generation model"),
		],
		examples: [
			"qcut-pipeline vimax:generate-storyboard --script screenplay.txt",
		],
	},
	"vimax:generate-portraits": {
		name: "vimax:generate-portraits",
		description: "Generate character portraits",
		category: "vimax",
		flags: [
			f("--portraits", "string", "Character JSON", {
				short: "-p",
				required: true,
			}),
			f("--max-characters", "number", "Max characters to generate"),
			f("--image-model", "string", "Image generation model"),
			f("--style", "string", "Art style"),
			f("--reference-model", "string", "Reference model"),
			f("--reference-strength", "number", "Reference strength (0-1)"),
			f("--views", "string", "Portrait views to generate"),
			f("--save-registry", "boolean", "Save portrait registry", {
				default: true,
			}),
		],
		examples: ["qcut-pipeline vimax:generate-portraits -p characters.json"],
	},
	"vimax:create-registry": {
		name: "vimax:create-registry",
		description: "Create portrait registry from files",
		category: "vimax",
		flags: [
			f("--directory", "string", "Directory with portrait images", {
				required: true,
			}),
			f("--save-registry", "boolean", "Save registry file", { default: true }),
		],
		examples: ["qcut-pipeline vimax:create-registry --directory ./portraits"],
	},
	"vimax:show-registry": {
		name: "vimax:show-registry",
		description: "Display registry contents",
		category: "vimax",
		flags: [f("--project-id", "string", "Project ID or directory")],
		examples: ["qcut-pipeline vimax:show-registry --json"],
	},
	"vimax:list-models": {
		name: "vimax:list-models",
		description: "List ViMax-specific models",
		category: "vimax",
		flags: [],
		examples: ["qcut-pipeline vimax:list-models --json"],
	},
};

// ─── Merged Registry ─────────────────────────────────────────────────

/** Complete registry of all CLI commands. */
export const COMMANDS_REGISTRY: Record<string, CommandDef> = {
	...CORE_COMMANDS,
	...EDITOR_COMMANDS,
};

// Populate editor category commands list from EDITOR_COMMANDS keys
const editorCategory = CATEGORIES.find((c) => c.name === "editor");
if (editorCategory) {
	editorCategory.commands = Object.keys(EDITOR_COMMANDS);
}

// ─── Lookup Helpers ──────────────────────────────────────────────────

/** Get a command definition by name, or undefined if not found. */
export function getCommand(name: string): CommandDef | undefined {
	return COMMANDS_REGISTRY[name];
}

/** Get a specific flag definition from a command. */
export function getCommandFlag(
	commandName: string,
	flagName: string
): FlagDef | undefined {
	const cmd = COMMANDS_REGISTRY[commandName];
	if (!cmd) return undefined;

	// Support short flags (e.g. "-m") and bare names (e.g. "model")
	const isShort = flagName.startsWith("-") && !flagName.startsWith("--");
	const normalized = flagName.startsWith("--")
		? flagName
		: isShort
			? flagName
			: `--${flagName}`;

	if (isShort) {
		return (
			cmd.flags.find((fl) => fl.short === normalized) ??
			GLOBAL_FLAGS.find((fl) => fl.short === normalized)
		);
	}
	return (
		cmd.flags.find((fl) => fl.name === normalized) ??
		GLOBAL_FLAGS.find((fl) => fl.name === normalized)
	);
}
