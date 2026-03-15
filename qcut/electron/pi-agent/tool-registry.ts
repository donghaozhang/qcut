/**
 * Pi Agent tool registry — L0/L1/L2 discovery tools + core command tools.
 *
 * Tools follow the AgentTool interface from pi-agent-core:
 *   { name, label, description, parameters (TypeBox), execute }
 *
 * @module electron/pi-agent/tool-registry
 */

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { execCli } from "./cli-bridge.js";
import {
	CATEGORIES,
	COMMANDS_REGISTRY,
} from "../native-pipeline/cli/command-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a text-only tool result. */
function textResult(text: string): AgentToolResult<undefined> {
	return { content: [{ type: "text", text }], details: undefined };
}

/** Build an error tool result. */
function errorResult(message: string): AgentToolResult<undefined> {
	return textResult(
		JSON.stringify({
			status: "error",
			message,
			hint: "Check parameters. Use qcut_command_help to see parameter details.",
		})
	);
}

/** Wrap execute with error handling. */
function safeExecute<T extends TSchema>(
	fn: (
		toolCallId: string,
		params: Static<T>
	) => Promise<AgentToolResult<undefined>>
): AgentTool<T>["execute"] {
	return async (toolCallId, params, _signal, _onUpdate) => {
		try {
			return await fn(toolCallId, params);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			return errorResult(message);
		}
	};
}

/** Execute CLI and return result, propagating errors properly. */
async function execCliTool(
	command: string,
	args: Record<string, unknown> = {}
): Promise<AgentToolResult<undefined>> {
	const result = await execCli(command, args);
	if (!result.success) {
		return errorResult(result.error ?? "Command failed");
	}
	return textResult(JSON.stringify(result));
}

// ---------------------------------------------------------------------------
// L1: Category help tool
// ---------------------------------------------------------------------------

const QcutHelpParams = Type.Object({
	category: Type.String({
		description:
			"Command category: generation, pipeline, analysis, models, keys, project, subtitle, vimax, editor",
	}),
});

const qcutHelpTool: AgentTool<typeof QcutHelpParams> = {
	name: "qcut_help",
	label: "QCut Help",
	description:
		"List QCut commands. Pass a category name to get all commands in that category.",
	parameters: QcutHelpParams,
	execute: safeExecute<typeof QcutHelpParams>(async (_id, params) => {
		const cat = CATEGORIES.find((c) => c.name === params.category);
		if (!cat) {
			const available = CATEGORIES.map((c) => c.name).join(", ");
			return textResult(
				JSON.stringify({
					status: "error",
					message: `Unknown category "${params.category}". Available: ${available}`,
				})
			);
		}

		const commands = cat.commands.map((cmdName) => {
			const def = COMMANDS_REGISTRY[cmdName];
			return {
				name: cmdName,
				description: def?.description ?? "(no description)",
			};
		});

		return textResult(
			JSON.stringify({
				category: cat.name,
				label: cat.label,
				commands,
			})
		);
	}),
};

// ---------------------------------------------------------------------------
// L2: Command help tool
// ---------------------------------------------------------------------------

const QcutCommandHelpParams = Type.Object({
	command: Type.String({
		description:
			"Full command name, e.g. generate-image, editor:timeline-split, transcribe",
	}),
});

const qcutCommandHelpTool: AgentTool<typeof QcutCommandHelpParams> = {
	name: "qcut_command_help",
	label: "QCut Command Help",
	description: "Get full parameters and usage for a specific QCut command.",
	parameters: QcutCommandHelpParams,
	execute: safeExecute<typeof QcutCommandHelpParams>(async (_id, params) => {
		const def = COMMANDS_REGISTRY[params.command];
		if (!def) {
			return textResult(
				JSON.stringify({
					status: "error",
					message: `Unknown command "${params.command}". Use qcut_help to list commands in a category.`,
				})
			);
		}

		return textResult(
			JSON.stringify({
				name: def.name,
				description: def.description,
				category: def.category,
				flags: def.flags.map((f) => ({
					name: f.name,
					type: f.type,
					description: f.description,
					required: (f as any).required ?? false,
					default: f.default,
				})),
				examples: (def as any).examples ?? [],
			})
		);
	}),
};

// ---------------------------------------------------------------------------
// Project status tool
// ---------------------------------------------------------------------------

const QcutProjectStatusParams = Type.Object({});

const qcutProjectStatusTool: AgentTool<typeof QcutProjectStatusParams> = {
	name: "qcut_project_status",
	label: "QCut Project Status",
	description: "Get the current project state including timeline info.",
	parameters: QcutProjectStatusParams,
	execute: safeExecute<typeof QcutProjectStatusParams>(async () => {
		return await execCliTool("editor:state-snapshot");
	}),
};

