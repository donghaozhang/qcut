import { dirname } from "node:path";
import type {
	JianyingFilterCatalogCard,
	JianyingFilterCatalogExport,
} from "../jianying-filter-catalog-export.js";
import { inspectJianyingFilterPackages } from "../jianying-filter-package-inspector.js";
import { tiledReferencesFromPackages } from "../jianying-filter-lab-catalog.js";
import {
	jianyingFilterCacheRoots,
	listJianyingLutReferences,
	loadJianyingLut,
} from "../native-pipeline/filters/filter-lab-lut.js";
import { loadTiledLutCube } from "../native-pipeline/filters/filter-lab-tiled-lut.js";
import {
	QCUT_FOG_RESOURCE,
	QCUT_FOG_VERSION,
	type IndependentFilterIdentity,
} from "./contract.js";
import { validateIndependentCube, type IndependentCube } from "./lut-data.js";
import { supportsIndependentGraph } from "./graph-data.js";
import { findIndependentGraphProfile } from "./graph-profiles.js";

export function supportsIndependentLut({
	card,
}: {
	card: JianyingFilterCatalogCard;
}) {
	if (
		!card.available ||
		card.cacheStatus !== "cached" ||
		!card.version ||
		card.lutCount !== 1
	)
		return false;
	if (
		card.sdkModel ||
		card.requirements?.some((requirement) => requirement !== "blit")
	)
		return false;
	if (card.implementation === "single-lut") return true;
	return (
		card.implementation === "shader" &&
		card.tiledRendererKind === "tiled-lut-8x8" &&
		!card.multiPassKind
	);
}

export function selectIndependentCatalog({
	catalog,
}: {
	catalog: JianyingFilterCatalogExport;
}): JianyingFilterCatalogExport {
	const fog: JianyingFilterCatalogCard = {
		resourceId: QCUT_FOG_RESOURCE,
		version: QCUT_FOG_VERSION,
		title: "迷雾 / Fog",
		categories: ["多 Pass"],
		implementation: "shader",
		cacheStatus: "cached",
		available: true,
		verification: "unverified",
		lutCount: 1,
		independentKind: "fog",
	};
	const cards = [
		fog,
		...catalog.cards.filter(
			(card) =>
				card.resourceId !== QCUT_FOG_RESOURCE &&
				(supportsIndependentLut({ card }) || supportsIndependentGraph({ card }))
		),
	].map((card) => {
		const profile = findIndependentGraphProfile({
			identity: { resourceId: card.resourceId, version: card.version! },
		});
		return {
			...card,
			...(profile?.dualLut
				? { maskProvider: "jianying-local-skin-v1" as const }
				: {}),
			verification: "unverified" as const,
			independentKind:
				card.independentKind ?? profile?.kind ?? ("lut" as const),
		};
	});
	return { count: cards.length, cards };
}

async function exportCatalog(): Promise<JianyingFilterCatalogExport> {
	const specifier = "../jianying-filter-catalog-export.js";
	const exporter = (await import(
		specifier
	)) as typeof import("../jianying-filter-catalog-export.js");
	return exporter.exportJianyingFilterCatalog();
}

let cached: Promise<JianyingFilterCatalogExport> | undefined;
let expires = 0;
export function listIndependentFilters({
	refresh = false,
	exporter = exportCatalog,
}: {
	refresh?: boolean;
	exporter?: () => Promise<JianyingFilterCatalogExport>;
} = {}) {
	if (refresh || !cached || Date.now() >= expires) {
		expires = Date.now() + 60_000;
		cached = exporter()
			.then((catalog) => selectIndependentCatalog({ catalog }))
			.catch((error) => {
				cached = undefined;
				throw error;
			});
	}
	return cached;
}

export function parseIndependentIdentity({
	request,
}: {
	request: unknown;
}): IndependentFilterIdentity {
	if (
		!request ||
		typeof request !== "object" ||
		!("resourceId" in request) ||
		!("version" in request) ||
		typeof request.resourceId !== "string" ||
		!/^\d{1,30}$/.test(request.resourceId) ||
		typeof request.version !== "string" ||
		!/^[a-f0-9]{32}$/i.test(request.version)
	) {
		throw new Error(
			"Independent filter requires an exact resource ID and version."
		);
	}
	return { resourceId: request.resourceId, version: request.version };
}

export async function loadIndependentCube({
	card,
}: {
	card: JianyingFilterCatalogCard;
}): Promise<IndependentCube> {
	if (!supportsIndependentLut({ card }))
		throw new Error("This card is not a supported independent LUT.");
	const references = (await listJianyingLutReferences()).filter(
		(reference) =>
			reference.resourceId === card.resourceId &&
			reference.version === card.version &&
			reference.size <= 65
	);
	const cacheRoots = [...new Set(jianyingFilterCacheRoots().map(dirname))];
	const packages = await inspectJianyingFilterPackages({
		filters: [card],
		references,
		cacheRoots,
	});
	const summary = packages.get(card.resourceId);
	if (
		!summary ||
		summary.cacheStatus !== "cached" ||
		summary.multiPassRenderer ||
		summary.dualRenderer ||
		summary.nativePortraitRenderer ||
		summary.nativeFaceRegionRenderer ||
		summary.implementation === "face-ai"
	) {
		throw new Error(
			"Filter package changed or requires a non-LUT renderer. Refresh the catalog."
		);
	}
	const tiled = [
		...tiledReferencesFromPackages({ packages, cacheRoots }).values(),
	].filter((reference) => reference.version === card.version);
	const candidates = tiled.length ? tiled : references;
	if (candidates.length !== 1 || candidates[0].role !== "single")
		throw new Error("Expected exactly one version-matched, single LUT.");
	const reference = candidates[0];
	const cube = tiled.length
		? await loadTiledLutCube({ filePath: reference.filePath })
		: (await loadJianyingLut({ reference }))?.cube;
	if (!cube) throw new Error("Local LUT could not be decoded.");
	return validateIndependentCube({ cube });
}
