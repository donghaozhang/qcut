import {
	COMMANDS_REGISTRY,
	CATEGORIES,
	GLOBAL_FLAGS,
	getCommand,
	getCommandFlag,
} from "./command-registry.js";
import { jsonError, jsonOk } from "./json-output.js";

export const CLI_VERSION = "1.0.0";

/** Handle print help. */
export function printHelp(): void {
	console.log(
		`
qcut-pipeline v${CLI_VERSION} — AI content generation CLI

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
  generate-speech     Generate speech from text (Chatterbox/ElevenLabs/Qwen3)
  convert-speech      Convert speech to a different voice (Chatterbox S2S)
  clone-voice         Clone a voice from reference audio (Qwen3)
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
  editor:analyze:*                  video, models, scenes, frames, fillers, beats
  editor:transcribe:*               run, start, status, list-jobs, cancel
  editor:search:*                  query, status, index
  editor:generate:*                 start, status, list-jobs, cancel, models, estimate-cost
  editor:export:*                   presets, recommend, start, status, list-jobs
  editor:diagnostics:analyze        Analyze error (--message)
  editor:mcp:forward-html           Forward HTML to MCP preview
  editor:navigator:projects/open    List or open projects
  editor:screen-recording:*         sources, start, stop, force-stop, status
  editor:remotion:*                 list, inspect, update-props, export
  editor:ui:switch-panel            Switch editor panel (--panel, --tab)
  editor:snapshot                   Get UI accessibility snapshot (--interactive, --depth)
  editor:snapshot:click             Click a UI ref from the latest snapshot (--ref)
  editor:snapshot:fill              Fill a UI ref from the latest snapshot (--ref, --text)
  editor:snapshot:select            Select a dropdown option by ref (--ref, --value)
  editor:snapshot:check             Toggle a checkbox/switch by ref (--ref, --checked)
  editor:diff:snapshot              Compare two saved snapshot files (--before, --after)
  editor:diff:screenshot            Pixel-diff two screenshot PNGs (--before, --after, --threshold)
  editor:session:*                  save, load, list, delete
  editor:moyin:*                    set-script, parse, status
  editor:screenshot:capture         Take screenshot (--filename)
  editor:undo                       Undo last action
  editor:redo                       Redo last undone action
  editor:state:snapshot             Get editor state snapshot (--include)
  pipeline:status                   Get pipeline job status (--job-id)

  Use <command> --help --json for detailed flag info per command.

Global Options:
  --output-dir, -o    Output directory (default: ~/Documents/QCut/exports)
  --model, -m         Model key (e.g. kling_2_6_pro, flux_dev)
  --policy            Path to JSON action policy file
  --resume            Resume and autosave a named CLI session
  --json              Output results as JSON
  --quiet, -q         Suppress progress output
  --force             Bypass action-policy confirmations when allowed
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
  --resume <name>         Load sticky project/panel/history from a named session
  --state-dir <dir>       Override the state directory used for resumed sessions

Editor Options (see docs for full list):
  --project-id   Project ID    --media-id   Media ID
  --element-id   Element ID    --track-id   Track ID
  --job-id       Job ID        --data       JSON input (@file/inline/-)
  --session-name Saved session name for editor:session:* commands
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

/** Level 1: Root overview — version, categories, command list. */
export function printHelpJson(): void {
	const commands = Object.values(COMMANDS_REGISTRY).map((cmd) => ({
		name: cmd.name,
		description: cmd.description,
		category: cmd.category,
	}));
	jsonOk({
		version: CLI_VERSION,
		description: "AI content generation CLI",
		categories: CATEGORIES,
		commands,
		globalFlags: GLOBAL_FLAGS,
	});
}

/** Level 2: Command detail — flags, examples, usage. */
export function printCommandHelpJson(command: string): void {
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
export function printParamHelpJson(command: string, paramName: string): void {
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
export function findHelpParam(argv: string[]): string | null {
	const helpIdx = argv.indexOf("--help");
	if (helpIdx === -1) return null;
	const next = argv[helpIdx + 1];
	if (next && !next.startsWith("-")) return next;
	return null;
}
