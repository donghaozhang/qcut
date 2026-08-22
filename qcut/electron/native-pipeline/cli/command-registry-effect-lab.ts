import type { CommandDef, FlagDef } from "./command-registry-types.js";

function flag(
	name: string,
	type: FlagDef["type"],
	description: string,
	options?: Partial<FlagDef>
): FlagDef {
	return { name, type, description, ...options };
}

function command({
	name,
	description,
	flags,
	examples,
}: {
	name: string;
	description: string;
	flags: FlagDef[];
	examples: string[];
}): CommandDef {
	return { name, description, category: "effect-lab", flags, examples };
}

const BROWSE_FLAGS = [
	flag("--query", "string", "Search title, IDs, panel, or category"),
	flag("--panel", "string", "Effect panel", {
		enum: ["effects2", "face-prop"],
	}),
	flag("--category", "string", "Category ID or localized category name"),
	flag("--installed-only", "boolean", "Only return locally installed effects"),
	flag("--supported-only", "boolean", "Only return renderable effects"),
	flag("--limit", "number", "Return at most this many matching effects"),
];

export const EFFECT_LAB_COMMANDS: Record<string, CommandDef> = {
	"effect-lab-list": command({
		name: "effect-lab-list",
		description: "List effects available to QCut's local Effect Lab",
		flags: BROWSE_FLAGS,
		examples: [
			"qcut effect-lab list --supported-only --limit 20 --json",
			"qcut effect-lab list --panel face-prop --json",
		],
	}),
	"effect-lab-search": command({
		name: "effect-lab-search",
		description: "Search QCut's local Effect Lab by title, ID, or category",
		flags: BROWSE_FLAGS.map((definition) =>
			definition.name === "--query"
				? { ...definition, required: true }
				: definition
		),
		examples: [
			'qcut effect-lab search --query "发光" --json',
			'qcut effect-lab search --query "运镜" --supported-only --limit 10 --json',
		],
	}),
	"effect-lab-doctor": command({
		name: "effect-lab-doctor",
		description: "Check the local Effect Lab runtime, bridge, and cache",
		flags: [],
		examples: ["qcut effect-lab doctor --json"],
	}),
	"effect-lab-render": command({
		name: "effect-lab-render",
		description: "Render one local Effect Lab effect onto a video",
		flags: [
			flag(
				"--effect",
				"string",
				"Effect title, QCut ID, effect ID, or resource ID",
				{
					required: true,
				}
			),
			flag("--input", "string", "Input video path", { required: true }),
			flag("--output", "string", "Output MP4 path"),
			flag("--start-time", "number", "Effect start time in seconds", {
				default: 0,
			}),
			flag("--duration", "number", "Effect duration in seconds"),
			flag("--fps", "number", "Output frame rate", { default: 30 }),
			flag("--width", "number", "Output width; defaults to the input width"),
			flag("--height", "number", "Output height; defaults to the input height"),
			flag(
				"--adjust",
				"string[]",
				"Repeatable normalized slider assignment, for example effects_adjust_intensity=0.8"
			),
		],
		examples: [
			'qcut effect-lab render --effect "胶片框" --input input.mp4 --output output.mp4',
			"qcut effect-lab render --effect 7538317048565203509 --input input.mp4 --adjust effects_adjust_intensity=0.8 --json",
		],
	}),
};
