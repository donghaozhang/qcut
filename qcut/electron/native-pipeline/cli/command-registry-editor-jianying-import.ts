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
	"Jianying Professional draft directory to import (first value is used)",
	{ required: true }
);
const JIANYING_FORMAT_FLAG = flag(
	"--format",
	"string",
	"Draft product format (must be jianying)",
	{ default: "jianying" }
);
const ACCEPT_WARNING_FLAG = flag(
	"--accept-warning",
	"string[]",
	"Accepted warning fingerprint (repeatable; must match the plan exactly)"
);

export const JIANYING_IMPORT_COMMANDS: Record<string, CommandDef> = {
	"editor:jianying-import:inspect": command({
		name: "editor:jianying-import:inspect",
		description:
			"Read-only inspection of a local Jianying Professional draft: profile, counts, capabilities, issues",
		flags: [DRAFT_DIR_FLAG, JIANYING_FORMAT_FLAG],
		examples: [
			'qcut editor jianying-import inspect --draft "~/Movies/JianyingPro Drafts/my-draft" --json',
		],
	}),
	"editor:jianying-import:plan": command({
		name: "editor:jianying-import:plan",
		description:
			"Build an expiring, single-use import plan (token + warning fingerprints); writes nothing",
		flags: [DRAFT_DIR_FLAG, JIANYING_FORMAT_FLAG],
		examples: [
			'qcut editor jianying-import plan --draft "~/Movies/JianyingPro Drafts/my-draft" --json',
		],
	}),
	"editor:jianying-import:import": command({
		name: "editor:jianying-import:import",
		description:
			"Plan, validate, and queue a Jianying Professional draft for QCut desktop",
		flags: [DRAFT_DIR_FLAG, JIANYING_FORMAT_FLAG, ACCEPT_WARNING_FLAG],
		examples: [
			'qcut draft import --format jianying --draft "~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/my-draft" --json',
		],
	}),
	"editor:jianying-import:verify-roundtrip": command({
		name: "editor:jianying-import:verify-roundtrip",
		description:
			"Verify Jianying Professional import and no-op writeback byte-for-byte without modifying the draft",
		flags: [DRAFT_DIR_FLAG, JIANYING_FORMAT_FLAG],
		examples: [
			'qcut draft verify-roundtrip --format jianying --draft "~/Movies/JianyingPro Drafts/my-draft" --json',
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
			ACCEPT_WARNING_FLAG,
		],
		examples: [
			"qcut editor jianying-import commit --plan-token <token> --accept-warning <fp>",
		],
	}),
};
