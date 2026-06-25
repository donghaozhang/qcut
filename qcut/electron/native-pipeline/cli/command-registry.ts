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

/** Flags available to every CLI command (output, model, verbosity, etc.). */
export const GLOBAL_FLAGS: FlagDef[] = [
	f("--output-dir", "string", "Output directory", {
		short: "-o",
		default: "$QCUT_OUTPUT_DIR or ~/Documents/QCut/exports",
	}),
	f("--model", "string", "Model key (e.g. gpt_image_2_ima, kling_2_6_pro)", {
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

/** Ordered list of command categories shown in CLI help output. */
export const CATEGORIES: CategoryDef[] = [
	{
		name: "generation",
		label: "Generation Commands",
		commands: [
			"generate-image",
			"create-video",
			"generate-avatar",
			"stamp-image",
			"upscale-image",
			"upscale-video",
			"transfer-motion",
			"generate-remotion",
			"translate-video",
			"generate-music",
			"generate-speech",
			"convert-speech",
			"clone-voice",
			"create-element",
			"list-elements",
			"delete-element",
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
		commands: [
			"analyze-video",
			"analyze-consistency",
			"analyze-image-consistency",
			"query-video",
			"transcribe",
		],
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
		commands: [
			"login",
			"signup",
			"logout",
			"setup",
			"set-key",
			"get-key",
			"delete-key",
			"keys",
			"check-keys",
			"system-doctor",
		],
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
		name: "recording",
		label: "Screen Recording",
		commands: ["record", "record-daemon"],
	},
	{
		name: "vimax",
		label: "ViMax Commands",
		commands: [
			"vimax:idea2video",
			"vimax:script2video",
			"vimax:novel2movie",
			"vimax:novel2script",
			"vimax:novel2video",
			"vimax:lint-scripts",
			"vimax:extract-characters",
			"vimax:extract-scenes",
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
		name: "phota",
		label: "Phota Commands",
		commands: ["phota:edit", "phota:enhance", "phota:profile"],
	},
	{
		name: "replicate",
		label: "Video Replicate Commands",
		commands: ["replicate", "replicate:analyze", "replicate:generate"],
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
				default: "gpt_image_2_ima",
				enum: [
					"gpt_image_2_ima",
					"gpt_image_2_gmi",
					"gpt_image_2_fal",
					"luma_uni_1_image",
					"flux_dev",
					"flux_pro",
					"kling_2_6_pro",
					"recraft_v4",
					"ideogram_3",
					"dall_e_3",
					"wan_v2_7_t2i",
					"wan_v2_7_pro_t2i",
					"wan_v2_7_edit",
					"wan_v2_7_pro_edit",
				],
			}),
			f("--aspect-ratio", "string", "Aspect ratio (e.g. 16:9, 9:16)"),
			f("--ratio", "string", "Alias for --aspect-ratio"),
			f("--aspect", "string", "Alias for --aspect-ratio"),
			f(
				"--width",
				"number",
				"Custom image width in pixels (IMA Router GPT Image 2)"
			),
			f(
				"--height",
				"number",
				"Custom image height in pixels (IMA Router GPT Image 2)"
			),
			f("--resolution", "string", "Resolution (e.g. 1080p, 720p)"),
			f("--negative-prompt", "string", "Negative prompt"),
			f("--count", "number", "Generate N copies in parallel"),
			f(
				"--prompts",
				"string[]",
				"Multiple prompts for batch generation (repeatable)"
			),
			f("--image-url", "string", "Reference image URL"),
			f("--reference-images", "string[]", "Reference images (repeatable)"),
			f("--grid", "string", "Generate image grid (e.g. 2x2, 3x3, 2x3)", {
				enum: ["2x2", "3x3", "2x3", "3x2", "1x2", "2x1"],
			}),
			f("--grid-upscale", "number", "Upscale factor for grid composite"),
			f("--style", "string", "Style prefix prepended to prompt"),
		],
		examples: [
			"qcut-pipeline generate-image -t 'A cat in space'",
			"qcut-pipeline generate-image -t 'A teddy bear in sunglasses playing electric guitar' -m luma_uni_1_image --aspect-ratio 16:9",
			"qcut-pipeline generate-image -t 'Ocean sunset' --aspect-ratio 16:9",
			"qcut-pipeline generate-image -t 'Make the character wear a red jacket' --image-url https://example.com/character.png",
			"qcut-pipeline generate-image -t 'Logo design' --count 4 --json",
			"qcut-pipeline generate-image -t 'Seasons of a tree' --grid 2x2",
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
				default: "imarouter_seedance_2_0_fast_t2v",
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
					"seedance_2_0",
					"seedance_2_0_i2v",
					"seedance_2_0_ref2v",
					"vidu_q3_ref2v_mix",
					"luma_ray2",
					"luma_ray_3_2",
					"luma_ray_3_2_edit",
					"gmi_seedance_2_0_260128_t2v",
					"gmi_seedance_2_0_260128_i2v",
					"gmi_seedance_2_0_260128_ref2v",
					"imarouter_seedance_2_0_t2v",
					"imarouter_seedance_2_0_fast_t2v",
					"imarouter_seedance_2_0_i2v",
					"imarouter_seedance_2_0_fast_i2v",
					"imarouter_seedance_2_0_ref2v",
					"imarouter_seedance_2_0_cn_t2v",
					"imarouter_seedance_2_0_fast_cn_t2v",
					"imarouter_seedance_2_0_cn_i2v",
					"imarouter_seedance_2_0_fast_cn_i2v",
					"imarouter_seedance_2_0_cn_ref2v",
					"happy_horse_t2v",
					"happy_horse_ref2v",
					"happy_horse_video_edit",
				],
			}),
			f("--duration", "string", "Duration (e.g. 5s)", { short: "-d" }),
			f("--aspect-ratio", "string", "Aspect ratio"),
			f("--resolution", "string", "Resolution"),
			f("--loop", "boolean", "Luma Ray 3.2: generate a looping video"),
			f("--hdr", "boolean", "Luma Ray 3.2: enable HDR output"),
			f("--exr-export", "boolean", "Luma Ray 3.2: export EXR frames"),
			f("--image-url", "string", "Input image URL (img2vid)"),
			f(
				"--video-url",
				"string",
				"Input video URL (video-edit models, e.g. happy_horse_video_edit)"
			),
			f(
				"--source-generation-id",
				"string",
				"Luma Ray 3.2 edit: previous completed Luma video generation id"
			),
			f(
				"--reference-images",
				"string[]",
				"Reference image URLs (repeatable). Used by happy_horse_ref2v (1–9), happy_horse_video_edit (≤5), or luma_ray_3_2_edit guide frame (first image)"
			),
			f(
				"--keyframe-images",
				"string[]",
				"Luma Ray 3.2: repeatable guide frame paths/URLs for video.keyframes"
			),
			f(
				"--keyframe-indexes",
				"string[]",
				"Luma Ray 3.2: repeatable output-frame indexes matching --keyframe-images; auto-spaced when omitted"
			),
			f(
				"--edit-strength",
				"string",
				"Luma Ray 3.2 edit strength: adhere_1..3, flex_1..3, reimagine_1..3"
			),
			f(
				"--audio-setting",
				"string",
				"Happy Horse video-edit: 'auto' (model decides) or 'origin' (preserve input audio)",
				{ enum: ["auto", "origin"] }
			),
			f("--negative-prompt", "string", "Negative prompt"),
			f("--count", "number", "Generate N copies"),
			f("--prompts", "string[]", "Multiple prompts (repeatable)"),
			f(
				"--element-ids",
				"string[]",
				"Kling element IDs for consistent characters"
			),
			f(
				"--sound",
				"string",
				"Kling V3 Omni native audio toggle: 'on' or 'off' (default off)"
			),
			f("--watermark", "boolean", "Kling V3 Omni: enable watermark on output"),
		],
		examples: [
			"qcut-pipeline create-video -t 'Ocean waves' -m kling_2_6_pro -d 5s",
			"qcut-pipeline create-video -t 'slow dolly through a misty greenhouse' -m luma_ray_3_2 --aspect-ratio 16:9 --resolution 720p -d 5s",
			"qcut-pipeline create-video -t 'a perfect looping product turntable' -m luma_ray_3_2 --loop",
			"qcut-pipeline create-video -t 'three storyboard beats in sequence' -m luma_ray_3_2 --keyframe-images ./beat1.png --keyframe-images ./beat2.png --keyframe-images ./beat3.png --keyframe-indexes 0 --keyframe-indexes 60 --keyframe-indexes 120",
			"qcut-pipeline create-video -t 'Transform the scene into moonlit 35mm film footage' -m luma_ray_3_2_edit --source-generation-id d290f1ee-6c54-4b01-90e6-d701748f0851 --resolution 720p",
			"qcut-pipeline create-video -t 'A flower blooming' --image-url https://example.com/flower.jpg",
			"qcut-pipeline create-video -t '<<<element_1>>> walks in park' -m gmi_kling_v3_omni_t2v --element-ids abc123",
			"qcut-pipeline create-video -t '<<<element_1>>> sings on stage' -m gmi_kling_v3_omni_i2v --element-ids abc --sound on --watermark",
			"qcut-pipeline create-video -t 'neon city at dusk' -m happy_horse_t2v -d 5s --aspect-ratio 16:9 --resolution 1080p",
			"qcut-pipeline create-video -t 'character1 hands character2 a coffee cup' -m happy_horse_ref2v --reference-images https://.../alice.png --reference-images https://.../bob.png",
			"qcut-pipeline create-video -t 'make @Image1 wear a red coat in the rain' -m happy_horse_video_edit --video-url https://.../source.mp4 --reference-images https://.../coat.png --resolution 1080p --audio-setting origin",
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
			f("--model", "string", "Model key", {
				short: "-m",
				default: "gpt_image_2_ima",
			}),
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
	"stamp-image": {
		name: "stamp-image",
		description: "Add logo and/or text overlay to an image",
		category: "generation",
		flags: [
			f("--input", "string", "Input image path", {
				short: "-i",
				required: true,
			}),
			f("--text", "string", "Text label (e.g. model name)", { short: "-t" }),
			f(
				"--image-url",
				"string",
				'Logo path (default: QCut logo, "none" to skip)'
			),
			f(
				"--data",
				"string",
				"Position: top-left, top-right, bottom-left, bottom-right",
				{
					default: "bottom-right",
				}
			),
			f(
				"--duration",
				"string",
				"Logo scale factor relative to image height (default: 0.08)"
			),
		],
		examples: [
			"qcut-pipeline stamp-image -i photo.png -t 'Wan 2.7 Pro'",
			"qcut-pipeline stamp-image -i photo.png --image-url /path/to/logo.png -t 'Model X' --data top-right",
			"qcut-pipeline stamp-image -i photo.png --image-url none -t 'Text only'",
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
	"upscale-video": {
		name: "upscale-video",
		description: "Upscale a video using FAL Topaz Video Upscale",
		category: "generation",
		flags: [
			f("--video", "string", "Local video path (auto-uploaded to FAL)"),
			f("--video-url", "string", "Remote video URL"),
			f("--input", "string", "Alias for --video or --video-url", {
				short: "-i",
			}),
			f("--model", "string", "Model key", { short: "-m", default: "topaz" }),
			f("--upscale", "number", "Upscale factor (1-4)", { default: 2 }),
			f("--target-fps", "number", "Target FPS (omit to keep source)"),
			f("--output-format", "string", "Output extension", {
				short: "-f",
				default: "mp4",
			}),
		],
		examples: [
			"qcut edit upscale-video --video clip.mp4 --upscale 4",
			"qcut edit upscale-video --video-url https://example.com/clip.mp4 --upscale 2 --target-fps 60",
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
				default: "openrouter_gemini_3_5_flash_video",
			}),
			f("--analysis-type", "string", "Analysis type", {
				enum: ["timeline", "summary", "description", "transcript", "review"],
			}),
			f("--output-format", "string", "Output format", { short: "-f" }),
			f("--review-language", "string", "Review prompt language", {
				enum: ["zh", "en"],
			}),
			f("--review-prompt-dir", "string", "Custom review prompt directory"),
			f("--max-tokens", "number", "Maximum review output tokens"),
		],
		examples: [
			"qcut-pipeline analyze-video -i video.mp4 --analysis-type timeline --json",
			"qcut analyze video -i video.mp4 --analysis-type review --review-language zh --json",
		],
	},
	"analyze-consistency": {
		name: "analyze-consistency",
		description: "Detect character consistency issues using reference images",
		category: "analysis",
		flags: [
			f("--ref", "string[]", "Reference image path or URL", {
				required: true,
			}),
			f("--input", "string", "Video path or URL", {
				short: "-i",
				required: true,
			}),
			f("--model", "string", "Model key", {
				short: "-m",
				default: "openrouter_gemini_3_5_flash_video",
			}),
			f("--language", "string", "Prompt language", {
				enum: ["zh", "en"],
				default: "zh",
			}),
			f("--fps", "number", "Keyframe sampling rate", { default: 1 }),
			f("--scene-detect", "boolean", "Use scene-change keyframe selection", {
				default: false,
			}),
			f("--batch-size", "number", "Keyframes per model request", {
				default: 6,
			}),
			f("--min-severity", "string", "Minimum severity to report", {
				enum: ["low", "medium", "high"],
				default: "high",
			}),
			f("--max-tokens", "number", "Maximum output tokens per request", {
				default: 8000,
			}),
		],
		examples: [
			"qcut analyze consistency --ref ref.jpg -i scene.mp4 --json",
			"qcut analyze consistency --ref ref1.jpg --ref ref2.jpg -i scene.mp4 --fps 2 --min-severity medium",
		],
	},
	"analyze-image-consistency": {
		name: "analyze-image-consistency",
		description:
			"Check candidate images against reference images and an optional rule",
		category: "analysis",
		flags: [
			f("--ref", "string[]", "Reference image path or URL", {
				required: true,
			}),
			f("--candidate", "string[]", "Candidate image path or URL (repeatable)"),
			f("--dir", "string", "Directory of candidate images"),
			f("--rule", "string", "Inline rule text used as the verdict basis"),
			f(
				"--rules-file",
				"string",
				"Path to a rule file (e.g. a requirement md)"
			),
			f("--model", "string", "Model key", {
				short: "-m",
				default: "openrouter_gemini_3_5_flash_video",
			}),
			f("--language", "string", "Prompt language", {
				enum: ["zh", "en"],
				default: "zh",
			}),
			f("--batch-size", "number", "Candidate images per model request", {
				default: 6,
			}),
			f("--min-severity", "string", "Minimum severity to report", {
				enum: ["low", "medium", "high"],
				default: "high",
			}),
			f("--max-tokens", "number", "Maximum output tokens per request", {
				default: 8000,
			}),
		],
		examples: [
			"qcut analyze image-consistency --ref ref.png --candidate gen.png --json",
			"qcut analyze image-consistency --ref ref.png --dir ./frames --rules-file rule.md --min-severity medium",
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
			f("--model", "string", "Model key", {
				short: "-m",
				default: "openrouter_gemini_3_5_flash_video",
			}),
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
			f("--provider", "string", "Provider name (auto-selects model)", {
				enum: ["elevenlabs"],
			}),
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
			f("--model", "string", "LLM model (default: google/gemini-3.5-flash)", {
				short: "-m",
				default: "google/gemini-3.5-flash",
			}),
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
			"Translate video or audio into another language using HeyGen Translate (Speed) via FAL",
		category: "generation",
		flags: [
			f("--input", "string", "Input video or audio file path/URL", {
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
				"--output-audio",
				"boolean",
				"Output translated audio file (auto-enabled for audio input)",
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
			"qcut-pipeline translate-video -i podcast.mp3 -l Chinese",
			"qcut-pipeline translate-video -i video.mp4 -l Japanese --output-audio",
			'qcut-pipeline translate-video -i "https://example.com/video.mp4" -l Japanese --speakers 2',
		],
	},

	// ── Music ──
	"generate-music": {
		name: "generate-music",
		description: "Generate music from text prompt with optional lyrics",
		category: "generation",
		flags: [
			f("--text", "string", "Music style/mood description (10-300 chars)", {
				short: "-t",
				required: true,
			}),
			f(
				"--lyrics",
				"string",
				"Song lyrics with structure tags ([verse], [chorus])"
			),
			f("--instrumental", "boolean", "Generate instrumental (no vocals)", {
				default: false,
			}),
			f("--model", "string", "Music model", {
				short: "-m",
				default: "minimax_music_v2_6",
				enum: ["minimax_music_v2_6", "minimax_music_v2_5"],
			}),
			f("--provider", "string", "Provider name", {
				enum: ["minimax"],
			}),
			f("--sample-rate", "number", "Sample rate", {
				enum: ["16000", "24000", "32000", "44100"],
			}),
			f("--bitrate", "number", "Bitrate", {
				enum: ["32000", "64000", "128000", "256000"],
			}),
			f("--audio-format", "string", "Output format", {
				default: "mp3",
				enum: ["mp3", "wav", "pcm"],
			}),
		],
		examples: [
			'qcut gen music -t "Upbeat pop, warm female vocal, 104 BPM"',
			'qcut gen music -t "City Pop, 80s retro" --lyrics "[verse] La da dee, sunny day"',
			'qcut gen music -t "Cinematic orchestral" --instrumental',
		],
	},

	// ── Standalone screen recording (Phase 1 of dual-mode CLI recording) ──
	record: {
		name: "record",
		description: "Record the screen standalone (spawns a headless QCut)",
		category: "recording",
		flags: [
			f(
				"--source",
				"string",
				"Capture source ID (from editor:screen-recording:sources)"
			),
			f(
				"--record-duration",
				"number",
				"Auto-stop after N seconds (omit to wait for Ctrl-C)"
			),
			f("--output", "string", "Output file name", { short: "-o" }),
			f("--cursor-sway", "number", "Cursor wobble intensity (0-2)"),
			f("--cursor-loop", "boolean", "Smooth loop return for cursor path"),
			f("--zoom-blur", "number", "Motion blur during zoom (0-1)"),
			f("--mic", "boolean", "Capture microphone audio"),
			f("--system-audio", "boolean", "Capture system audio", { default: true }),
			f(
				"--no-auto-launch",
				"boolean",
				"Fail if no headless recorder can be spawned"
			),
		],
		examples: [
			"qcut record --record-duration 10 -o demo.mp4",
			"qcut record --source screen:0:0 --cursor-sway 1.0 -o polished.mp4",
			"qcut record -o long.mp4  # press Ctrl-C to stop",
		],
	},

	// ── Headless daemon management (Phase 2 of dual-mode CLI recording) ──
	"record-daemon": {
		name: "record-daemon",
		description: "Manage the headless recorder daemon",
		category: "recording",
		flags: [
			f("--status", "boolean", "Show daemon pid and port (default)"),
			f("--stop", "boolean", "Send SIGTERM to the running daemon"),
			f("--start", "boolean", "Spawn a new daemon in the background"),
		],
		examples: [
			"qcut record-daemon",
			"qcut record-daemon --stop",
			"qcut record-daemon --start",
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
			f("--provider", "string", "Provider name (auto-selects model)", {
				enum: ["chatterbox", "elevenlabs", "qwen"],
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

	// ── Elements ──
	"create-element": {
		name: "create-element",
		description: "Create a reusable character/object element for Kling V3 Omni",
		category: "generation",
		flags: [
			f("--name", "string", "Element name (max 20 chars)", {
				required: true,
			}),
			f("--description", "string", "Element description (max 100 chars)", {
				required: true,
			}),
			f(
				"--frontal-image",
				"string",
				"Frontal reference image path/URL (required for image_refer, omit for --refer-video)"
			),
			f("--refer-images", "string[]", "Additional reference images (1-3)"),
			f(
				"--refer-video",
				"string",
				"Reference video path/URL (alternative to images)"
			),
			f(
				"--tag-list",
				"string[]",
				"Kling element tags (e.g. o_102 o_105). See GMI docs for the full list."
			),
		],
		examples: [
			'qcut-pipeline create-element --name "Detective" --description "Female detective in trench coat" --frontal-image front.jpg --refer-images side.jpg',
			'qcut-pipeline create-element --name "Chef" --description "Chef with white hat" --frontal-image chef.jpg --tag-list o_102 --tag-list o_105',
		],
	},
	"list-elements": {
		name: "list-elements",
		description: "List stored Kling elements",
		category: "generation",
		flags: [],
		examples: ["qcut-pipeline list-elements"],
	},
	"delete-element": {
		name: "delete-element",
		description: "Delete a stored element by ID or name",
		category: "generation",
		flags: [
			f("--element-id", "string", "Element ID to delete", { required: true }),
		],
		examples: ["qcut-pipeline delete-element --element-id abc123"],
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
	login: {
		name: "login",
		description: "Log in to QCut with email and password",
		category: "keys",
		flags: [
			f("--email", "string", "Email address", { required: true }),
			f("--password", "string", "Password (prompted if omitted)"),
		],
		examples: ["qcut-pipeline login --email user@gmail.com"],
	},
	signup: {
		name: "signup",
		description: "Create a new QCut account",
		category: "keys",
		flags: [
			f("--email", "string", "Email address", { required: true }),
			f("--name", "string", "Display name", { required: true }),
			f("--password", "string", "Password (prompted if omitted)"),
		],
		examples: ["qcut-pipeline signup --email user@gmail.com --name 'Jane Doe'"],
	},
	logout: {
		name: "logout",
		description: "Log out and clear stored session token",
		category: "keys",
		flags: [],
		examples: ["qcut-pipeline logout"],
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
	keys: {
		name: "keys",
		description: "Show configured and missing API keys",
		category: "keys",
		flags: [
			f("--configured", "boolean", "Show only configured keys", {
				default: false,
			}),
			f("--missing", "boolean", "Show only missing keys", { default: false }),
			f(
				"--category",
				"string",
				"Filter by capability: auth, image, video, audio, llm, search, avatar"
			),
		],
		examples: [
			"qcut system keys",
			"qcut system keys --json",
			"qcut system keys --missing --json",
			"qcut system keys --category image",
		],
	},
	"check-keys": {
		name: "check-keys",
		description: "Check configured API keys",
		category: "keys",
		flags: [
			f("--configured", "boolean", "Show only configured keys", {
				default: false,
			}),
			f("--missing", "boolean", "Show only missing keys", { default: false }),
			f(
				"--category",
				"string",
				"Filter by capability: auth, image, video, audio, llm, search, avatar"
			),
		],
		examples: ["qcut-pipeline check-keys --json"],
	},
	"system-doctor": {
		name: "system-doctor",
		description:
			"Report environment health (bun/ffmpeg/.env/keys) as JSON. Used by the Daytona/E2B spawn probe.",
		category: "keys",
		flags: [],
		examples: ["qcut system doctor --json --skip-health", "qcut system doctor"],
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

	// ── Phota ──
	"phota:edit": {
		name: "phota:edit",
		description: "Edit images with AI using Phota (prompt + optional profiles)",
		category: "phota",
		flags: [
			f("--text", "string", "Edit prompt", { short: "-t", required: true }),
			f("--input", "string", "Image file path or URL (repeatable, max 10)", {
				short: "-i",
				required: true,
			}),
			f("--profile", "string", "Phota profile ID (repeatable)"),
			f("--resolution", "string", "Output resolution: 1K or 4K", {
				default: "1K",
				enum: ["1K", "4K"],
			}),
			f("--aspect-ratio", "string", "Aspect ratio", {
				default: "auto",
				enum: ["auto", "1:1", "16:9", "4:3", "3:4", "9:16"],
			}),
			f("--count", "number", "Number of outputs (1-4)", { default: 1 }),
			f("--format", "string", "Output format", {
				default: "jpeg",
				enum: ["jpeg", "png", "webp"],
			}),
		],
		examples: [
			'qcut-pipeline phota:edit -i photo.jpg -t "Make the background a sunset"',
			'qcut-pipeline phota:edit -i photo.jpg -t "@Profile1 in a forest" --profile prof_abc123',
			'qcut-pipeline phota:edit -i photo.jpg -t "Enhance lighting" --resolution 4K --json',
		],
	},
	"phota:enhance": {
		name: "phota:enhance",
		description: "Enhance image quality with Phota AI",
		category: "phota",
		flags: [
			f("--input", "string", "Image file path or URL", {
				short: "-i",
				required: true,
			}),
			f("--profile", "string", "Phota profile ID (repeatable)"),
			f("--count", "number", "Number of outputs", { default: 1 }),
			f("--format", "string", "Output format", {
				default: "jpeg",
				enum: ["jpeg", "png", "webp"],
			}),
		],
		examples: [
			"qcut-pipeline phota:enhance -i photo.jpg",
			"qcut-pipeline phota:enhance -i photo.jpg --profile prof_abc123 --json",
		],
	},
	"phota:profile": {
		name: "phota:profile",
		description:
			"Create a Phota identity profile from reference images (ZIP archive)",
		category: "phota",
		flags: [
			f("--input", "string", "Path to ZIP archive of reference images", {
				short: "-i",
				required: true,
			}),
		],
		examples: [
			"qcut-pipeline phota:profile -i reference-photos.zip",
			"qcut-pipeline phota:profile -i reference-photos.zip --json",
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
			f(
				"--novel",
				"string",
				"Novel file path (default: bundled drama example)"
			),
			f("--title", "string", "Project title"),
			f("--max-scenes", "number", "Max scenes"),
			f("--scripts-only", "boolean", "Generate scripts only", {
				default: false,
			}),
			f("--storyboard-only", "boolean", "Stop after storyboard images", {
				default: false,
			}),
			f(
				"--max-images",
				"number",
				"Max storyboard images to generate (implies no video)"
			),
			f("--max-clips", "number", "Max shot videos to generate across chunks"),
			f("--no-portraits", "boolean", "Skip portrait generation", {
				default: false,
			}),
			f("--llm-model", "string", "LLM model"),
			f("--image-model", "string", "Image generation model"),
			f("--video-model", "string", "Video generation model"),
			f(
				"--video-concurrency",
				"number",
				"Parallel video clips in flight (default 1, max 6)"
			),
			f(
				"--video-reference-mode",
				"string",
				"Video inputs: storyboard, references, or storyboard+references"
			),
			f(
				"--video-reference-images",
				"string[]",
				"Extra video reference images (repeatable)"
			),
		],
		examples: [
			"qcut-pipeline vimax:novel2movie --novel story.txt --max-scenes 10",
			"qcut-pipeline vimax:novel2movie --scripts-only",
			"qcut-pipeline vimax:novel2movie --max-images 5",
			"qcut-pipeline vimax:novel2movie --max-scenes 20 --max-clips 5",
			"qcut-pipeline vimax:novel2movie --max-clips 2 --video-concurrency 2",
		],
	},
	"vimax:novel2script": {
		name: "vimax:novel2script",
		description:
			"Segment a novel into shot-level Script JSON chunks (stage 3 of the decomposed novel2movie workflow)",
		category: "vimax",
		flags: [
			f("--novel", "string", "Novel file path (markdown or plain text)", {
				required: true,
			}),
			f("--project", "string", "Project slug under ~/Documents/QCut/projects/"),
			f("--title", "string", "Project title (defaults to filename)"),
			f("--max-scenes", "number", "Cap total scenes across chunks"),
			f("--chunk-size", "number", "Chunk size in characters (default 2000)"),
			f("--overlap", "number", "Chunk overlap in characters (default 200)"),
			f("--llm-model", "string", "LLM model used for segmentation"),
		],
		examples: [
			"qcut flow novel2script --novel story.md --project my-story",
			"qcut flow novel2script --novel story.md --project my-story --max-scenes 20",
		],
	},
	"vimax:novel2video": {
		name: "vimax:novel2video",
		description:
			"Generate per-shot videos using Seedance 2.0 ref2v from a project's scripts + portraits (stage 4)",
		category: "vimax",
		flags: [
			f(
				"--project",
				"string",
				"Project slug under ~/Documents/QCut/projects/",
				{
					required: true,
				}
			),
			f("--max-shots", "number", "Cap total shots generated this run"),
			f("--duration", "number", "Seconds per shot (clamped 4-15)", {
				short: "-d",
			}),
			f("--resolution", "string", "Seedance resolution (480p|720p|1080p)"),
			f("--aspect-ratio", "string", "Seedance ratio (16:9|9:16|1:1|...)"),
			f("--concurrency", "number", "Parallel shots in flight (default 1)"),
			f(
				"--force",
				"boolean",
				"Overwrite existing shot MP4s + bypass cost gate"
			),
			f("--cost-gate", "number", "Projected-cost ceiling in USD (default 2)"),
			f("--model", "string", "Video model family", {
				short: "-m",
				default: "gmi_seedance_2_0_260128",
				enum: [
					"gmi_seedance_2_0_260128",
					"seedance_2_0",
					"vidu_q3_ref2v_mix",
					"gmi_kling_v3_omni",
				],
			}),
			f(
				"--style-anchor",
				"string",
				"Catalogued character name to use as a style-ref fallback for shots with no catalogued characters. The anchor character may appear in those shots (refs are identity-driven); pick your protagonist."
			),
			f(
				"--style-prompt",
				"string",
				"Style keywords prepended to every shot prompt (e.g. 'Modern anime film, soft cel-shading'). Overrides project.json style for this run."
			),
		],
		examples: [
			"qcut flow novel2video --project my-story",
			"qcut flow novel2video --project my-story --max-shots 5 --duration 5",
			"qcut flow novel2video --project my-story --force --cost-gate 20",
			"qcut flow novel2video --project my-story --model seedance_2_0  # FAL fallback",
			"qcut flow novel2video --project my-story --model vidu_q3_ref2v_mix  # Vidu Q3 mix (multi-ref)",
			"qcut flow novel2video --project my-story --model gmi_kling_v3_omni  # Kling V3 Omni element-driven",
			"qcut flow novel2video --project my-story --style-anchor 沈念安  # keep style consistent across all shots",
			'qcut flow novel2video --project my-story --style-prompt "Modern anime film, soft cel-shading"  # force anime look',
		],
	},
	"vimax:lint-scripts": {
		name: "vimax:lint-scripts",
		description:
			"Report shots whose description mentions catalogued characters not in characters[]",
		category: "vimax",
		flags: [
			f(
				"--project",
				"string",
				"Project slug under ~/Documents/QCut/projects/",
				{
					required: true,
				}
			),
			f(
				"--auto-fix",
				"boolean",
				"Rewrite chunk_*.json in place to append missing names (keeps a .bak.<ts> backup)"
			),
		],
		examples: [
			"qcut flow lint-scripts --project my-story",
			"qcut flow lint-scripts --project my-story --auto-fix",
		],
	},
	"vimax:extract-characters": {
		name: "vimax:extract-characters",
		description: "Extract characters from a novel or raw text",
		category: "vimax",
		flags: [
			f(
				"--novel",
				"string",
				"Novel file path (staged workflow; writes to project dir)"
			),
			f("--text", "string", "Raw text to extract from", { short: "-t" }),
			f("--input", "string", "Text or novel file path"),
			f("--project", "string", "Project slug under ~/Documents/QCut/projects/"),
			f("--title", "string", "Project title"),
			f("--llm-model", "string", "LLM model"),
			f(
				"--style",
				"string",
				"Preset slug (photorealistic|anime|ghibli|3d-animation|chinese-ink|watercolor|cyberpunk|noir) or free-form text; persisted into project.json"
			),
			f(
				"--region",
				"string",
				"Cast region (east-asian|southeast-asian|south-asian|middle-eastern|african|european|latin|mixed); auto-detected from novel if omitted. Fills empty per-character ethnicity."
			),
			f(
				"--cast-quality",
				"string",
				"Attractiveness preset (natural|photogenic|model-grade); default natural. Prepends a gender-aware snippet to every portrait prompt."
			),
		],
		examples: [
			"qcut flow characters --novel story.md --project my-story",
			"qcut flow characters --novel story.md --project my-story --cast-quality photogenic",
			"qcut flow characters --novel story.md --project my-story --region east-asian --cast-quality model-grade",
		],
	},
	"vimax:extract-scenes": {
		name: "vimax:extract-scenes",
		description: "Extract scenes from a novel or raw text",
		category: "vimax",
		flags: [
			f("--novel", "string", "Novel file path (markdown or plain text)"),
			f("--text", "string", "Raw text to extract from", { short: "-t" }),
			f("--input", "string", "Text or novel file path"),
			f("--project", "string", "Project slug under ~/Documents/QCut/projects/"),
			f("--title", "string", "Project title"),
			f("--max-scenes", "number", "Max scenes to keep"),
			f("--llm-model", "string", "LLM model"),
		],
		examples: [
			"qcut flow scenes --novel story.md -o /tmp/qcut-output --json",
			"qcut flow scene --novel story.md --llm-model gemini-3.1-flash-lite --json",
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
		description: "Generate storyboard from flow scenes or script",
		category: "vimax",
		flags: [
			f("--scenes", "string", "flow scenes JSON path"),
			f("--script", "string", "Script JSON path"),
			f("--input", "string", "Scenes or script JSON path"),
			f("--project", "string", "Project slug; reads scenes.json by default"),
			f("--portraits", "string", "Portrait registry JSON path"),
			f("--image-model", "string", "Image generation model"),
			f(
				"--style",
				"string",
				"Preset slug or free-form style text for storyboard prompts"
			),
			f("--reference-model", "string", "Reference image model"),
			f("--reference-strength", "number", "Reference strength (0-1)"),
			f("--concurrency", "number", "Parallel images in flight (max 6)"),
		],
		examples: [
			"qcut flow storyboard --scenes /tmp/qcut-output/scenes.json -o /tmp/qcut-output/storyboard",
			"qcut flow storyboard --project my-story --image-model gpt_image_2_ima",
			"qcut-pipeline vimax:generate-storyboard --script screenplay.json",
		],
	},
	"vimax:generate-portraits": {
		name: "vimax:generate-portraits",
		description: "Generate character portraits",
		category: "vimax",
		flags: [
			f("--project", "string", "Project slug under ~/Documents/QCut/projects/"),
			f("--portraits", "string", "Character JSON path", { short: "-p" }),
			f("--text", "string", "Raw text (re-extracts characters first)"),
			f("--input", "string", "Character JSON path or raw text"),
			f("--max-characters", "number", "Max characters to generate"),
			f("--image-model", "string", "Image generation model"),
			f(
				"--style",
				"string",
				"Preset slug (photorealistic|anime|ghibli|3d-animation|chinese-ink|watercolor|cyberpunk|noir) or free-form text"
			),
			f("--reference-model", "string", "Reference model"),
			f("--reference-strength", "number", "Reference strength (0-1)"),
			f("--views", "string", "Portrait views to generate"),
			f("--concurrency", "number", "Parallel characters in flight (default 3)"),
			f("--save-registry", "boolean", "Save portrait registry", {
				default: true,
			}),
			f(
				"--region",
				"string",
				"Override region — persisted to project.json so later stages see it"
			),
			f(
				"--cast-quality",
				"string",
				"Override cast quality (natural|photogenic|model-grade); rewrites each portrait prompt's prefix"
			),
		],
		examples: [
			"qcut flow portraits --project my-story",
			"qcut flow portraits --project my-story --cast-quality photogenic",
			"qcut flow portraits -p characters.json",
		],
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
	// ── Replicate ──
	replicate: {
		name: "replicate",
		description: "Replicate a video (analyze + generate + assemble)",
		category: "replicate",
		flags: [
			f("--source", "string", "Source video file path", { required: true }),
			f("--directory", "string", "User media directory (optional)"),
			f("--video-model", "string", "Video generation model key"),
			f("--image-model", "string", "Image generation model key"),
			f("--llm-model", "string", "LLM model for analysis"),
			f("--max-workers", "number", "Max concurrent generation jobs"),
		],
		examples: [
			"qcut-pipeline replicate --source input.mp4",
			"qcut-pipeline replicate --source input.mp4 --video-model ltx_v2_3",
		],
	},
	"replicate:analyze": {
		name: "replicate:analyze",
		description: "Analyze a video and extract a VideoRecipe",
		category: "replicate",
		flags: [
			f("--source", "string", "Source video file path", { required: true }),
			f("--llm-model", "string", "Gemini model for analysis"),
		],
		examples: [
			"qcut-pipeline replicate:analyze --source input.mp4 --json",
			"qcut-pipeline replicate:analyze --source input.mp4 -o recipe/",
		],
	},
	"replicate:generate": {
		name: "replicate:generate",
		description: "Generate video from a VideoRecipe JSON file",
		category: "replicate",
		flags: [
			f("--input", "string", "Path to recipe JSON file", {
				required: true,
			}),
			f("--directory", "string", "User media directory (optional)"),
			f("--video-model", "string", "Video generation model key"),
			f("--image-model", "string", "Image generation model key"),
			f("--max-workers", "number", "Max concurrent generation jobs"),
		],
		examples: [
			"qcut-pipeline replicate:generate --input recipe.json",
			"qcut-pipeline replicate:generate --input recipe.json --directory ./my-clips/",
		],
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
