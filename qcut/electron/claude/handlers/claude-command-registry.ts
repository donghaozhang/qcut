import {
	CLAUDE_CAPABILITY_CATEGORIES,
	type ClaudeCapabilityCategory,
	type CommandRegistryEntry,
} from "../../types/claude-api-capabilities.js";

type ParamProperty = {
	type: string | string[];
	description: string;
};

type ParamsSchemaSpec = {
	required?: string[];
	optional?: string[];
};

const PARAM_PROPERTIES: Record<string, ParamProperty> = {
	projectId: {
		type: "string",
		description: "Target project ID (--project-id).",
	},
	mediaId: { type: "string", description: "Target media ID (--media-id)." },
	elementId: {
		type: "string",
		description: "Target timeline element ID (--element-id).",
	},
	trackId: { type: "string", description: "Target track ID (--track-id)." },
	jobId: { type: "string", description: "Async job ID (--job-id)." },
	source: {
		type: "string",
		description: "Local file path or analysis source (--source).",
	},
	url: { type: "string", description: "Remote URL to import (--url)." },
	filename: {
		type: "string",
		description: "Optional output/import filename (--filename).",
	},
	newName: {
		type: "string",
		description: "New project/media name (--new-name).",
	},
	data: {
		type: ["string", "object", "array"],
		description: "JSON payload or @file input (--data).",
	},
	input: {
		type: "string",
		description: "CLI input alias used by some commands (--input).",
	},
	items: {
		type: ["string", "array"],
		description: "Batch import items JSON (--items).",
	},
	elements: {
		type: ["string", "array"],
		description: "Timeline elements or selection items JSON (--elements).",
	},
	updates: {
		type: ["string", "array"],
		description: "Batch update JSON payload (--updates).",
	},
	changes: {
		type: ["string", "object"],
		description: "Element changes JSON (--changes).",
	},
	cuts: {
		type: ["string", "array"],
		description: "Cut intervals JSON (--cuts).",
	},
	timestamp: {
		type: ["number", "string"],
		description: "Timestamp in seconds (--timestamp).",
	},
	timestamps: {
		type: "string",
		description: "Comma-separated frame timestamps (--timestamps).",
	},
	outputFormat: {
		type: "string",
		description: "Requested output format (--output-format).",
	},
	mode: {
		type: "string",
		description: "Command mode (e.g. arrange mode) (--mode).",
	},
	replace: { type: "boolean", description: "Replace on import (--replace)." },
	ripple: {
		type: "boolean",
		description: "Enable ripple behavior (--ripple).",
	},
	crossTrackRipple: {
		type: "boolean",
		description: "Enable cross-track ripple delete (--cross-track-ripple).",
	},
	splitTime: {
		type: "number",
		description: "Split point in seconds (--split-time).",
	},
	toTrack: {
		type: "string",
		description: "Destination track ID (--to-track).",
	},
	startTime: {
		type: "number",
		description: "Start time in seconds (--start-time).",
	},
	endTime: { type: "number", description: "End time in seconds (--end-time)." },
	gap: {
		type: "number",
		description: "Gap or interval value in seconds (--gap).",
	},
	poll: {
		type: "boolean",
		description: "Poll async job to completion (--poll).",
	},
	pollInterval: {
		type: "number",
		description: "Polling interval seconds (--poll-interval).",
	},
	timeout: { type: "number", description: "Timeout in seconds (--timeout)." },
	model: { type: "string", description: "Model key (--model)." },
	prompt: { type: "string", description: "Prompt text (--prompt)." },
	text: { type: "string", description: "Text prompt or content (--text)." },
	analysisType: {
		type: "string",
		description: "Analysis type (--analysis-type).",
	},
	imageUrl: { type: "string", description: "Input image URL (--image-url)." },
	videoUrl: { type: "string", description: "Input video URL (--video-url)." },
	duration: {
		type: ["number", "string"],
		description: "Duration in seconds (--duration).",
	},
	aspectRatio: {
		type: "string",
		description: "Aspect ratio (--aspect-ratio).",
	},
	resolution: {
		type: "string",
		description: "Output resolution (--resolution).",
	},
	negativePrompt: {
		type: "string",
		description: "Negative prompt (--negative-prompt).",
	},
	addToTimeline: {
		type: "boolean",
		description: "Add generated result to timeline (--add-to-timeline).",
	},
	preset: {
		type: "string",
		description: "Export preset identifier (--preset).",
	},
	target: { type: "string", description: "Recommendation target (--target)." },
	message: {
		type: "string",
		description: "Diagnostic message text (--message).",
	},
	html: { type: "string", description: "HTML payload or @file path (--html)." },
	toolName: {
		type: "string",
		description: "MCP preview tool label (--tool-name).",
	},
	sourceId: {
		type: "string",
		description: "Screen capture source ID (--source-id).",
	},
	discard: {
		type: "boolean",
		description: "Discard current recording on stop (--discard).",
	},
	panel: { type: "string", description: "UI panel name (--panel)." },
	tab: { type: "string", description: "Nested panel tab key (--tab)." },
	script: { type: "string", description: "Script file path (--script)." },
	language: { type: "string", description: "Language code (--language)." },
	provider: { type: "string", description: "Provider key (--provider)." },
	threshold: { type: "number", description: "Threshold value (--threshold)." },
	includeFillers: {
		type: "boolean",
		description: "Include filler suggestions (--include-fillers).",
	},
	includeSilences: {
		type: "boolean",
		description: "Include silence suggestions (--include-silences).",
	},
	includeScenes: {
		type: "boolean",
		description: "Include scene suggestions (--include-scenes).",
	},
	removeFillers: {
		type: "boolean",
		description: "Remove filler words (--remove-fillers).",
	},
	removeSilences: {
		type: "boolean",
		description: "Remove silence intervals (--remove-silences).",
	},
	dryRun: {
		type: "boolean",
		description: "Compute edits without applying (--dry-run).",
	},
	loadSpeech: {
		type: "boolean",
		description: "Load transcription into speech panel (--load-speech).",
	},
	outputDir: {
		type: "string",
		description: "Output path/directory (--output-dir).",
	},
	host: { type: "string", description: "QCut API host (--host)." },
	port: { type: ["string", "number"], description: "QCut API port (--port)." },
	token: { type: "string", description: "QCut API bearer token (--token)." },
	json: { type: "boolean", description: "Return JSON output (--json)." },
};

