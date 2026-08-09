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
	return { name, description, category: "editor", flags, examples };
}

const CACHE_FLAGS = [
	flag("--cache-root", "string", "Local Jianying User Data/Cache directory"),
	flag("--database", "string[]", "Local rp.db path (repeatable)"),
];

const DRAFT_FLAGS = [
	flag(
		"--project-root",
		"string",
		"Local Jianying com.lveditor.draft directory"
	),
	flag("--draft", "string[]", "Plaintext Jianying draft path (repeatable)"),
];

const INSPECTION_FLAGS = [...CACHE_FLAGS, ...DRAFT_FLAGS];

export const JIANYING_TRANSITION_COMMANDS: Record<string, CommandDef> = {
	"editor:jianying-transition:categories": command({
		name: "editor:jianying-transition:categories",
		description:
			"Read transition categories from local Jianying cache metadata",
		flags: CACHE_FLAGS,
		examples: [
			"qcut editor jianying-transition categories --json",
			"qcut editor jianying-transition categories --cache-root ~/Movies/JianyingPro/User\\ Data/Cache --json",
		],
	}),
	"editor:jianying-transition:inventory": command({
		name: "editor:jianying-transition:inventory",
		description: "Summarize transitions in local Jianying cache metadata",
		flags: CACHE_FLAGS,
		examples: ["qcut editor jianying-transition inventory --json"],
	}),
	"editor:jianying-transition:inspect": command({
		name: "editor:jianying-transition:inspect",
		description:
			"Join local Jianying catalog, draft ownership, package metadata, and renderer signals",
		flags: [
			flag("--title", "string", "Exact Jianying transition card title", {
				required: true,
			}),
			...INSPECTION_FLAGS,
		],
		examples: ['qcut editor jianying-transition inspect --title "叠化" --json'],
	}),
	"editor:jianying-transition:scan-drafts": command({
		name: "editor:jianying-transition:scan-drafts",
		description:
			"Scan local plaintext Jianying drafts for transition ownership",
		flags: DRAFT_FLAGS,
		examples: ["qcut editor jianying-transition scan-drafts --json"],
	}),
	"editor:jianying-transition:classify-package": command({
		name: "editor:jianying-transition:classify-package",
		description:
			"Classify one local Jianying transition package without copying its assets",
		flags: [
			flag("--path", "string", "Local Cache/effect package directory"),
			...CACHE_FLAGS,
			flag("--resource-id", "string[]", "Catalog resource ID (repeatable)"),
			flag(
				"--draft-effect-id",
				"string[]",
				"Draft transition effect ID (repeatable)"
			),
			flag(
				"--catalog-effect-id",
				"string[]",
				"Catalog transition effect ID (repeatable)"
			),
			flag("--metadata-md5", "string", "Package metadata MD5"),
		],
		examples: [
			"qcut editor jianying-transition classify-package --resource-id 6724845717472416269 --metadata-md5 33d3a1ad16e89a4e2c9b6d45e3ec7aa1 --json",
		],
	}),
	"editor:jianying-transition:parity-report": command({
		name: "editor:jianying-transition:parity-report",
		description:
			"Compare five-stop local captures and report QCut transition parity metrics",
		flags: [
			flag("--title", "string", "Exact Jianying transition card title"),
			flag("--manifest", "string", "Local five-stop parity manifest"),
			flag("--formula", "string", "Observed transition formula"),
			flag("--ffmpeg-path", "string", "Local FFmpeg executable"),
			...INSPECTION_FLAGS,
		],
		examples: [
			'qcut editor jianying-transition parity-report --title "叠化" --manifest /tmp/parity.json --formula "C(p) = (1 - p) A + p B" --json',
		],
	}),
};
