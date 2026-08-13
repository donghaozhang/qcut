/**
 * Full filter-card catalog export for the CLI (FLP-001).
 *
 * The Filter Lab IPC summary intentionally drops the long-tail
 * stratification fields (`requirements`, `sdkModel`, `effectId`,
 * `thirdResourceId`); this module assembles the same catalog the IPC
 * handler builds and joins those fields back on, so batch tooling can
 * stratify over capability tags instead of guessing.
 *
 * Exported data is LOCAL CATALOG METADATA ONLY: ids, titles, categories,
 * version hashes, capability tags, and verification status. No LUT pixels,
 * no shader source, no package contents — nothing that could reconstruct
 * an effect package (see docs/task/jianying-filter-runtime-research/
 * filter-parity-long-tail-plan.zh.md, FLP-001 停止条件).
 */
import {
	buildJianyingFilterLabCatalog,
	mergeKnownFiltersWithReferences,
} from "./jianying-filter-lab-catalog.js";
import type {
	JianyingFilterImplementation,
	JianyingFilterVerificationStatus,
} from "./jianying-filter-lab-contract.js";
import {
	findJianyingFilterTitle,
	scanJianyingFilterMetadata,
	type JianyingFilterMetadataScan,
} from "./jianying-filter-metadata.js";
import { JIANYING_NATIVE_PORTRAIT_PROFILES } from "./native-pipeline/filters/filter-lab-native-portrait.js";
import {
	inspectJianyingFilterPackages,
	type JianyingFilterPackageSummary,
} from "./jianying-filter-package-inspector.js";
import { readJianyingFilterVerifications } from "./jianying-filter-verification-store.js";
import {
	listJianyingLutReferences,
	type JianyingLutReference,
} from "./native-pipeline/filters/filter-lab-lut.js";

/** Matches the editor's own preview limit (MAX_EDITOR_LUT_SIZE). */
const MAX_EXPORT_LUT_SIZE = 65;

export interface JianyingFilterCatalogCard {
	resourceId: string;
	title: string;
	categories: string[];
	version?: string;
	effectId?: string;
	thirdResourceId?: string;
	/** Capability tags such as skin_seg / face_detect — the face-ai long tail. */
	requirements?: string[];
	sdkModel?: string;
	implementation: JianyingFilterImplementation;
	cacheStatus: JianyingFilterPackageSummary["cacheStatus"];
	available: boolean;
	verification: JianyingFilterVerificationStatus;
	/** Locally cached LUT files behind this card (count only). */
	lutCount: number;
	tiledRendererKind?: string;
	multiPassKind?: string;
	multiPassCount?: number;
}

export interface JianyingFilterCatalogExport {
	count: number;
	cards: JianyingFilterCatalogCard[];
}

export interface ExportJianyingFilterCatalogOptions {
	listReferences?: () => Promise<JianyingLutReference[]>;
	scanMetadata?: (input: {
		references: JianyingLutReference[];
	}) => Promise<JianyingFilterMetadataScan>;
	inspectPackages?: typeof inspectJianyingFilterPackages;
	readVerifications?: typeof readJianyingFilterVerifications;
	maxLutSize?: number;
}

/**
 * The tiled renderer kind counts only when the renderer matches the card's
 * selected version — a v1 renderer must not describe a v2 card.
 */
function versionGatedTiledRendererKind({
	packageSummary,
	version,
}: {
	packageSummary: JianyingFilterPackageSummary | undefined;
	version?: string;
}): string | undefined {
	const dual = packageSummary?.dualRenderer;
	if (dual && (!version || dual.background.version === version)) {
		return dual.kind;
	}
	const single = packageSummary?.renderer;
	if (single && (!version || single.version === version)) {
		return single.kind;
	}
	return undefined;
}

function titlesByResource({
	references,
	titles,
}: {
	references: JianyingLutReference[];
	titles: ReadonlyMap<string, string>;
}): Map<string, string> {
	const byResource = new Map<string, string>(
		JIANYING_NATIVE_PORTRAIT_PROFILES.map(({ resourceId, title }) => [
			resourceId,
			title,
		])
	);
	for (const reference of references) {
		const title = findJianyingFilterTitle({ reference, titles });
		if (title && !byResource.has(reference.resourceId)) {
			byResource.set(reference.resourceId, title);
		}
	}
	return byResource;
}

/**
 * Assembles the complete known-filter catalog exactly like the Filter Lab
 * IPC handler, then re-joins the stratification fields the IPC summary
 * drops. Reads only local caches; never touches the network.
 */
export async function exportJianyingFilterCatalog({
	listReferences = () => listJianyingLutReferences(),
	scanMetadata = scanJianyingFilterMetadata,
	inspectPackages = inspectJianyingFilterPackages,
	readVerifications = readJianyingFilterVerifications,
	maxLutSize = MAX_EXPORT_LUT_SIZE,
}: ExportJianyingFilterCatalogOptions = {}): Promise<JianyingFilterCatalogExport> {
	const references = await listReferences();
	const supported = references.filter(({ size }) => size <= maxLutSize);
	const [scan, verifications] = await Promise.all([
		scanMetadata({ references: supported }),
		readVerifications(),
	]);
	const merged = mergeKnownFiltersWithReferences({
		catalog: scan.knownCatalog,
		references: supported,
		fallbackTitles: titlesByResource({
			references: supported,
			titles: scan.titles,
		}),
		fallbackCategories: scan.categories.byResourceId,
	});
	const packages = await inspectPackages({
		filters: merged.filters,
		references: supported,
	});
	const summary = buildJianyingFilterLabCatalog({
		catalog: merged,
		references: supported,
		packages,
		verifications,
	});
	const knownById = new Map(
		merged.filters.map((filter) => [filter.resourceId, filter])
	);
	const cards = summary.filters.map((filter): JianyingFilterCatalogCard => {
		const known = knownById.get(filter.resourceId);
		const packageSummary = packages.get(filter.resourceId);
		const tiledRendererKind = versionGatedTiledRendererKind({
			packageSummary,
			version: filter.version,
		});
		return {
			resourceId: filter.resourceId,
			title: filter.title,
			categories: filter.categories,
			...(filter.version ? { version: filter.version } : {}),
			...(known?.effectId ? { effectId: known.effectId } : {}),
			...(known?.thirdResourceId
				? { thirdResourceId: known.thirdResourceId }
				: {}),
			...(known?.requirements?.length
				? { requirements: known.requirements }
				: {}),
			...(known?.sdkModel ? { sdkModel: known.sdkModel } : {}),
			implementation: filter.implementation,
			cacheStatus: filter.cacheStatus,
			available: filter.available,
			verification: filter.verification.status,
			lutCount: filter.luts.length,
			...(tiledRendererKind ? { tiledRendererKind } : {}),
			// filter.renderer is already gated by the selected version in
			// buildJianyingFilterLabCatalog; the raw package summary is not.
			...(filter.renderer
				? {
						multiPassKind: filter.renderer.kind,
						multiPassCount: filter.renderer.passCount,
					}
				: {}),
		};
	});
	return { count: cards.length, cards };
}
