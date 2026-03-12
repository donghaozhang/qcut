/**
 * Editor Command Registry — definitions for all `editor:*` commands.
 *
 * Split from command-registry.ts to stay within the 800-line limit.
 * Imported and merged into the main COMMANDS_REGISTRY.
 *
 * @module electron/native-pipeline/cli/command-registry-editor
 */

import type { FlagDef, CommandDef } from "./command-registry-types.js";

/** Shorthand flag builder. */
function f(
	name: string,
	type: FlagDef["type"],
	desc: string,
	opts?: Partial<FlagDef>
): FlagDef {
	return { name, type, description: desc, ...opts };
}

// ─── Shared Flags ────────────────────────────────────────────────────

const PID = f("--project-id", "string", "Project ID", { required: true });
const MID = f("--media-id", "string", "Media ID", { required: true });
const EID = f("--element-id", "string", "Element ID", { required: true });
const JID = f("--job-id", "string", "Job ID", { required: true });
const DATA = f("--data", "string", "JSON input (@file/inline/-)");
const DATA_REQ = f("--data", "string", "JSON input (@file/inline/-)", {
	required: true,
});
const POLL = f("--poll", "boolean", "Auto-poll async jobs", { default: false });

/** Helper to build an editor command def. */
function ed(
	name: string,
	description: string,
	flags: FlagDef[],
	examples?: string[]
): CommandDef {
	const hasProjectId = flags.some((fl) => fl.name === "--project-id");
	const defaultExample = hasProjectId
		? `qcut-pipeline ${name} --project-id <id> --json`
		: `qcut-pipeline ${name} --json`;
	return {
		name,
		description,
		category: "editor",
		flags,
		examples: examples ?? [defaultExample],
	};
}

// ─── Editor Commands ─────────────────────────────────────────────────