const EDITOR_COMMANDS = [
	"editor:health",
	"editor:media:list",
	"editor:media:info",
	"editor:media:import",
	"editor:media:import-url",
	"editor:media:batch-import",
	"editor:media:extract-frame",
	"editor:media:rename",
	"editor:media:delete",
	"editor:project:settings",
	"editor:project:update-settings",
	"editor:project:stats",
	"editor:project:summary",
	"editor:project:report",
	"editor:timeline:export",
	"editor:timeline:import",
	"editor:timeline:add-element",
	"editor:timeline:batch-add",
	"editor:timeline:update-element",
	"editor:timeline:batch-update",
	"editor:timeline:delete-element",
	"editor:timeline:batch-delete",
	"editor:timeline:split",
	"editor:timeline:move",
	"editor:timeline:arrange",
	"editor:timeline:select",
	"editor:timeline:get-selection",
	"editor:timeline:clear-selection",
	"editor:editing:batch-cuts",
	"editor:editing:delete-range",
	"editor:editing:auto-edit",
	"editor:editing:auto-edit-status",
	"editor:editing:auto-edit-list",
	"editor:editing:suggest-cuts",
	"editor:editing:suggest-status",
	"editor:analyze:video",
	"editor:analyze:models",
	"editor:analyze:scenes",
	"editor:analyze:frames",
	"editor:analyze:fillers",
	"editor:transcribe:run",
	"editor:transcribe:start",
	"editor:transcribe:status",
	"editor:transcribe:list-jobs",
	"editor:transcribe:cancel",
	"editor:search:query",
	"editor:search:status",
	"editor:search:index",
	"editor:generate:start",
	"editor:generate:status",
	"editor:generate:list-jobs",
	"editor:generate:cancel",
	"editor:generate:models",
	"editor:generate:estimate-cost",
	"editor:export:presets",
	"editor:export:recommend",
	"editor:export:start",
	"editor:export:status",
	"editor:export:list-jobs",
	"editor:diagnostics:analyze",
	"editor:mcp:forward-html",
	"editor:navigator:projects",
	"editor:navigator:open",
	"editor:screen-recording:sources",
	"editor:screen-recording:start",
	"editor:screen-recording:stop",
	"editor:screen-recording:force-stop",
	"editor:screen-recording:status",
	"editor:remotion:list",
	"editor:remotion:inspect",
	"editor:remotion:update-props",
	"editor:remotion:export",
	"editor:ui:switch-panel",
	"editor:moyin:set-script",
	"editor:moyin:parse",
	"editor:moyin:status",
	"editor:screenshot:capture",
	"editor:project:create",
	"editor:project:delete",
	"editor:project:rename",
	"editor:project:duplicate",
] as const;

