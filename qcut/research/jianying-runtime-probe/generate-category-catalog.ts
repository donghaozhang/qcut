#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CATEGORY_IDS = [
	"ai-one-take",
	"dissolve",
	"split",
	"glitch",
	"light",
	"emoji",
	"slideshow",
	"blur",
	"distortion",
	"shooting",
	"camera",
	"natural",
	"variety",
	"mg",
] as const;

type CategoryId = (typeof CATEGORY_IDS)[number];

interface SelectedTransition {
	categoryId: CategoryId;
	sourceGroup: CategoryId;
	title: string;
	resourceId: string;
	metadataMd5: string;
	durationSeconds: number;
	overlap: boolean;
	isVip: boolean;
}

interface SelectedCategory {
	id: CategoryId;
	target: number;
	count: number;
	transitions: SelectedTransition[];
}

interface SelectionManifest {
	schemaVersion: 2 | 3;
	selectedCount: number;
	categories: SelectedCategory[];
}

interface CategoryTargets {
	aiGenerationPerCategory: number;
	binaryPerCategory: number;
}

interface ParsedCategory {
	id: CategoryId;
	target?: number;
	count: number;
	transitions: SelectedTransition[];
}

const EXPORT_NAMES: Readonly<Record<CategoryId, string>> = {
	"ai-one-take": "JIANYING_AI_ONE_TAKE_TRANSITIONS",
	dissolve: "JIANYING_DISSOLVE_TRANSITIONS",
	split: "JIANYING_SPLIT_TRANSITIONS",
	glitch: "JIANYING_GLITCH_TRANSITIONS",
	light: "JIANYING_LIGHT_TRANSITIONS",
	emoji: "JIANYING_EMOJI_TRANSITIONS",
	slideshow: "JIANYING_SLIDESHOW_TRANSITIONS",
	blur: "JIANYING_BLUR_TRANSITIONS",
	distortion: "JIANYING_DISTORTION_TRANSITIONS",
	shooting: "JIANYING_SHOOTING_TRANSITIONS",
	camera: "JIANYING_CAMERA_TRANSITIONS",
	natural: "JIANYING_NATURAL_TRANSITIONS",
	variety: "JIANYING_VARIETY_TRANSITIONS",
	mg: "JIANYING_MG_TRANSITIONS",
};

const projectRoot = path.resolve(import.meta.dir, "../..");

function manifestPath(): string {
	const optionIndex = Bun.argv.indexOf("--manifest");
	const value = optionIndex >= 0 ? Bun.argv[optionIndex + 1] : undefined;
	return value
		? path.resolve(value)
		: path.join(
				projectRoot,
				".local/jianying-runtime/category-forty/selection.json"
			);
}

function isRecord({
	value,
}: {
	value: unknown;
}): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireCategoryId({ value }: { value: unknown }): CategoryId {
	if (
		typeof value !== "string" ||
		!CATEGORY_IDS.includes(value as CategoryId)
	) {
		throw new Error(`Invalid category ID: ${String(value)}`);
	}
	return value as CategoryId;
}

function requireString({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Invalid ${name}.`);
	}
	return value;
}

function requireNumber({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`Invalid ${name}.`);
	}
	return value;
}

function requirePositiveInteger({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): number {
	const parsed = requireNumber({ name, value });
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid ${name}.`);
	}
	return parsed;
}

function requireBoolean({
	name,
	value,
}: {
	name: string;
	value: unknown;
}): boolean {
	if (typeof value !== "boolean") throw new Error(`Invalid ${name}.`);
	return value;
}

function parseTransition({ value }: { value: unknown }): SelectedTransition {
	if (!isRecord({ value })) throw new Error("Invalid transition entry.");
	const metadataMd5 = requireString({
		name: "metadata MD5",
		value: value.metadataMd5,
	});
	if (!/^[a-f\d]{32}$/i.test(metadataMd5)) {
		throw new Error(`Invalid metadata MD5: ${metadataMd5}`);
	}
	return {
		categoryId: requireCategoryId({ value: value.categoryId }),
		sourceGroup: requireCategoryId({ value: value.sourceGroup }),
		title: requireString({ name: "title", value: value.title }),
		resourceId: requireString({ name: "resource ID", value: value.resourceId }),
		metadataMd5,
		durationSeconds: requireNumber({
			name: "duration",
			value: value.durationSeconds,
		}),
		overlap: requireBoolean({ name: "overlap", value: value.overlap }),
		isVip: requireBoolean({ name: "VIP flag", value: value.isVip }),
	};
}

function parseCategory({ value }: { value: unknown }): ParsedCategory {
	if (!isRecord({ value }) || !Array.isArray(value.transitions)) {
		throw new Error("Invalid category entry.");
	}
	const id = requireCategoryId({ value: value.id });
	const transitions = value.transitions.map((transition) =>
		parseTransition({ value: transition })
	);
	if (transitions.some((transition) => transition.categoryId !== id)) {
		throw new Error(`Category mismatch in ${id}.`);
	}
	return {
		id,
		...(value.target === undefined
			? {}
			: {
					target: requirePositiveInteger({
						name: `${id} target`,
						value: value.target,
					}),
				}),
		count: requirePositiveInteger({
			name: "category count",
			value: value.count,
		}),
		transitions,
	};
}