export const EDITOR_COMMANDS: Record<string, CommandDef> = {
	// ── Auth ──
	"editor:auth:token": ed(
		"editor:auth:token",
		"Auth: Get or set the current auth token",
		[
			f("--set", "string", "Set token to this value"),
			f("--reveal", "boolean", "Show full token (default: masked)", {
				default: false,
			}),
		],
		[
			"qcut-pipeline editor:auth:token --json",
			"qcut-pipeline editor:auth:token --reveal --json",
			"qcut-pipeline editor:auth:token --set <token> --json",
		]
	),
	"editor:auth:activate": ed(
		"editor:auth:activate",
		"Auth: Set token and activate license on this device",
		[f("--token", "string", "Auth token", { required: true })],
		["qcut-pipeline editor:auth:activate --token <token> --json"]
	),
	"editor:auth:logout": ed(
		"editor:auth:logout",
		"Auth: Clear the current auth token",
		[],
		["qcut-pipeline editor:auth:logout --json"]
	),

	// ── Health ──
	"editor:health": ed("editor:health", "Check editor connectivity", [
		f("--status-only", "boolean", "Return compact status output", {
			default: false,
		}),
		f("--deep", "boolean", "Run deep cross-process health probes", {
			default: false,
		}),
	]),

	// ── Media ──
	"editor:media:list": ed("editor:media:list", "List media files", [PID]),
	"editor:media:info": ed("editor:media:info", "Get media info", [PID, MID]),
	"editor:media:import": ed("editor:media:import", "Import local file", [
		PID,
		f("--source", "string", "File path to import", { required: true }),
		f("--add-to-timeline", "boolean", "Add to timeline after import", {
			default: false,
		}),
	]),
	"editor:media:import-url": ed("editor:media:import-url", "Import from URL", [
		PID,
		f("--url", "string", "URL to import", { required: true }),
		f("--filename", "string", "Override filename"),
	]),
	"editor:media:batch-import": ed(
		"editor:media:batch-import",
		"Batch import (max 20)",
		[
			PID,
			f("--items", "string", "JSON array of items"),
			f("--sources", "string", "Comma-separated file paths"),
		]
	),
	"editor:media:extract-frame": ed(
		"editor:media:extract-frame",
		"Extract video frame",
		[
			PID,
			MID,
			f("--start-time", "number", "Timestamp in seconds", { required: true }),
			f("--output-format", "string", "Output format"),
		]
	),
	"editor:media:rename": ed("editor:media:rename", "Rename media", [
		PID,
		MID,
		f("--new-name", "string", "New name", { required: true }),
	]),
	"editor:media:delete": ed("editor:media:delete", "Delete media", [PID, MID]),

	// ── Project ──
	"editor:project:settings": ed(
		"editor:project:settings",
		"Get project settings",
		[PID]
	),
	"editor:project:update-settings": ed(
		"editor:project:update-settings",
		"Update project settings",
		[PID, DATA_REQ]
	),
	"editor:project:stats": ed("editor:project:stats", "Get project statistics", [
		PID,
	]),
	"editor:project:summary": ed(
		"editor:project:summary",
		"Get project summary (markdown)",
		[PID]
	),
	"editor:project:report": ed(
		"editor:project:report",
		"Generate pipeline report",
		[PID]
	),
	"editor:project:create": ed("editor:project:create", "Create project", [
		f("--new-name", "string", "Project name", { required: true }),
	]),
	"editor:project:delete": ed("editor:project:delete", "Delete project", [PID]),
	"editor:project:rename": ed("editor:project:rename", "Rename project", [
		PID,
		f("--new-name", "string", "New name", { required: true }),
	]),
	"editor:project:duplicate": ed(
		"editor:project:duplicate",
		"Duplicate project",
		[PID]
	),
	"editor:project:list": ed("editor:project:list", "List all projects", []),
	"editor:project:info": ed("editor:project:info", "Get project info as JSON", [
		PID,
		f(
			"--full",
			"boolean",
			"Include all arrays (media, subtitles, generated, exports, jobs)",
			{ default: false }
		),
	]),
	"editor:project:export-state": ed(
		"editor:project:export-state",
		"Dump full project.json to disk",
		[
			PID,
			f(
				"--output",
				"string",
				"Output file path (default: ./output/project-<id>.json)"
			),
		]
	),
	"editor:project:import-state": ed(
		"editor:project:import-state",
		"Load project.json into editor (not yet implemented)",
		[PID, DATA_REQ]
	),

	// ── Timeline ──
	"editor:timeline:export": ed("editor:timeline:export", "Export timeline", [
		PID,
		f("--output-format", "string", "Output format", { short: "-f" }),
		f("--mode", "string", "Export mode"),
	]),
	"editor:timeline:import": ed(
		"editor:timeline:import",
		"Import timeline data",
		[
			PID,
			DATA_REQ,
			f("--replace", "boolean", "Replace existing timeline", {
				default: false,
			}),
			f("--output-format", "string", "Output format"),
		]
	),
	"editor:timeline:add-element": ed(
		"editor:timeline:add-element",
		"Add element to timeline",
		[PID, DATA_REQ]
	),
	"editor:timeline:batch-add": ed(
		"editor:timeline:batch-add",
		"Batch add elements (max 50)",
		[
			PID,
			f("--elements", "string", "JSON array of elements", { required: true }),
		]
	),
	"editor:timeline:update-element": ed(
		"editor:timeline:update-element",
		"Update timeline element",
		[PID, EID, DATA_REQ]
	),
	"editor:timeline:batch-update": ed(
		"editor:timeline:batch-update",
		"Batch update elements",
		[PID, f("--updates", "string", "JSON array of updates", { required: true })]
	),
	"editor:timeline:delete-element": ed(
		"editor:timeline:delete-element",
		"Delete timeline element",
		[PID, EID]
	),
	"editor:timeline:batch-delete": ed(
		"editor:timeline:batch-delete",
		"Batch delete elements",
		[
			PID,
			f("--cuts", "string", "JSON array of element IDs", { required: true }),
		]
	),
	"editor:timeline:split": ed(
		"editor:timeline:split",
		"Split element at time",
		[
			PID,
			EID,
			f("--split-time", "number", "Split point in seconds", { required: true }),
		]
	),
	"editor:timeline:move": ed("editor:timeline:move", "Move element", [
		PID,
		EID,
		f("--time", "number", "Target time in seconds", { required: true }),
		f("--to-track", "string", "Target track"),
		f("--ripple", "boolean", "Ripple edit", { default: false }),
		f("--cross-track-ripple", "boolean", "Cross-track ripple", {
			default: false,
		}),
	]),
	"editor:timeline:arrange": ed("editor:timeline:arrange", "Arrange elements", [
		PID,
		f("--mode", "string", "Arrange mode", { required: true }),
	]),
	"editor:timeline:select": ed("editor:timeline:select", "Select element", [
		PID,
		EID,
	]),
	"editor:timeline:get-selection": ed(
		"editor:timeline:get-selection",
		"Get current selection",
		[PID]
	),
	"editor:timeline:clear-selection": ed(
		"editor:timeline:clear-selection",
		"Clear selection",
		[PID]
	),
	"editor:timeline:play": ed("editor:timeline:play", "Play timeline", [PID]),
	"editor:timeline:pause": ed("editor:timeline:pause", "Pause timeline", [PID]),
	"editor:timeline:toggle-play": ed(
		"editor:timeline:toggle-play",
		"Toggle play/pause",
		[PID]
	),
	"editor:timeline:seek": ed("editor:timeline:seek", "Seek to time", [
		PID,
		f("--time", "number", "Seek time in seconds", { required: true }),
	]),
	"editor:timeline:info": ed("editor:timeline:info", "Get timeline state", [
		PID,
	]),
	"editor:timeline:add-clip": ed(
		"editor:timeline:add-clip",
		"Add media clip to timeline",
		[PID, MID]
	),
	"editor:timeline:trim": ed("editor:timeline:trim", "Trim element", [
		PID,
		EID,
		f("--start-time", "number", "Start time in seconds", { required: true }),
		f("--end-time", "number", "End time in seconds", { required: true }),
	]),

	// ── Editing ──
	"editor:editing:batch-cuts": ed(
		"editor:editing:batch-cuts",
		"Batch cut operations",
		[PID, f("--cuts", "string", "JSON array of cuts", { required: true })]
	),
	"editor:editing:delete-range": ed(
		"editor:editing:delete-range",
		"Delete time range",
		[
			PID,
			f("--start-time", "number", "Start time in seconds", { required: true }),
			f("--end-time", "number", "End time in seconds", { required: true }),
		]
	),
	"editor:editing:auto-edit": ed(
		"editor:editing:auto-edit",
		"Auto-edit (fillers/silences)",
		[
			PID,
			f("--remove-fillers", "boolean", "Remove filler words", {
				default: false,
			}),
			f("--remove-silences", "boolean", "Remove silences", { default: false }),
			f("--threshold", "number", "Detection threshold"),
			f("--debug-trace", "boolean", "Show detailed failure trace context", {
				default: false,
			}),
			POLL,
		]
	),
	"editor:editing:auto-edit-status": ed(
		"editor:editing:auto-edit-status",
		"Check auto-edit job status",
		[PID, JID]
	),
	"editor:editing:auto-edit-list": ed(
		"editor:editing:auto-edit-list",
		"List auto-edit jobs",
		[PID]
	),
	"editor:editing:suggest-cuts": ed(
		"editor:editing:suggest-cuts",
		"AI-suggest cuts",
		[
			PID,
			f("--threshold", "number", "Confidence threshold"),
			f("--prompt", "string", "Custom prompt"),
			POLL,
		]
	),
	"editor:editing:suggest-status": ed(
		"editor:editing:suggest-status",
		"Check suggest-cuts status",
		[PID, JID]
	),

	// ── Analysis ──
	"editor:analyze:video": ed(
		"editor:analyze:video",
		"Analyze video with AI vision",
		[
			PID,
			f("--source", "string", "Video source", { required: true }),
			f("--analysis-type", "string", "Analysis type"),
			f("--model", "string", "Model key", { short: "-m" }),
			f("--output-format", "string", "Output format"),
		]
	),
	"editor:analyze:models": ed(
		"editor:analyze:models",
		"List analysis models",
		[]
	),
	"editor:analyze:scenes": ed("editor:analyze:scenes", "Detect scene changes", [
		PID,
		MID,
		f("--threshold", "number", "Detection threshold"),
		f("--model", "string", "Model key", { short: "-m" }),
	]),
	"editor:analyze:frames": ed("editor:analyze:frames", "Analyze video frames", [
		PID,
		MID,
		f("--timestamps", "string", "Comma-separated timestamps"),
		f("--gap", "number", "Gap between frames (seconds)"),
		f("--prompt", "string", "Analysis prompt"),
	]),
	"editor:analyze:fillers": ed(
		"editor:analyze:fillers",
		"Detect filler words/silences",
		[PID, f("--media-id", "string", "Media ID"), DATA]
	),

	// ── Transcription ──
	"editor:transcribe:run": ed(
		"editor:transcribe:run",
		"Transcribe media (sync)",
		[
			PID,
			f("--media-id", "string", "Media ID"),
			f("--source", "string", "Source (path:/file.mp4 or media:id)"),
			f("--model", "string", "Model key", { short: "-m" }),
			f("--language", "string", "Language code"),
		]
	),
	"editor:transcribe:start": ed(
		"editor:transcribe:start",
		"Transcribe media (async)",
		[
			PID,
			f("--media-id", "string", "Media ID"),
			f("--source", "string", "Source (path:/file.mp4 or media:id)"),
			f("--model", "string", "Model key", { short: "-m" }),
			POLL,
		]
	),
	"editor:transcribe:status": ed(
		"editor:transcribe:status",
		"Get transcription job status",
		[PID, JID]
	),
	"editor:transcribe:list-jobs": ed(
		"editor:transcribe:list-jobs",
		"List transcription jobs",
		[PID]
	),
	"editor:transcribe:cancel": ed(
		"editor:transcribe:cancel",
		"Cancel transcription job",
		[PID, JID]
	),

	// ── Generation ──
	"editor:generate:start": ed("editor:generate:start", "Start AI generation", [
		PID,
		DATA,
		POLL,
		f("--poll-interval", "number", "Poll interval in seconds"),
	]),
	"editor:generate:status": ed(
		"editor:generate:status",
		"Get generation job status",
		[PID, JID]
	),
	"editor:generate:list-jobs": ed(
		"editor:generate:list-jobs",
		"List generation jobs",
		[PID]
	),
	"editor:generate:cancel": ed(
		"editor:generate:cancel",
		"Cancel generation job",
		[PID, JID]
	),
	"editor:generate:models": ed(
		"editor:generate:models",
		"List generation models",
		[]
	),
	"editor:generate:estimate-cost": ed(
		"editor:generate:estimate-cost",
		"Estimate generation cost",
		[
			f("--model", "string", "Model key", { short: "-m" }),
			f("--text", "string", "Text prompt", { short: "-t" }),
		]
	),

	// ── Export ──
	"editor:export:presets": ed("editor:export:presets", "List export presets", [
		PID,
	]),
	"editor:export:recommend": ed(
		"editor:export:recommend",
		"Recommend export settings",
		[PID, f("--target", "string", "Target platform")]
	),
	"editor:export:start": ed("editor:export:start", "Start export", [
		PID,
		f("--preset", "string", "Export preset name"),
		POLL,
		f("--filename", "string", "Output filename"),
		f("--export-format", "string", "Export format"),
		f("--format", "string", "Export format (alias)"),
	]),
	"editor:export:status": ed("editor:export:status", "Get export job status", [
		PID,
		JID,
	]),
	"editor:export:list-jobs": ed("editor:export:list-jobs", "List export jobs", [
		PID,
	]),

	// ── Diagnostics & MCP ──
	"editor:diagnostics:analyze": ed(
		"editor:diagnostics:analyze",
		"Analyze error",
		[
			PID,
			f("--message", "string", "Error message", { required: true }),
			f("--stack", "string", "Stack trace"),
		]
	),
	"editor:mcp:forward-html": ed(
		"editor:mcp:forward-html",
		"Forward HTML to MCP preview",
		[f("--html", "string", "HTML content", { required: true })]
	),

	// ── Navigator ──
	"editor:navigator:projects": ed(
		"editor:navigator:projects",
		"List saved projects",
		[]
	),
	"editor:navigator:open": ed(
		"editor:navigator:open",
		"Open a project in editor",
		[PID]
	),

	// ── Screen Recording ──
	"editor:screen-recording:sources": ed(
		"editor:screen-recording:sources",
		"List capture sources",
		[]
	),
	"editor:screen-recording:start": ed(
		"editor:screen-recording:start",
		"Start screen recording",
		[
			f("--source-id", "string", "Capture source ID"),
			f("--filename", "string", "Output filename"),
			f("--force", "boolean", "Force-stop existing recording first", {
				default: false,
			}),
		]
	),
	"editor:screen-recording:stop": ed(
		"editor:screen-recording:stop",
		"Stop screen recording",
		[f("--discard", "boolean", "Discard recording", { default: false })]
	),
	"editor:screen-recording:force-stop": ed(
		"editor:screen-recording:force-stop",
		"Force-stop active recording",
		[]
	),
	"editor:screen-recording:status": ed(
		"editor:screen-recording:status",
		"Get recording status",
		[]
	),

	// ── Remotion ──
	"editor:remotion:list": ed(
		"editor:remotion:list",
		"List Remotion elements on timeline",
		[PID]
	),
	"editor:remotion:inspect": ed(
		"editor:remotion:inspect",
		"Inspect a Remotion element",
		[PID, EID]
	),
	"editor:remotion:update-props": ed(
		"editor:remotion:update-props",
		"Update Remotion element props",
		[PID, EID, DATA_REQ]
	),
	"editor:remotion:export": ed(
		"editor:remotion:export",
		"Export with Remotion engine",
		[
			PID,
			f("--preset", "string", "Export preset"),
			f("--filename", "string", "Output filename"),
		]
	),

	// ── UI ──
	"editor:ui:switch-panel": ed(
		"editor:ui:switch-panel",
		"Switch editor panel",
		[
			f("--panel", "string", "Panel name", {
				required: true,
				enum: [
					"media",
					"text",
					"stickers",
					"video-edit",
					"effects",
					"transitions",
					"filters",
					"text2image",
					"nano-edit",
					"ai",
					"sounds",
					"segmentation",
					"remotion",
					"pty",
					"word-timeline",
					"project-folder",
					"upscale",
					"moyin",
					"properties",
					"export",
					"api-keys",
				],
			}),
			f("--tab", "string", "Inner tab (for moyin panel)", {
				enum: ["overview", "characters", "scenes", "shots", "generate"],
			}),
		]
	),

	"editor:ui:context-menu": ed(
		"editor:ui:context-menu",
		"Dispatch a right-click context menu on a timeline element (debug)",
		[
			f("--element-id", "string", "Timeline element ID", { required: true }),
			f("--verbose", "boolean", "Capture all pointer/mouse events for debugging"),
		],
		["qcut-pipeline editor:ui:context-menu --element-id <id> --debug"]
	),

	// ── Novel Parse ──
	"editor:novel:parse": ed(
		"editor:novel:parse",
		"Parse novel text into structured screenplay",
		[
			f("--input", "string", "Path to novel text file", { required: true }),
			f("--output", "string", "Output JSON path (default: stdout)"),
			f("--language", "string", "Language hint (zh/en/auto)", {
				default: "auto",
				enum: ["zh", "en", "auto"],
			}),
			f("--max-clips", "number", "Maximum clips to generate"),
			f("--json", "boolean", "JSON output format"),
		],
		[
			"qcut-pipeline editor:novel:parse --input novel.txt --output screenplay.json --language zh",
			"qcut-pipeline editor:novel:parse --input story.txt --json",
		]
	),

	// ── Moyin (editor) ──
	"editor:moyin:set-script": ed(
		"editor:moyin:set-script",
		"Push script text to director panel",
		[
			f("--text", "string", "Inline script text", { short: "-t" }),
			f("--script", "string", "Script file path"),
		]
	),
	"editor:moyin:parse": ed(
		"editor:moyin:parse",
		"Trigger Parse Script button",
		[]
	),
	"editor:moyin:status": ed("editor:moyin:status", "Get pipeline progress", []),
	"editor:moyin:export": ed(
		"editor:moyin:export",
		"Export Script Director data as JSON",
		[
			f(
				"--output",
				"string",
				"Output file path (default: ~/Documents/QCut/exports/)"
			),
		],
		[
			"qcut-pipeline editor:moyin:export --json",
			"qcut-pipeline editor:moyin:export -o screenplay.json",
		]
	),
	"editor:moyin:generate": ed(
		"editor:moyin:generate",
		"Generate a script from a description/idea",
		[
			f("--idea", "string", "Description or idea for the script", {
				short: "-i",
			}),
			f("--genre", "string", "Genre hint (e.g. drama, comedy)"),
			f("--target-duration", "string", "Target duration (e.g. 30s, 1m)"),
		]
	),

	// ── Sticker ──
	"editor:sticker:add": ed(
		"editor:sticker:add",
		"Add a sticker to the timeline at a specific position and time",
		[
			PID,
			f("--sticker-id", "string", "Sticker ID from catalog"),
			f("--source", "string", "Path to custom image file (PNG/JPG/WebP)"),
			f("--x", "number", "X position in pixels", { default: 0 }),
			f("--y", "number", "Y position in pixels", { default: 0 }),
			f("--start-time", "number", "Start time in seconds", { default: 0 }),
			f("--end-time", "number", "End time in seconds", { required: true }),
			f("--width", "number", "Width in pixels"),
			f("--height", "number", "Height in pixels"),
			f("--rotation", "number", "Rotation in degrees", { default: 0 }),
			f("--opacity", "number", "Opacity (0-1)", { default: 1 }),
		],
		[
			"qcut-pipeline editor:sticker:add --project-id <id> --sticker-id stk_emoji_fire --x 860 --y 440 --start-time 2 --end-time 5 --width 200 --json",
			"qcut-pipeline editor:sticker:add --project-id <id> --source /tmp/logo.png --x 50 --y 50 --start-time 0 --end-time 10 --width 100 --json",
		]
	),
	"editor:sticker:update": ed(
		"editor:sticker:update",
		"Update position, size, time, or image of an existing sticker element",
		[
			PID,
			EID,
			f(
				"--source",
				"string",
				"Replace sticker image with new file (PNG/JPG/WebP)"
			),
			f("--sticker-id", "string", "New sticker ID (used with --source)"),
			f("--x", "number", "X position in pixels"),
			f("--y", "number", "Y position in pixels"),
			f("--start-time", "number", "Start time in seconds"),
			f("--end-time", "number", "End time in seconds"),
			f("--width", "number", "Width in pixels"),
			f("--height", "number", "Height in pixels"),
			f("--rotation", "number", "Rotation in degrees"),
			f("--opacity", "number", "Opacity (0-1)"),
		]
	),
	"editor:sticker:remove": ed(
		"editor:sticker:remove",
		"Remove a sticker from the timeline",
		[PID, EID]
	),
	"editor:sticker:list": ed(
		"editor:sticker:list",
		"List all stickers on the timeline",
		[PID],
		["qcut-pipeline editor:sticker:list --project-id <id> --json"]
	),

	// ── Search ──
	"editor:search:query": ed(
		"editor:search:query",
		"Search transcriptions by text",
		[
			PID,
			f("--query", "string", "Search query string", { required: true }),
			f("--case-sensitive", "boolean", "Case-sensitive matching", {
				default: false,
			}),
			f("--whole-word", "boolean", "Match whole words only", {
				default: false,
			}),
			f("--max-results", "number", "Maximum number of results"),
			f("--media-id", "string", "Scope search to a single media item"),
		],
		[
			'qcut-pipeline editor:search:query --project-id <id> --query "hello world" --json',
		]
	),
	"editor:search:status": ed(
		"editor:search:status",
		"List transcription status for all media in a project",
		[PID],
		["qcut-pipeline editor:search:status --project-id <id> --json"]
	),
	"editor:search:index": ed(
		"editor:search:index",
		"Trigger transcription for untranscribed media",
		[PID, f("--media-id", "string", "Scope to a single media item")],
		["qcut-pipeline editor:search:index --project-id <id> --json"]
	),

	// ── State Control ──
	"editor:undo": ed("editor:undo", "Undo last action", []),
	"editor:redo": ed("editor:redo", "Redo last undone action", []),
	"editor:state:snapshot": ed(
		"editor:state:snapshot",
		"Get editor state snapshot (full or partial)",
		[
			f(
				"--include",
				"string",
				"Comma-separated sections: timeline,selection,playhead,media,editor,project"
			),
		]
	),

	// ── Screenshot ──
	"editor:screenshot:capture": ed(
		"editor:screenshot:capture",
		"Take a screenshot of QCut window",
		[f("--filename", "string", "Output filename")]
	),
};