const MODULE_LABELS: Record<string, string> = {
	health: "Health",
	media: "Media",
	project: "Project",
	timeline: "Timeline",
	editing: "Editing",
	analyze: "Analyze",
	transcribe: "Transcribe",
	generate: "Generate",
	export: "Export",
	diagnostics: "Diagnostics",
	mcp: "MCP",
	navigator: "Navigator",
	"screen-recording": "Screen Recording",
	remotion: "Remotion",
	ui: "UI",
	moyin: "Moyin",
	screenshot: "Screenshot",
};

const ACTION_LABELS: Record<string, string> = {
	health: "Check editor connectivity",
	list: "List resources",
	info: "Inspect a resource",
	import: "Import data",
	"import-url": "Import from URL",
	"batch-import": "Batch import items",
	"extract-frame": "Extract frame",
	rename: "Rename",
	delete: "Delete",
	settings: "Get project settings",
	"update-settings": "Update project settings",
	stats: "Get project statistics",
	summary: "Generate project summary",
	report: "Generate pipeline report",
	create: "Create project",
	duplicate: "Duplicate project",
	export: "Export",
	"add-element": "Add timeline element",
	"batch-add": "Batch add timeline elements",
	"update-element": "Update timeline element",
	"batch-update": "Batch update timeline elements",
	"delete-element": "Delete timeline element",
	"batch-delete": "Batch delete timeline elements",
	split: "Split timeline element",
	move: "Move timeline element",
	arrange: "Arrange timeline track",
	select: "Set timeline selection",
	"get-selection": "Get timeline selection",
	"clear-selection": "Clear timeline selection",
	"batch-cuts": "Apply batch cuts",
	"delete-range": "Delete timeline range",
	"auto-edit": "Run auto-edit",
	"auto-edit-status": "Get auto-edit job status",
	"auto-edit-list": "List auto-edit jobs",
	"suggest-cuts": "Suggest cuts",
	"suggest-status": "Get suggest-cuts job status",
	video: "Analyze video",
	models: "List models",
	scenes: "Analyze scenes",
	frames: "Analyze frames",
	fillers: "Detect fillers",
	run: "Run transcription",
	start: "Start async job",
	status: "Get job status",
	"list-jobs": "List jobs",
	cancel: "Cancel job",
	"estimate-cost": "Estimate cost",
	presets: "List export presets",
	recommend: "Recommend export preset",
	analyze: "Analyze diagnostics",
	"forward-html": "Forward HTML to preview",
	projects: "List projects",
	open: "Open project in editor",
	sources: "List capture sources",
	"force-stop": "Force-stop active recording",
	"update-props": "Update Remotion props",
	"switch-panel": "Switch editor panel",
	"set-script": "Set Moyin script text",
	parse: "Trigger Moyin parse",
	capture: "Capture QCut screenshot",
};