function parseVersionThreeTargets({
	value,
}: {
	value: Record<string, unknown>;
}): CategoryTargets {
	if (!isRecord({ value: value.targets })) {
		throw new Error("Invalid category targets.");
	}
	return {
		aiGenerationPerCategory: requirePositiveInteger({
			name: "AI generation target",
			value: value.targets.aiGenerationPerCategory,
		}),
		binaryPerCategory: requirePositiveInteger({
			name: "binary transition target",
			value: value.targets.binaryPerCategory,
		}),
	};
}

function categoryTarget({
	categoryId,
	schemaVersion,
	minimumPerCategory,
	targets,
}: {
	categoryId: CategoryId;
	schemaVersion: 2 | 3;
	minimumPerCategory?: number;
	targets?: CategoryTargets;
}): number {
	if (schemaVersion === 2 && minimumPerCategory !== undefined) {
		return minimumPerCategory;
	}
	if (!targets) throw new Error("Missing category targets.");
	return categoryId === "ai-one-take"
		? targets.aiGenerationPerCategory
		: targets.binaryPerCategory;
}

function parseManifest({ value }: { value: unknown }): SelectionManifest {
	if (!isRecord({ value }) || !Array.isArray(value.categories)) {
		throw new Error("Invalid selection manifest.");
	}
	if (value.schemaVersion !== 2 && value.schemaVersion !== 3)
		throw new Error("Unsupported manifest schema.");
	const schemaVersion = value.schemaVersion;
	const parsedCategories = value.categories.map((category) =>
		parseCategory({ value: category })
	);
	const minimumPerCategory =
		schemaVersion === 2
			? requirePositiveInteger({
					name: "minimum per category",
					value: value.minimumPerCategory,
				})
			: undefined;
	const targets =
		schemaVersion === 3 ? parseVersionThreeTargets({ value }) : undefined;
	const categories = parsedCategories.map((category) => {
		const target = categoryTarget({
			categoryId: category.id,
			schemaVersion,
			minimumPerCategory,
			targets,
		});
		if (schemaVersion === 3 && category.target !== target) {
			throw new Error(`Category target mismatch in ${category.id}.`);
		}
		return { ...category, target };
	});
	const selectedCount = requirePositiveInteger({
		name: "selected count",
		value: value.selectedCount,
	});
	if (categories.length !== CATEGORY_IDS.length) {
		throw new Error(`Expected ${CATEGORY_IDS.length} categories.`);
	}
	for (const categoryId of CATEGORY_IDS) {
		const category = categories.find(
			(candidate) => candidate.id === categoryId
		);
		if (!category) throw new Error(`Missing category ${categoryId}.`);
		const countMatchesTarget =
			schemaVersion === 2
				? category.transitions.length >= category.target
				: category.transitions.length === category.target;
		if (!countMatchesTarget) {
			throw new Error(`Category ${categoryId} does not meet its target.`);
		}
		if (category.count !== category.transitions.length) {
			throw new Error(`Category count mismatch in ${categoryId}.`);
		}
	}
	const transitions = categories.flatMap((category) => category.transitions);
	if (transitions.length !== selectedCount) {
		throw new Error("Selected transition count mismatch.");
	}
	if (
		new Set(transitions.map((transition) => transition.resourceId)).size !==
		selectedCount
	) {
		throw new Error("Transition resource IDs must be unique.");
	}
	return {
		schemaVersion,
		selectedCount,
		categories,
	};
}

function quoted({ value }: { value: string }): string {
	return JSON.stringify(value);
}

function renderTransition({
	categoryId,
	transition,
}: {
	categoryId: CategoryId;
	transition: SelectedTransition;
}): string {
	const sourceGroup =
		transition.sourceGroup === categoryId
			? ""
			: `\n\t\t\tsourceGroup: ${quoted({ value: transition.sourceGroup })},`;
	return `\t\t{\n\t\t\tlocalizedName: ${quoted({ value: transition.title })},\n\t\t\tresourceId: ${quoted({ value: transition.resourceId })},\n\t\t\tmetadataMd5: ${quoted({ value: transition.metadataMd5 })},\n\t\t\tdefaultDuration: ${transition.durationSeconds},\n\t\t\toverlap: ${transition.overlap},\n\t\t\taccess: ${quoted({ value: transition.isVip ? "vip" : "free" })},${sourceGroup}\n\t\t},`;
}

function renderCategory({ category }: { category: SelectedCategory }): string {
	const transitions = category.transitions
		.map((transition) =>
			renderTransition({ categoryId: category.id, transition })
		)
		.join("\n");
	return `import { defineJianyingCategory } from "../catalog-factory.js";\n\nexport const ${EXPORT_NAMES[category.id]} = defineJianyingCategory({\n\tgroup: ${quoted({ value: category.id })},\n\tsources: [\n${transitions}\n\t],\n});\n`;
}

async function run() {
	const manifest = parseManifest({
		value: await Bun.file(manifestPath()).json(),
	});
	const outputRoot = path.join(
		projectRoot,
		"electron/jianying-transition/catalog-categories"
	);
	await mkdir(outputRoot, { recursive: true });
	await Promise.all(
		manifest.categories.map((category) =>
			writeFile(
				path.join(outputRoot, `${category.id}.ts`),
				renderCategory({ category })
			)
		)
	);
	console.log(
		JSON.stringify(
			{ outputRoot, generated: manifest.categories.length },
			null,
			2
		)
	);
}

await run();
