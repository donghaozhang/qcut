import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportCatalogDefault } from "../electron/native-pipeline/cli/cli-handlers-filter-lab-catalog.js";
import { jianyingFilterCacheRoots } from "../electron/native-pipeline/filters/filter-lab-lut.js";
import {
	selectIndependentCatalog,
	supportsIndependentLut,
} from "../electron/qcut-independent-filter/lut-catalog.js";
import { supportsIndependentGraph } from "../electron/qcut-independent-filter/graph-data.js";
import { QCUT_FOG_RESOURCE } from "../electron/qcut-independent-filter/contract.js";
import { mapWithConcurrency } from "../electron/lib/map-with-concurrency.js";

const { values } = parseArgs({ options: { output: { type: "string" } } });
if (!values.output)
	throw new Error("--output is required; package data is not written to Git.");
const catalog = await exportCatalogDefault();
const independent = selectIndependentCatalog({ catalog });
// The shared shelf may also contain non-Metal renderers, outside this migration audit.
const metalCards = independent.cards.filter(
	(card) =>
		card.resourceId === QCUT_FOG_RESOURCE ||
		supportsIndependentLut({ card }) ||
		supportsIndependentGraph({ card })
);
const supported = new Set(
	metalCards.map((card) => `${card.resourceId}/${card.version}`)
);
const remaining = catalog.cards.filter(
	(card) => !supported.has(`${card.resourceId}/${card.version}`)
);
const roots = [...new Set(jianyingFilterCacheRoots().map(dirname))].reverse();
const cards = await mapWithConcurrency({
	items: remaining,
	limit: 6,
	task: async ({ item: card }) => {
		const candidates = roots.flatMap((root) =>
			["artistEffect", "effect"].map((container) =>
				join(root, container, card.resourceId, card.version ?? "missing")
			)
		);
		const directories = await Promise.all(
			candidates.map(async (path) => {
				try {
					return (await stat(path)).isDirectory() ? path : null;
				} catch {
					return null;
				}
			})
		);
		const root = directories.find(Boolean);
		const files = root
			? await readdir(root, { recursive: true, withFileTypes: true })
			: [];
		if (files.length > 10000 || files.some((file) => file.isSymbolicLink()))
			throw new Error(`Unsafe package: ${card.resourceId}`);
		const background = files.filter(
			(file) =>
				file.isFile() && /^filter_bg\.(png|3dl(?:\.vf)?)$/.test(file.name)
		);
		const lutPairs = await Promise.all(
			background.map(async (file) => {
				const bgPath = join(file.parentPath, file.name);
				const skinPath = join(
					file.parentPath,
					file.name.replace("filter_bg", "filter_skin")
				);
				try {
					const sizes = await Promise.all(
						[bgPath, skinPath].map(async (path) => (await stat(path)).size)
					);
					if (sizes.some((size) => size > 16 * 1024 * 1024))
						throw new Error("LUT exceeds audit size limit");
					const [bg, skin] = await Promise.all([
						readFile(bgPath),
						readFile(skinPath),
					]);
					const extension = file.name.slice("filter_bg.".length);
					const formats: Record<string, string> = {
						png: "tiled",
						"3dl.vf": "vf",
						"3dl": "adobe-3dl",
					};
					return {
						format: formats[extension],
						equalBytes: bg.equals(skin),
						backgroundSha256: createHash("sha256").update(bg).digest("hex"),
						skinSha256: createHash("sha256").update(skin).digest("hex"),
					};
				} catch (error) {
					return {
						error: error instanceof Error ? error.message : String(error),
					};
				}
			})
		);
		return {
			resourceId: card.resourceId,
			version: card.version,
			title: card.title,
			implementation: card.implementation,
			availableInLegacyBackend: card.available,
			requirements: card.requirements ?? [],
			sdkModel: card.sdkModel,
			packagePresent: Boolean(root),
			fileCount: files.length,
			lutPairs,
			migrationComplete: false,
		};
	},
});
const counts: Record<string, number> = {};
for (const card of cards)
	counts[card.implementation] = (counts[card.implementation] ?? 0) + 1;
const result = {
	generatedAt: new Date().toISOString(),
	catalogCount: catalog.count,
	metalCatalogCount: metalCards.length,
	otherRendererCount: independent.count - metalCards.length,
	independentCount: metalCards.filter((card) => !card.maskProvider).length,
	hybridCount: metalCards.filter((card) => card.maskProvider).length,
	remainingCount: cards.length,
	counts,
	missingPackages: cards
		.filter((card) => !card.packagePresent)
		.map((card) => card.resourceId),
	boundary:
		"Equal LUT bytes alone do not prove mask independence: mix weights, sampling, alpha and other passes must also match. No model bypass is inferred.",
	cards,
};
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, cards: undefined, output }, null, 2));
