#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { constants, readdirSync } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { Database } from "bun:sqlite";
import { JIANYING_TRANSITIONS } from "../../electron/jianying-transition-catalog";
import {
	findTransitionCategories,
	findTransitionRecords,
	resolveTransitionDatabasePaths,
	type TransitionCatalogRecord,
} from "../../.agents/skills/qcut-toolkit/jianying-transition-reference/scripts/transition-catalog";

const AI_TRANSITIONS_PER_CATEGORY = 20;
const DEFAULT_BINARY_TRANSITIONS_PER_CATEGORY = 40;
const DOWNLOAD_CONCURRENCY = 4;
const projectRoot = path.resolve(import.meta.dir, "../..");
const cacheRoot = path.join(os.homedir(), "Movies/JianyingPro/User Data/Cache");

interface PreparationOptions {
	binaryPerCategory: number;
	download: boolean;
	outputRoot: string;
}

function positiveInteger({ name, value }: { name: string; value: string }) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer.`);
	}
	return parsed;
}

function defaultOutputRoot({
	binaryPerCategory,
}: {
	binaryPerCategory: number;
}) {
	const directoryName =
		binaryPerCategory === 20
			? "category-twenty"
			: binaryPerCategory === 40
				? "category-forty"
				: `category-${binaryPerCategory}`;
	return path.join(projectRoot, ".local/jianying-runtime", directoryName);
}

function parseOptions(): PreparationOptions {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"binary-per-category": { type: "string" },
			download: { type: "boolean" },
			"output-root": { type: "string" },
		},
		strict: true,
	});
	const binaryPerCategory = positiveInteger({
		name: "binary-per-category",
		value:
			values["binary-per-category"] ??
			String(DEFAULT_BINARY_TRANSITIONS_PER_CATEGORY),
	});
	return {
		binaryPerCategory,
		download: values.download ?? false,
		outputRoot: path.resolve(
			values["output-root"] ?? defaultOutputRoot({ binaryPerCategory })
		),
	};
}

const options = parseOptions();
const outputRoot = options.outputRoot;
const packageOutputRoot = path.join(outputRoot, "packages");
const archiveOutputRoot = path.join(outputRoot, "archives");

const categoryDefinitions = [
	{
		id: "ai-one-take",
		label: "AI 一镜到底",
		databaseKey: "ai_transition_test",
	},
	{ id: "dissolve", label: "叠化", databaseKey: "diehua123" },
	{ id: "split", label: "分割", databaseKey: "fenge123" },
	{ id: "glitch", label: "故障", databaseKey: "guzhang123" },
	{ id: "light", label: "光效", databaseKey: "guangxiao123" },
	{ id: "emoji", label: "互动 emoji", databaseKey: "hudongemoji123" },
	{ id: "slideshow", label: "幻灯片", databaseKey: "huandengpian123" },
	{ id: "blur", label: "模糊", databaseKey: "mohu123" },
	{ id: "distortion", label: "扭曲", databaseKey: "niuqu123" },
	{ id: "shooting", label: "拍摄", databaseKey: "paishe123" },
	{ id: "camera", label: "运镜", databaseKey: "yunjing123" },
	{ id: "natural", label: "自然", databaseKey: "ziran123" },
	{ id: "variety", label: "综艺", databaseKey: "zongyi123" },
	{ id: "mg", label: "MG 动画", databaseKey: "mgdonghua123" },
] as const;

type CategoryId = (typeof categoryDefinitions)[number]["id"];

const supplementalSourceGroups: Readonly<
	Partial<Record<CategoryId, readonly CategoryId[]>>
> = {
	emoji: ["variety", "natural", "light", "mg", "split"],
	distortion: ["blur", "camera", "glitch", "slideshow"],
	mg: ["split", "light", "dissolve"],
};

interface CatalogDownload {
	resourceId: string;
	metadataMd5: string;
	itemUrl: string;
}

interface SelectedTransition {
	categoryId: CategoryId;
	categoryLabel: string;
	sourceGroup: CategoryId;
	title: string;
	resourceId: string;
	metadataMd5: string;
	durationSeconds: number;
	overlap: boolean;
	isVip: boolean;
	publishSource: string;
	runtimeKind: "ai-generation" | "transition-segment";
}

interface SelectionManifest {
	schemaVersion: 3;
	targets: {
		aiGenerationPerCategory: number;
		binaryPerCategory: number;
	};
	selectedCount: number;
	categories: Array<{
		id: CategoryId;
		label: string;
		target: number;
		count: number;
		transitions: SelectedTransition[];
	}>;
}

function downloadKey({
	resourceId,
	metadataMd5,
}: {
	resourceId: string;
	metadataMd5: string;
}): string {
	return `${resourceId}:${metadataMd5}`;
}

function objectValue({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function stringValue({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}

function collectDownloads({
	value,
	downloads,
}: {
	value: unknown;
	downloads: Map<string, CatalogDownload>;
}): void {
	if (Array.isArray(value)) {
		for (const child of value) collectDownloads({ value: child, downloads });
		return;
	}
	const record = objectValue({ value });
	if (!record) return;
	const common = objectValue({ value: record.common_attr });
	const resourceId = stringValue({ value: common?.id });
	const metadataMd5 = stringValue({ value: common?.md5 });
	const itemUrls = Array.isArray(common?.item_urls) ? common.item_urls : [];
	const itemUrl = stringValue({ value: itemUrls[0] });
	if (resourceId && metadataMd5 && itemUrl) {
		downloads.set(downloadKey({ resourceId, metadataMd5 }), {
			resourceId,
			metadataMd5,
			itemUrl,
		});
	}
	for (const child of Object.values(record)) {
		collectDownloads({ value: child, downloads });
	}
}

function readCatalogDownloads({
	databasePaths,
}: {
	databasePaths: string[];
}): Map<string, CatalogDownload> {
	const downloads = new Map<string, CatalogDownload>();
	for (const databasePath of databasePaths) {
		const database = new Database(databasePath, { readonly: true });
		try {
			const rows = database
				.query<{ response_body: string }, []>(
					"SELECT response_body FROM http_cache WHERE json_valid(response_body)"
				)
				.all();
			for (const row of rows) {
				collectDownloads({ value: JSON.parse(row.response_body), downloads });
			}
		} finally {
			database.close();
		}
	}
	return downloads;
}

function candidateOrder({
	left,
	right,
}: {
	left: TransitionCatalogRecord;
	right: TransitionCatalogRecord;
}): number {
	const leftVip = left.access.isVip === true ? 1 : 0;
	const rightVip = right.access.isVip === true ? 1 : 0;
	if (leftVip !== rightVip) return leftVip - rightVip;
	const titleOrder = left.title.localeCompare(right.title, "zh-CN");
	return titleOrder || left.resourceId.localeCompare(right.resourceId);
}

function selectedTransition({
	categoryId,
	categoryLabel,
	sourceGroup,
	record,
}: {
	categoryId: CategoryId;
	categoryLabel: string;
	sourceGroup: CategoryId;
	record: TransitionCatalogRecord;
}): SelectedTransition {
	const runtimeKind =
		categoryId === "ai-one-take" ? "ai-generation" : "transition-segment";
	return {
		categoryId,
		categoryLabel,
		sourceGroup,
		title: record.title,
		resourceId: record.resourceId,
		metadataMd5: record.metadataMd5,
		durationSeconds: record.defaultDurationSeconds ?? 3,
		overlap: record.isOverlap ?? true,
		isVip: record.access.isVip === true,
		publishSource: record.publishSource,
		runtimeKind,
	};
}

function recordHasPackage({
	record,
	downloads,
}: {
	record: TransitionCatalogRecord;
	downloads: ReadonlyMap<string, CatalogDownload>;
}): boolean {
	return downloads.has(
		downloadKey({
			resourceId: record.resourceId,
			metadataMd5: record.metadataMd5,
		})
	);
}

function recordHasRuntimeMetadata({
	record,
	targetGroup,
}: {
	record: TransitionCatalogRecord;
	targetGroup: CategoryId;
}): boolean {
	if (targetGroup === "ai-one-take") return true;
	return record.defaultDurationSeconds !== null && record.isOverlap !== null;
}

function latestRecordsByResourceId({
	records,
}: {
	records: TransitionCatalogRecord[];
}): TransitionCatalogRecord[] {
	const latestByResourceId = new Map<string, TransitionCatalogRecord>();
	for (const record of records) {
		const current = latestByResourceId.get(record.resourceId);
		if (!current || record.observedAt > current.observedAt) {
			latestByResourceId.set(record.resourceId, record);
		}
	}
	return [...latestByResourceId.values()];
}

function findSelectedRecord({
	records,
	resourceId,
	metadataMd5,
	downloads,
	targetGroup,
}: {
	records: TransitionCatalogRecord[];
	resourceId: string;
	metadataMd5?: string;
	downloads: ReadonlyMap<string, CatalogDownload>;
	targetGroup: CategoryId;
}): TransitionCatalogRecord | undefined {
	return records
		.filter(
			(record) =>
				record.resourceId === resourceId &&
				(!metadataMd5 || record.metadataMd5 === metadataMd5) &&
				recordHasPackage({ record, downloads }) &&
				recordHasRuntimeMetadata({ record, targetGroup })
		)
		.sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
}

function targetForCategory({ categoryId }: { categoryId: CategoryId }) {
	return categoryId === "ai-one-take"
		? AI_TRANSITIONS_PER_CATEGORY
		: options.binaryPerCategory;
}

interface CategorySelectionState {
	category: ReturnType<typeof findTransitionCategories>[number];
	definition: (typeof categoryDefinitions)[number];
	target: number;
	preserved: SelectedTransition[];
	additions: SelectedTransition[];
	supplements: SelectedTransition[];
}

function categoryRecordsByGroup({
	records,
	downloads,
	states,
}: {
	records: TransitionCatalogRecord[];
	downloads: ReadonlyMap<string, CatalogDownload>;
	states: CategorySelectionState[];
}): ReadonlyMap<CategoryId, TransitionCatalogRecord[]> {
	return new Map(
		states.map(({ category, definition }) => {
			const categoryRecords = latestRecordsByResourceId({
				records: records.filter(
					(record) =>
						record.categoryIds.includes(category.id) &&
						Boolean(record.metadataMd5) &&
						recordHasPackage({ record, downloads }) &&
						recordHasRuntimeMetadata({
							record,
							targetGroup: definition.id,
						})
				),
			}).sort((left, right) => candidateOrder({ left, right }));
			return [definition.id, categoryRecords] as const;
		})
	);
}

function reservePreservedTransitions({
	states,
	usedResourceIds,
}: {
	states: CategorySelectionState[];
	usedResourceIds: Set<string>;
}) {
	for (const state of states) {
		for (const transition of state.preserved) {
			if (usedResourceIds.has(transition.resourceId)) {
				throw new Error(
					`Duplicate preserved resource ${transition.resourceId}.`
				);
			}
			usedResourceIds.add(transition.resourceId);
		}
	}
}

function selectDirectAdditions({
	recordsByGroup,
	states,
	usedResourceIds,
}: {
	recordsByGroup: ReadonlyMap<CategoryId, TransitionCatalogRecord[]>;
	states: CategorySelectionState[];
	usedResourceIds: Set<string>;
}) {
	for (const state of states) {
		const needed = state.target - state.preserved.length;
		state.additions = (recordsByGroup.get(state.definition.id) ?? [])
			.filter((record) => !usedResourceIds.has(record.resourceId))
			.slice(0, needed)
			.map((record) =>
				selectedTransition({
					categoryId: state.definition.id,
					categoryLabel: state.definition.label,
					sourceGroup: state.definition.id,
					record,
				})
			);
		for (const transition of state.additions) {
			usedResourceIds.add(transition.resourceId);
		}
	}
}

function selectSupplements({
	recordsByGroup,
	states,
	usedResourceIds,
}: {
	recordsByGroup: ReadonlyMap<CategoryId, TransitionCatalogRecord[]>;
	states: CategorySelectionState[];
	usedResourceIds: Set<string>;
}) {
	for (const state of states) {
		let needed = state.target - state.preserved.length - state.additions.length;
		for (const sourceGroup of supplementalSourceGroups[state.definition.id] ??
			[]) {
			if (needed === 0) break;
			const records = (recordsByGroup.get(sourceGroup) ?? [])
				.filter((record) => !usedResourceIds.has(record.resourceId))
				.slice(0, needed);
			const supplements = records.map((record) =>
				selectedTransition({
					categoryId: state.definition.id,
					categoryLabel: state.definition.label,
					sourceGroup,
					record,
				})
			);
			state.supplements.push(...supplements);
			for (const transition of supplements) {
				usedResourceIds.add(transition.resourceId);
			}
			needed -= supplements.length;
		}
		if (needed > 0) {
			throw new Error(
				`Not enough candidates for ${state.definition.label}: ${state.target - needed}/${state.target}.`
			);
		}
	}
}

function buildSelection({
	records,
	categories,
	downloads,
}: {
	records: TransitionCatalogRecord[];
	categories: ReturnType<typeof findTransitionCategories>;
	downloads: ReadonlyMap<string, CatalogDownload>;
}): SelectionManifest {
	const usedResourceIds = new Set<string>();
	const states = categoryDefinitions.map((definition) => {
		const category = categories.find(
			(candidate) => candidate.key === definition.databaseKey
		);
		if (!category)
			throw new Error(`Missing Jianying category ${definition.label}.`);
		const target = targetForCategory({ categoryId: definition.id });
		const preservedDefinitions = JIANYING_TRANSITIONS.filter(
			(transition) => transition.group === definition.id
		);
		if (preservedDefinitions.length > target) {
			throw new Error(
				`Target ${target} cannot preserve ${preservedDefinitions.length} existing ${definition.label} transitions.`
			);
		}
		const preserved = preservedDefinitions.map((transition) => {
			const record = findSelectedRecord({
				records,
				resourceId: transition.resourceId,
				metadataMd5: transition.metadataMd5,
				downloads,
				targetGroup: definition.id,
			});
			if (!record) {
				throw new Error(
					`Could not preserve ${transition.localizedName} (${transition.resourceId}).`
				);
			}
			return selectedTransition({
				categoryId: definition.id,
				categoryLabel: definition.label,
				sourceGroup: transition.sourceGroup,
				record,
			});
		});
		return {
			category,
			definition,
			target,
			preserved,
			additions: [],
			supplements: [],
		} satisfies CategorySelectionState;
	});
	reservePreservedTransitions({ states, usedResourceIds });
	const recordsByGroup = categoryRecordsByGroup({
		records,
		downloads,
		states,
	});
	selectDirectAdditions({ recordsByGroup, states, usedResourceIds });
	selectSupplements({ recordsByGroup, states, usedResourceIds });
	const selectedCategories = states.map((state) => {
		const transitions = [
			...state.preserved,
			...state.additions,
			...state.supplements,
		];
		return {
			id: state.definition.id,
			label: state.definition.label,
			target: state.target,
			count: transitions.length,
			transitions,
		};
	});
	return {
		schemaVersion: 3,
		targets: {
			aiGenerationPerCategory: AI_TRANSITIONS_PER_CATEGORY,
			binaryPerCategory: options.binaryPerCategory,
		},
		selectedCount: selectedCategories.reduce(
			(total, category) => total + category.count,
			0
		),
		categories: selectedCategories,
	};
}

async function pathExists({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function packageRoots(): string[] {
	const preparedRoot = path.join(projectRoot, ".local/jianying-runtime");
	let preparedPackages: string[] = [];
	try {
		preparedPackages = readdirSync(preparedRoot, { withFileTypes: true })
			.filter(
				(entry) => entry.isDirectory() && entry.name.startsWith("category-")
			)
			.map((entry) => path.join(preparedRoot, entry.name, "packages"));
	} catch {
		preparedPackages = [];
	}
	return [
		packageOutputRoot,
		...preparedPackages,
		path.join(projectRoot, ".local/jianying-runtime/new-twenty/packages"),
		path.join(cacheRoot, "effect"),
		path.join(
			os.homedir(),
			"Library/Containers/com.lemon.lvpro/Data/Movies/JianyingPro/User Data/Cache/effect"
		),
	];
}

async function findExistingPackage({
	transition,
}: {
	transition: SelectedTransition;
}): Promise<string | null> {
	const candidates = packageRoots().flatMap((root) => [
		path.join(root, transition.resourceId, transition.metadataMd5),
		path.join(root, transition.metadataMd5),
	]);
	const checks = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			exists: await pathExists({
				filePath: path.join(candidate, "config.json"),
			}),
		}))
	);
	return checks.find((check) => check.exists)?.candidate ?? null;
}

async function requireSafeZip({ archivePath }: { archivePath: string }) {
	const child = Bun.spawn(["unzip", "-Z1", archivePath], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (code !== 0)
		throw new Error(`Could not inspect archive: ${stderr.trim()}`);
	const unsafe = stdout
		.split("\n")
		.filter(Boolean)
		.find((entry) => path.isAbsolute(entry) || entry.split("/").includes(".."));
	if (unsafe) throw new Error(`Unsafe package archive entry: ${unsafe}`);
}

async function extractPackage({
	archivePath,
	packagePath,
}: {
	archivePath: string;
	packagePath: string;
}) {
	await requireSafeZip({ archivePath });
	await rm(packagePath, { recursive: true, force: true });
	await mkdir(packagePath, { recursive: true });
	const child = Bun.spawn(["unzip", "-qq", archivePath, "-d", packagePath], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	if (code !== 0)
		throw new Error(`Could not extract package: ${stderr.trim()}`);
	if (
		!(await pathExists({ filePath: path.join(packagePath, "config.json") }))
	) {
		throw new Error(`Package ${packagePath} does not contain config.json.`);
	}
}

async function downloadPackage({
	transition,
	download,
}: {
	transition: SelectedTransition;
	download: CatalogDownload;
}): Promise<{ resourceId: string; packagePath: string; downloaded: boolean }> {
	const existing = await findExistingPackage({ transition });
	if (existing) {
		return {
			resourceId: transition.resourceId,
			packagePath: existing,
			downloaded: false,
		};
	}
	const response = await fetch(download.itemUrl);
	if (!response.ok) {
		throw new Error(
			`Package download failed for ${transition.title}: ${response.status}`
		);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	const actualMd5 = createHash("md5").update(bytes).digest("hex");
	if (actualMd5 !== transition.metadataMd5) {
		throw new Error(`Package MD5 mismatch for ${transition.title}.`);
	}
	await mkdir(archiveOutputRoot, { recursive: true });
	const archivePath = path.join(
		archiveOutputRoot,
		`${transition.resourceId}-${transition.metadataMd5}.zip`
	);
	await writeFile(archivePath, bytes);
	const packagePath = path.join(
		packageOutputRoot,
		transition.resourceId,
		transition.metadataMd5
	);
	await extractPackage({ archivePath, packagePath });
	return { resourceId: transition.resourceId, packagePath, downloaded: true };
}

async function downloadBatches({
	remaining,
	downloads,
}: {
	remaining: SelectedTransition[];
	downloads: ReadonlyMap<string, CatalogDownload>;
}): Promise<
	Array<{ resourceId: string; packagePath: string; downloaded: boolean }>
> {
	if (remaining.length === 0) return [];
	const batch = remaining.slice(0, DOWNLOAD_CONCURRENCY);
	const rest = remaining.slice(DOWNLOAD_CONCURRENCY);
	const completed = await Promise.all(
		batch.map((transition) => {
			const download = downloads.get(
				downloadKey({
					resourceId: transition.resourceId,
					metadataMd5: transition.metadataMd5,
				})
			);
			if (!download)
				throw new Error(`Missing package URL for ${transition.title}.`);
			return downloadPackage({ transition, download });
		})
	);
	return [
		...completed,
		...(await downloadBatches({ remaining: rest, downloads })),
	];
}

async function run() {
	const databasePaths = resolveTransitionDatabasePaths({ cacheRoot });
	if (databasePaths.length === 0)
		throw new Error("No Jianying catalog database found.");
	const categories = findTransitionCategories({ databasePaths });
	const records = findTransitionRecords({ databasePaths });
	const downloads = readCatalogDownloads({ databasePaths });
	const manifest = buildSelection({ records, categories, downloads });
	await mkdir(outputRoot, { recursive: true });
	const manifestPath = path.join(outputRoot, "selection.json");
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	const selected = manifest.categories
		.flatMap((category) => category.transitions)
		.filter((transition) => transition.runtimeKind === "transition-segment");
	const packageResults = options.download
		? await downloadBatches({ remaining: selected, downloads })
		: [];
	const downloadedCount = packageResults.filter(
		(result) => result.downloaded
	).length;
	const reusedCount = packageResults.length - downloadedCount;
	console.log(
		JSON.stringify(
			{
				manifestPath,
				selectedCount: manifest.selectedCount,
				categories: manifest.categories.map(({ id, label, count }) => ({
					id,
					label,
					count,
				})),
				downloadedCount,
				reusedCount,
			},
			null,
			2
		)
	);
}

await run();
