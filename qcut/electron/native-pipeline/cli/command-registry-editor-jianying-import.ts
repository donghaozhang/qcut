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

const DRAFT_DIR_FLAG = flag(
	"--draft",
	"string[]",
	"JianYing/CapCut draft directory to import (first value is used)",
	{ required: true }
);

export const JIANYING_IMPORT_COMMANDS: Record<string, CommandDef> = {
	"editor:jianying-import:inspect": command({
		name: "editor:jianying-import:inspect",
		description:
			"Read-only inspection of a local JianYing/CapCut draft: profile, counts, capabilities, issues",
		flags: [DRAFT_DIR_FLAG],
		examples: [
			'qcut editor jianying-import inspect --draft "~/Movies/JianyingPro Drafts/my-draft" --json',
		],
	}),
	"editor:jianying-import:plan": command({
		name: "editor:jianying-import:plan",
		description:
			"Build an expiring, single-use import plan (token + warning fingerprints); writes nothing",
		flags: [DRAFT_DIR_FLAG],
		examples: [
			'qcut editor jianying-import plan --draft "~/Movies/JianyingPro Drafts/my-draft" --json',
		],
	}),
	"editor:jianying-import:commit": command({
		name: "editor:jianying-import:commit",
		description:
			"Freeze a planned import and queue it in QCut's validated desktop inbox",
		flags: [
			flag("--plan-token", "string", "Token returned by plan", {
				required: true,
			}),
			flag(
				"--accept-warning",
				"string[]",
				"Accepted warning fingerprint (repeatable; must match the plan exactly)"
			),
		],
		examples: [
			"qcut editor jianying-import commit --plan-token <token> --accept-warning <fp>",
		],
	}),
};