function uniqKeys({ values }: { values: string[] }): string[] {
	try {
		return [...new Set(values)];
	} catch {
		return values;
	}
}

function removeKey({ values, key }: { values: string[]; key: string }): void {
	try {
		const index = values.indexOf(key);
		if (index >= 0) {
			values.splice(index, 1);
		}
	} catch {
		/* noop */
	}
}

function createParamsSchema({
	required,
	optional,
}: ParamsSchemaSpec): CommandRegistryEntry["paramsSchema"] {
	try {
		const safeRequired = uniqKeys({ values: required ?? [] });
		const safeOptional = uniqKeys({ values: optional ?? [] }).filter(
			(name) => !safeRequired.includes(name)
		);
		const allKeys = uniqKeys({ values: [...safeRequired, ...safeOptional] });

		const properties: Record<string, ParamProperty> = {};
		for (const key of allKeys) {
			properties[key] = PARAM_PROPERTIES[key] ?? {
				type: ["string", "number", "boolean", "object", "array"],
				description: `Command parameter: ${key}`,
			};
		}

		return {
			type: "object",
			properties,
			required: safeRequired.length > 0 ? safeRequired : undefined,
			additionalProperties: false,
		};
	} catch {
		return {
			type: "object",
			properties: {},
			additionalProperties: false,
		};
	}
}

function parseCommand({ command }: { command: string }): {
	module: string;
	action: string;
} {
	try {
		const [, module = "unknown", action = "unknown"] = command.split(":");
		return { module, action };
	} catch {
		return { module: "unknown", action: "unknown" };
	}
}

function getCommandCategory({
	command,
}: {
	command: string;
}): ClaudeCapabilityCategory {
	try {
		const { module } = parseCommand({ command });
		if (
			module === "media" ||
			module === "screen-recording" ||
			module === "screenshot"
		) {
			return CLAUDE_CAPABILITY_CATEGORIES.MEDIA;
		}
		if (module === "project" || module === "navigator") {
			return CLAUDE_CAPABILITY_CATEGORIES.PROJECT;
		}
		if (module === "timeline" || module === "editing") {
			return CLAUDE_CAPABILITY_CATEGORIES.TIMELINE;
		}
		if (module === "remotion") return CLAUDE_CAPABILITY_CATEGORIES.EXPORT;
		if (module === "export") {
			return CLAUDE_CAPABILITY_CATEGORIES.EXPORT;
		}
		if (
			module === "analyze" ||
			module === "transcribe" ||
			module === "generate" ||
			module === "diagnostics"
		) {
			return CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS;
		}
		if (module === "mcp") {
			return CLAUDE_CAPABILITY_CATEGORIES.EVENTS;
		}
		if (module === "health" || module === "ui" || module === "moyin") {
			return CLAUDE_CAPABILITY_CATEGORIES.STATE;
		}
		return CLAUDE_CAPABILITY_CATEGORIES.STATE;
	} catch {
		return CLAUDE_CAPABILITY_CATEGORIES.STATE;
	}
}

