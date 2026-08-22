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
	return { name, description, category: "text-lab", flags, examples };
}

const BROWSE_FLAGS = [
	flag(
		"--query",
		"string",
		"Filter by title, resource ID, or package metadata"
	),
	flag("--limit", "number", "Return at most this many matching entries"),
];

export const TEXT_LAB_COMMANDS: Record<string, CommandDef> = {
	"text-lab-list": command({
		name: "text-lab-list",
		description: "List renderable flower-text styles in QCut's private cache",
		flags: BROWSE_FLAGS,
		examples: [
			"qcut text-lab list --limit 20 --json",
			'qcut text-lab list --query "发光" --json',
		],
	}),
	"text-lab-animations": command({
		name: "text-lab-animations",
		description: "List renderable entrance, exit, and loop text animations",
		flags: [
			...BROWSE_FLAGS,
			flag("--slot", "string", "Animation slot", {
				enum: ["entrance", "exit", "loop"],
			}),
		],
		examples: ["qcut text-lab animations --slot loop --limit 20 --json"],
	}),
	"text-lab-render": command({
		name: "text-lab-render",
		description:
			"Render one cached flower-text style through the native runtime",
		flags: [
			flag("--style", "string", "Style ID, resource ID, or exact title", {
				required: true,
			}),
			flag("--text", "string", "Editable text content", { required: true }),
			flag(
				"--entrance-animation",
				"string",
				"Entrance animation ID, resource ID, or title"
			),
			flag(
				"--exit-animation",
				"string",
				"Exit animation ID, resource ID, or title"
			),
			flag(
				"--loop-animation",
				"string",
				"Loop animation ID, resource ID, or title"
			),
			flag("--output", "string", "Transparent .webm or still .png output path"),
			flag("--duration", "number", "Output duration in seconds", {
				default: 3,
			}),
			flag("--fps", "number", "Output frame rate", { default: 30 }),
			flag("--width", "number", "Transparent render width", { default: 1024 }),
			flag("--height", "number", "Transparent render height", { default: 512 }),
			flag("--font-size", "number", "Editable text font size", { default: 96 }),
		],
		examples: [
			'qcut text-lab render --style "<resource-id>/<package-hash>" --text "QCut 花字" --output flower.webm',
			'qcut text-lab render --style "金色标题" --text "QCut" --loop-animation "波浪" --output animated.webm',
		],
	}),
};
