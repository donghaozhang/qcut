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
	return { name, description, category: "sticker-lab", flags, examples };
}

const ROOT_FLAG = flag(
	"--root",
	"string",
	"Private local reference root (defaults to QCUT_STICKER_LAB_ROOT or the QCut Movies backup)"
);
const BATCH_FLAG = flag(
	"--batch-id",
	"string",
	"Limit results to one local reference batch"
);
const CATEGORY_FLAG = flag(
	"--category",
	"string",
	"Limit results to a category ID or exact category label"
);
const QUERY_FLAG = flag(
	"--query",
	"string",
	"Case-insensitive title, sticker ID, category, or batch search"
);
const PAGINATION_FLAGS = [
	flag("--offset", "number", "Skip this many matching entries", { default: 0 }),
	flag("--limit", "number", "Return at most this many matching entries", {
		default: 50,
	}),
];

export const STICKER_LAB_COMMANDS: Record<string, CommandDef> = {
	"sticker-lab-catalogs": command({
		name: "sticker-lab-catalogs",
		description: "List private local Sticker Lab reference batches",
		flags: [ROOT_FLAG, BATCH_FLAG, QUERY_FLAG, ...PAGINATION_FLAGS],
		examples: [
			'qcut sticker-lab catalogs --root "$QCUT_STICKER_LAB_ROOT" --json',
			"qcut sticker-lab catalogs --query batch-18 --json",
		],
	}),
	"sticker-lab-categories": command({
		name: "sticker-lab-categories",
		description: "List categories in private local Sticker Lab references",
		flags: [
			ROOT_FLAG,
			BATCH_FLAG,
			CATEGORY_FLAG,
			QUERY_FLAG,
			...PAGINATION_FLAGS,
		],
		examples: [
			"qcut sticker-lab categories --batch-id jianying-2026-08-23-batch-18-v2 --json",
			'qcut sticker-lab categories --query "热门" --json',
		],
	}),
	"sticker-lab-items": command({
		name: "sticker-lab-items",
		description: "List items in private local Sticker Lab references",
		flags: [
			ROOT_FLAG,
			BATCH_FLAG,
			CATEGORY_FLAG,
			QUERY_FLAG,
			...PAGINATION_FLAGS,
		],
		examples: [
			"qcut sticker-lab items --batch-id jianying-2026-08-23-batch-18-v2 --limit 20 --json",
			'qcut sticker-lab items --category "热门" --json',
		],
	}),
	"sticker-lab-search": command({
		name: "sticker-lab-search",
		description: "Search private local Sticker Lab references",
		flags: [
			ROOT_FLAG,
			BATCH_FLAG,
			CATEGORY_FLAG,
			flag(
				"--query",
				"string",
				"Case-insensitive title, sticker ID, category, or batch search",
				{ required: true }
			),
			...PAGINATION_FLAGS,
		],
		examples: [
			'qcut sticker-lab search --query "安排" --json',
			"qcut sticker-lab search --query 7134619769205951784 --batch-id jianying-2026-08-23-batch-18-v2 --json",
		],
	}),
};