// ---------------------------------------------------------------------------
// Core CLI command tools (15-20 most-used)
// ---------------------------------------------------------------------------

/** Helper to create a CLI-backed tool. */
function cliTool<T extends TSchema>(
	name: string,
	label: string,
	description: string,
	parameters: T,
	command: string,
	mapArgs?: (params: Static<T>) => Record<string, unknown>
): AgentTool<T> {
	return {
		name,
		label,
		description,
		parameters,
		execute: safeExecute<T>(async (_id, params) => {
			const args = mapArgs
				? mapArgs(params)
				: (params as Record<string, unknown>);
			return await execCliTool(command, args);
		}),
	};
}

// -- Timeline --

const timelineSplitTool = cliTool(
	"timeline_split",
	"Timeline Split",
	"Split a clip on the timeline at a specified time point",
	Type.Object({
		time: Type.String({ description: 'Split time point, e.g. "00:01:30.500"' }),
		track: Type.Optional(Type.Number({ description: "Track index" })),
		clipId: Type.Optional(Type.String({ description: "Clip ID to split" })),
	}),
	"editor:timeline-split",
	(p) => ({ time: p.time, track: p.track, clipId: p.clipId })
);

const timelineTrimTool = cliTool(
	"timeline_trim",
	"Timeline Trim",
	"Trim a clip to a specific start/end time",
	Type.Object({
		clipId: Type.String({ description: "Clip ID to trim" }),
		start: Type.Optional(Type.String({ description: "New start time" })),
		end: Type.Optional(Type.String({ description: "New end time" })),
	}),
	"editor:timeline-trim",
	(p) => ({ clipId: p.clipId, start: p.start, end: p.end })
);

const timelineDeleteTool = cliTool(
	"timeline_delete",
	"Timeline Delete",
	"Delete a clip from the timeline",
	Type.Object({
		clipId: Type.String({ description: "Clip ID to delete" }),
	}),
	"editor:timeline-delete",
	(p) => ({ clipId: p.clipId })
);

const timelineMoveTool = cliTool(
	"timeline_move",
	"Timeline Move",
	"Move a clip to a new position on the timeline",
	Type.Object({
		clipId: Type.String({ description: "Clip ID to move" }),
		position: Type.String({ description: "Target position timecode" }),
		track: Type.Optional(Type.Number({ description: "Target track index" })),
	}),
	"editor:timeline-move",
	(p) => ({ clipId: p.clipId, position: p.position, track: p.track })
);

// -- Media --

const mediaImportTool = cliTool(
	"media_import",
	"Media Import",
	"Import a media file into the project",
	Type.Object({
		path: Type.String({ description: "File path to import" }),
		track: Type.Optional(Type.Number({ description: "Target track" })),
		position: Type.Optional(
			Type.String({ description: "Insert position timecode" })
		),
	}),
	"editor:media-import",
	(p) => ({ path: p.path, track: p.track, position: p.position })
);

const mediaListTool = cliTool(
	"media_list",
	"Media List",
	"List all media items in the current project",
	Type.Object({}),
	"editor:media-list"
);

// -- Transcription --

const transcribeTool = cliTool(
	"transcribe",
	"Transcribe",
	"Run AI transcription on video/audio to generate subtitles",
	Type.Object({
		source: Type.String({ description: "Source file path or clip ID" }),
		language: Type.Optional(
			Type.String({ description: "Language code: zh, en, etc." })
		),
		model: Type.Optional(Type.String({ description: "Transcription model" })),
	}),
	"transcribe",
	(p) => ({ source: p.source, language: p.language, model: p.model })
);

// -- Export --

const exportStartTool = cliTool(
	"export_start",
	"Export Start",
	"Start exporting/rendering the project",
	Type.Object({
		output: Type.String({ description: "Output file path" }),
		format: Type.Optional(
			Type.String({ description: "Format: mp4, mov, webm" })
		),
		resolution: Type.Optional(
			Type.String({ description: "Resolution: 1080p, 4k" })
		),
		quality: Type.Optional(
			Type.String({ description: "Quality: draft, normal, high" })
		),
	}),
	"editor:export-start",
	(p) => ({
		output: p.output,
		format: p.format,
		resolution: p.resolution,
		quality: p.quality,
	})
);

// -- Generation --

const generateImageTool = cliTool(
	"generate_image",
	"Generate Image",
	"Generate an image from a text prompt",
	Type.Object({
		text: Type.String({ description: "Text prompt" }),
		model: Type.Optional(
			Type.String({
				description: "Model key: flux_dev, flux_pro, kling_2_6_pro, etc.",
			})
		),
		aspectRatio: Type.Optional(
			Type.String({ description: "Aspect ratio, e.g. 16:9" })
		),
	}),
	"generate-image",
	(p) => ({ text: p.text, model: p.model, aspectRatio: p.aspectRatio })
);

