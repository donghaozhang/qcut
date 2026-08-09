#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import {
	findTransitionCategories,
	findTransitionRecords,
	resolveTransitionDatabasePaths,
	type TransitionCatalogRecord,
} from "../../.agents/skills/qcut-toolkit/jianying-transition-reference/scripts/transition-catalog";

const MINIMUM_PER_CATEGORY = 5;
const DOWNLOAD_CONCURRENCY = 4;
const projectRoot = path.resolve(import.meta.dir, "../..");
const cacheRoot = path.join(os.homedir(), "Movies/JianyingPro/User Data/Cache");
const outputRoot = path.join(
	projectRoot,
	".local/jianying-runtime/category-five"
);
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

const preservedCategoryByResourceId = new Map<string, CategoryId>([
	["7049979667406656014", "camera"],
	["6748289440130535947", "slideshow"],
	["7343136487182963211", "light"],
	["6858191556055142919", "mg"],
	["6789847331060584974", "slideshow"],
	["6858191541706428941", "mg"],
	["6747989545448378888", "slideshow"],
	["6747865141120864779", "slideshow"],
	["6748313807031898627", "slideshow"],
	["7046293801123451405", "glitch"],
	["6914112332205396488", "dissolve"],
	["6858191448827761160", "mg"],
	["7252544245444121148", "camera"],
	["7034446419641504264", "slideshow"],
	["6949828109663212045", "light"],
	["6724239584663704071", "camera"],
	["6748286529921094157", "slideshow"],
	["7341295618863665690", "camera"],
	["7246288124110705209", "camera"],
	["7450031574923350555", "blur"],
]);

interface CatalogDownload {
	resourceId: string;
	metadataMd5: string;
	itemUrl: string;
}

interface SelectedTransition {
	categoryId: CategoryId;
	categoryLabel: string;
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
	schemaVersion: 1;
	minimumPerCategory: number;
	selectedCount: number;
	categories: Array<{
		id: CategoryId;
		label: string;
		count: number;
		transitions: SelectedTransition[];
	}>;
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
		downloads.set(resourceId, { resourceId, metadataMd5, itemUrl });
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
	record,
}: {
	categoryId: CategoryId;
	categoryLabel: string;
	record: TransitionCatalogRecord;
}): SelectedTransition {
	const runtimeKind =
		categoryId === "ai-one-take" ? "ai-generation" : "transition-segment";
	return {
		categoryId,
		categoryLabel,
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
	const selectedCategories: SelectionManifest["categories"] = [];
	for (const definition of categoryDefinitions) {
		const category = categories.find(
			(candidate) => candidate.key === definition.databaseKey
		);
		if (!category)
			throw new Error(`Missing Jianying category ${definition.label}.`);
		const categoryRecords = records.filter(
			(record) =>
				record.categoryIds.includes(category.id) &&
				downloads.has(record.resourceId) &&
				Boolean(record.metadataMd5)
		);
		const preserved = categoryRecords.filter(
			(record) =>
				preservedCategoryByResourceId.get(record.resourceId) === definition.id
		);
		for (const record of preserved) usedResourceIds.add(record.resourceId);
		const needed = Math.max(0, MINIMUM_PER_CATEGORY - preserved.length);
		const additions = categoryRecords
			.filter((record) => {
				if (usedResourceIds.has(record.resourceId)) return false;
				if (definition.id === "ai-one-take") return true;
				return (
					record.defaultDurationSeconds !== null && record.isOverlap !== null
				);
			})
			.sort((left, right) => candidateOrder({ left, right }))
			.slice(0, needed);
		if (preserved.length + additions.length < MINIMUM_PER_CATEGORY) {
			throw new Error(`Not enough candidates for ${definition.label}.`);
		}
		for (const record of additions) usedResourceIds.add(record.resourceId);
		const selected = [...preserved, ...additions].map((record) =>
			selectedTransition({
				categoryId: definition.id,
				categoryLabel: definition.label,
				record,
			})
		);
		selectedCategories.push({
			id: definition.id,
			label: definition.label,
			count: selected.length,
			transitions: selected,
		});
	}
	return {
		schemaVersion: 1,
		minimumPerCategory: MINIMUM_PER_CATEGORY,
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
	return [
		packageOutputRoot,
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
			const download = downloads.get(transition.resourceId);
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
	const shouldDownload = Bun.argv.includes("--download");
	const selected = manifest.categories.flatMap(
		(category) => category.transitions
	);
	const packageResults = shouldDownload
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