function getRequiredCapability({ command }: { command: string }): string {
	try {
		if (command === "editor:health") return "state.health";
		if (command === "editor:ui:switch-panel") return "state.ui.panelSwitch";
		if (command.startsWith("editor:moyin:")) return "state.moyin.pipeline";
		if (command === "editor:mcp:forward-html") return "events.mcpPreview";
		if (command.startsWith("editor:navigator:")) return "project.navigator";
		if (command.startsWith("editor:screen-recording:"))
			return "media.screenRecording";
		if (command === "editor:screenshot:capture") return "media.screenshot";
		if (command.startsWith("editor:remotion:")) {
			if (command === "editor:remotion:export") return "export.remotion";
			if (command === "editor:remotion:update-props")
				return "timeline.elements";
			return "timeline.read";
		}
		if (command.startsWith("editor:media:")) {
			if (command === "editor:media:import") return "media.import.local";
			if (command === "editor:media:import-url") return "media.import.url";
			if (command === "editor:media:batch-import") return "media.import.batch";
			if (command === "editor:media:extract-frame") return "media.extractFrame";
			return "media.library";
		}
		if (command.startsWith("editor:project:")) {
			if (
				command === "editor:project:settings" ||
				command === "editor:project:update-settings"
			) {
				return "project.settings";
			}
			if (command === "editor:project:stats") return "project.stats";
			if (
				command === "editor:project:summary" ||
				command === "editor:project:report"
			) {
				return "project.summary";
			}
			return "project.crud";
		}
		if (command.startsWith("editor:timeline:")) {
			if (command === "editor:timeline:export") return "timeline.read";
			if (command === "editor:timeline:import") return "timeline.import";
			if (
				command === "editor:timeline:batch-add" ||
				command === "editor:timeline:batch-update" ||
				command === "editor:timeline:batch-delete"
			) {
				return "timeline.batch";
			}
			if (
				command === "editor:timeline:select" ||
				command === "editor:timeline:get-selection" ||
				command === "editor:timeline:clear-selection"
			) {
				return "timeline.selection";
			}
			if (command === "editor:timeline:arrange") return "timeline.arrange";
			return "timeline.elements";
		}
		if (command.startsWith("editor:editing:")) {
			if (
				command === "editor:editing:suggest-cuts" ||
				command === "editor:editing:suggest-status"
			) {
				return "analysis.suggestCuts";
			}
			if (
				command === "editor:editing:auto-edit" ||
				command === "editor:editing:auto-edit-status" ||
				command === "editor:editing:auto-edit-list"
			) {
				return "timeline.autoEdit";
			}
			return "timeline.cuts";
		}
		if (command.startsWith("editor:analyze:")) {
			return command === "editor:analyze:models"
				? "analysis.models"
				: "analysis.video";
		}
		if (command.startsWith("editor:transcribe:"))
			return "analysis.transcription";
		if (command.startsWith("editor:search:"))
			return "analysis.search";
		if (command.startsWith("editor:generate:")) {
			return command === "editor:generate:models"
				? "analysis.models"
				: "analysis.generate";
		}
		if (command.startsWith("editor:export:")) {
			if (
				command === "editor:export:presets" ||
				command === "editor:export:recommend"
			) {
				return "export.presets";
			}
			return "export.jobs";
		}
		if (command === "editor:diagnostics:analyze") return "analysis.diagnostics";
		return "state.health";
	} catch {
		return "state.health";
	}
}

function getCommandDescription({ command }: { command: string }): string {
	try {
		const { module, action } = parseCommand({ command });
		if (command === "editor:health") {
			return "Check editor connectivity and fetch server health status.";
		}

		const moduleLabel = MODULE_LABELS[module] ?? module;
		const actionLabel = ACTION_LABELS[action] ?? action.replace(/-/g, " ");
		return `${moduleLabel}: ${actionLabel}.`;
	} catch {
		return "Editor command.";
	}
}

function withCommonConnectionOptions({
	optional,
}: {
	optional?: string[];
}): string[] {
	try {
		return uniqKeys({
			values: ["host", "port", "token", "timeout", "json", ...(optional ?? [])],
		});
	} catch {
		return optional ?? [];
	}
}