const createVideoTool = cliTool(
	"create_video",
	"Create Video",
	"Create a video from text or image prompt",
	Type.Object({
		text: Type.String({ description: "Text prompt" }),
		model: Type.Optional(Type.String({ description: "Model key" })),
		imageUrl: Type.Optional(
			Type.String({ description: "Reference image URL for image-to-video" })
		),
	}),
	"create-video",
	(p) => ({ text: p.text, model: p.model, imageUrl: p.imageUrl })
);

// -- Analysis --

const analyzeVideoTool = cliTool(
	"analyze_video",
	"Analyze Video",
	"Analyze a video file with AI (content, scenes, objects)",
	Type.Object({
		source: Type.String({ description: "Video file path or URL" }),
		query: Type.Optional(
			Type.String({ description: "Specific question about the video" })
		),
	}),
	"analyze-video",
	(p) => ({ source: p.source, query: p.query })
);

const queryVideoTool = cliTool(
	"query_video",
	"Query Video",
	"Ask a natural-language question about a video",
	Type.Object({
		source: Type.String({ description: "Video file path or URL" }),
		query: Type.String({ description: "Question about the video" }),
	}),
	"query-video",
	(p) => ({ source: p.source, query: p.query })
);

// -- Subtitle --

const subtitleStyleTool = cliTool(
	"subtitle_style",
	"Subtitle Style",
	"Apply styling to subtitles",
	Type.Object({
		preset: Type.Optional(Type.String({ description: "Style preset name" })),
		fontSize: Type.Optional(Type.Number({ description: "Font size" })),
		color: Type.Optional(Type.String({ description: "Text color" })),
	}),
	"subtitle-style",
	(p) => ({ preset: p.preset, fontSize: p.fontSize, color: p.color })
);

const subtitleExportTool = cliTool(
	"subtitle_export",
	"Subtitle Export",
	"Export subtitles to a file",
	Type.Object({
		output: Type.String({ description: "Output file path" }),
		format: Type.Optional(
			Type.String({ description: "Format: srt, ass, vtt" })
		),
	}),
	"subtitle-export",
	(p) => ({ output: p.output, format: p.format })
);

// -- Generic CLI execution (fallback) --

const qcutRunTool = cliTool(
	"qcut_run",
	"QCut Run",
	"Execute any QCut CLI command by name with arbitrary arguments. Use after discovering commands via qcut_help/qcut_command_help.",
	Type.Object({
		command: Type.String({
			description: "Command name, e.g. generate-image, editor:timeline-split",
		}),
		args: Type.Optional(
			Type.Record(Type.String(), Type.Unknown(), {
				description: "Command arguments as key-value pairs",
			})
		),
	}),
	"", // command comes from params
	() => ({}) // handled in custom execute below
);

// Allowlist of safe command names for the generic run tool
const BLOCKED_CATEGORIES = new Set(["project-setup", "api-keys"]);
const ALLOWED_RUN_COMMANDS = new Set(
	CATEGORIES.filter((c) => !BLOCKED_CATEGORIES.has(c.name)).flatMap(
		(c) => c.commands
	)
);

// Override execute for the generic run tool
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
qcutRunTool.execute = async (
	toolCallId: string,
	params: unknown,
	_signal: unknown,
	_onUpdate: unknown
) => {
	try {
		const p = params as { command: string; args?: Record<string, unknown> };
		if (!ALLOWED_RUN_COMMANDS.has(p.command)) {
			return errorResult(
				`Command "${p.command}" is not in the allowed command list. Use qcut_help to see available commands.`
			);
		}
		return await execCliTool(p.command, p.args ?? {});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return errorResult(message);
	}
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Returns the full set of Pi Agent tools. */
export function createPiAgentTools(): AgentTool<any>[] {
	return [
		// Discovery (L1 / L2)
		qcutHelpTool,
		qcutCommandHelpTool,
		qcutProjectStatusTool,

		// Timeline
		timelineSplitTool,
		timelineTrimTool,
		timelineDeleteTool,
		timelineMoveTool,

		// Media
		mediaImportTool,
		mediaListTool,

		// Transcription
		transcribeTool,

		// Export
		exportStartTool,

		// Generation
		generateImageTool,
		createVideoTool,

		// Analysis
		analyzeVideoTool,
		queryVideoTool,

		// Subtitle
		subtitleStyleTool,
		subtitleExportTool,

		// Generic fallback
		qcutRunTool,
	];
}