function getCommandParamsSchema({
	command,
}: {
	command: string;
}): CommandRegistryEntry["paramsSchema"] {
	try {
		switch (command) {
			case "editor:health":
				return createParamsSchema({
					optional: withCommonConnectionOptions({}),
				});
			case "editor:media:list":
				return createParamsSchema({
					required: ["projectId"],
					optional: withCommonConnectionOptions({}),
				});
			case "editor:media:info":
				return createParamsSchema({
					required: ["projectId", "mediaId"],
					optional: withCommonConnectionOptions({}),
				});
			case "editor:media:import":
				return createParamsSchema({
					required: ["projectId", "source"],
					optional: withCommonConnectionOptions({}),
				});
			case "editor:media:import-url":
				return createParamsSchema({
					required: ["projectId", "url"],
					optional: withCommonConnectionOptions({ optional: ["filename"] }),
				});
			default:
				break;
		}
	} catch {
		// fall through to generic inference
	}

	try {
		const { module, action } = parseCommand({ command });
		const required: string[] = [];
		const optional: string[] = withCommonConnectionOptions({});

		const add = (...keys: string[]) => {
			for (const key of keys) {
				optional.push(key);
			}
		};
		const requireProjectByDefault =
			command !== "editor:health" &&
			module !== "generate" &&
			module !== "diagnostics" &&
			module !== "mcp" &&
			module !== "navigator" &&
			module !== "screen-recording" &&
			module !== "ui" &&
			module !== "moyin" &&
			module !== "screenshot";

		if (requireProjectByDefault) {
			required.push("projectId");
		}

		if (module === "project" && action === "create") {
			removeKey({ values: required, key: "projectId" });
			add("newName");
		}
		if (module === "project" && action === "rename") {
			required.push("newName");
		}
		if (module === "project" && action === "update-settings") {
			required.push("data");
			add("input");
		}
		if (module === "project" && action === "report") {
			add("outputDir");
		}

		if (module === "timeline") {
			if (action === "export") add("outputFormat", "mode");
			if (action === "import") {
				required.push("data");
				add("input", "outputFormat", "mode", "replace");
			}
			if (action === "add-element") required.push("data");
			if (
				action === "batch-add" ||
				action === "batch-delete" ||
				action === "select"
			) {
				required.push("elements");
			}
			if (action === "batch-update") required.push("updates");
			if (action === "update-element") required.push("elementId", "changes");
			if (action === "delete-element") required.push("elementId");
			if (action === "split") required.push("elementId", "splitTime");
			if (action === "move") required.push("elementId", "toTrack");
			if (action === "arrange") required.push("trackId", "mode");
			if (action === "arrange") add("gap", "startTime", "data");
			if (action === "batch-delete") add("ripple");
			if (action === "split") add("mode");
			if (action === "move") add("startTime");
		}

		if (module === "editing") {
			if (action === "batch-cuts") required.push("elementId", "cuts");
			if (action === "batch-cuts") add("ripple");
			if (action === "delete-range") required.push("startTime", "endTime");
			if (action === "delete-range")
				add("trackId", "ripple", "crossTrackRipple");
			if (action === "auto-edit") {
				required.push("elementId", "mediaId");
				add(
					"provider",
					"language",
					"threshold",
					"removeFillers",
					"removeSilences",
					"dryRun",
					"poll",
					"pollInterval"
				);
			}
			if (action === "auto-edit-status") required.push("jobId");
			if (action === "suggest-cuts") {
				required.push("mediaId");
				add(
					"provider",
					"language",
					"threshold",
					"includeFillers",
					"includeSilences",
					"includeScenes",
					"poll",
					"pollInterval"
				);
			}
			if (action === "suggest-status") required.push("jobId");
		}

		if (module === "analyze") {
			if (action === "models") {
				removeKey({ values: required, key: "projectId" });
			}
			if (action === "video") {
				required.push("source");
				add("analysisType", "model", "outputFormat");
			}
			if (action === "scenes") {
				required.push("mediaId");
				add("threshold", "model");
			}
			if (action === "frames") {
				required.push("mediaId");
				add("timestamps", "gap", "prompt");
			}
			if (action === "fillers") {
				add("mediaId", "data");
			}
		}

		if (module === "transcribe") {
			if (action === "run" || action === "start") {
				add("mediaId", "source", "provider", "language", "loadSpeech");
			}
			if (action === "status" || action === "cancel") required.push("jobId");
			if (action === "list-jobs") {
				/* project only */
			}
			if (action === "start") add("poll", "pollInterval");
		}

		if (module === "generate") {
			if (action === "models") {
				removeKey({ values: required, key: "projectId" });
			}
			if (action === "estimate-cost") {
				removeKey({ values: required, key: "projectId" });
				required.push("model");
				add("duration", "resolution");
			}
			if (action === "start") {
				required.push("model");
				add(
					"text",
					"prompt",
					"imageUrl",
					"videoUrl",
					"duration",
					"aspectRatio",
					"resolution",
					"negativePrompt",
					"addToTimeline",
					"trackId",
					"startTime",
					"poll",
					"pollInterval"
				);
			}
			if (action === "status" || action === "cancel") required.push("jobId");
		}

		if (module === "export") {
			if (action === "presets") {
				removeKey({ values: required, key: "projectId" });
			}
			if (action === "recommend") required.push("target");
			if (action === "start")
				add("preset", "data", "outputDir", "poll", "pollInterval");
			if (action === "status") required.push("jobId");
		}

		if (module === "diagnostics") {
			removeKey({ values: required, key: "projectId" });
			required.push("message");
			add("data");
		}

		if (module === "mcp") {
			removeKey({ values: required, key: "projectId" });
			required.push("html");
			add("toolName");
		}

		if (module === "navigator") {
			removeKey({ values: required, key: "projectId" });
			if (action === "open") required.push("projectId");
		}

		if (module === "screen-recording") {
			removeKey({ values: required, key: "projectId" });
			if (action === "start") add("sourceId", "filename");
			if (action === "stop") add("discard");
		}

		if (module === "remotion") {
			if (action === "inspect") required.push("elementId");
			if (action === "update-props") {
				required.push("elementId");
				add("data", "changes");
			}
			if (action === "export") add("filename", "preset");
		}

		if (module === "ui") {
			removeKey({ values: required, key: "projectId" });
			required.push("panel");
			add("tab");
		}

		if (module === "moyin") {
			removeKey({ values: required, key: "projectId" });
			if (action === "set-script") add("text", "script");
		}

		if (module === "screenshot") {
			removeKey({ values: required, key: "projectId" });
			add("filename");
		}

		return createParamsSchema({
			required: uniqKeys({ values: required.filter(Boolean) }),
			optional: uniqKeys({ values: optional.filter(Boolean) }),
		});
	} catch {
		return createParamsSchema({});
	}
}

const COMMAND_REGISTRY: CommandRegistryEntry[] = EDITOR_COMMANDS.map(
	(name) => ({
		name,
		description: getCommandDescription({ command: name }),
		paramsSchema: getCommandParamsSchema({ command: name }),
		requiredCapability: getRequiredCapability({ command: name }),
		category: getCommandCategory({ command: name }),
	})
);

function cloneEntry({
	entry,
}: {
	entry: CommandRegistryEntry;
}): CommandRegistryEntry {
	try {
		return {
			...entry,
			paramsSchema: {
				...entry.paramsSchema,
				properties: { ...entry.paramsSchema.properties },
				required: entry.paramsSchema.required?.slice(),
			},
		};
	} catch {
		return entry;
	}
}

export function getClaudeCommandRegistry(): CommandRegistryEntry[] {
	try {
		return COMMAND_REGISTRY.map((entry) => cloneEntry({ entry }));
	} catch {
		return [];
	}
}

export function getClaudeCommandRegistryEntry({
	name,
}: {
	name: string;
}): CommandRegistryEntry | undefined {
	try {
		const entry = COMMAND_REGISTRY.find((candidate) => candidate.name === name);
		return entry ? cloneEntry({ entry }) : undefined;
	} catch {
		return undefined;
	}
}
