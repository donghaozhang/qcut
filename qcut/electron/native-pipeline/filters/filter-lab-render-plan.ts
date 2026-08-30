import { dirname } from "node:path";
import type { JianyingFilterCatalogCard } from "../../jianying-filter-catalog-export.js";
import { resolveJianyingFilterSwingCompatibility } from "../../jianying-filter-swing-runtime/compatibility.js";
import {
	buildJianyingFilterLabCatalog,
	tiledReferencesFromPackages,
} from "../../jianying-filter-lab-catalog.js";
import { inspectJianyingFilterPackages } from "../../jianying-filter-package-inspector.js";
import { loadJianyingFilterLabRenderer } from "../../jianying-filter-multi-pass-loader.js";
import {
	inspectJianyingFilterLocalRuntime,
	type JianyingFilterLocalRuntimeInspection,
} from "../../jianying-filter-local-runtime/runtime-discovery.js";
import {
	escapeFfmpegFilterPath,
	materializeVideoCubeLut,
} from "../../ffmpeg/color-lut-file.js";
import { buildVideoColorMultiPassGraph } from "../../ffmpeg/color-multi-pass-filter.js";
import {
	jianyingFilterCacheRoots,
	listJianyingLutReferences,
	loadJianyingLut,
} from "./filter-lab-lut.js";
import {
	loadJianyingMultiPassRecipe,
	resolveMultiPassPackagePath,
} from "./filter-lab-multi-pass.js";
import { resolveJianyingNativeFaceRegionPackagePath } from "./filter-lab-native-face-region.js";
import { resolveJianyingNativePortraitPackagePath } from "./filter-lab-native-portrait.js";
import { resolveJianyingNativeSwingPackagePath } from "./filter-lab-native-swing.js";
import { selectJianyingFilterCacheRoot } from "./filter-lab-package-path.js";
import {
	loadTiledLutCube,
	resolveTiledLutPackagePath,
} from "./filter-lab-tiled-lut.js";

export interface FilterLabRenderEvidence {
	resourceId: string;
	title: string;
	version: string;
	implementation: JianyingFilterCatalogCard["implementation"];
	verification: JianyingFilterCatalogCard["verification"];
	intensity: number;
	backend:
		| "ffmpeg-lut"
		| "ffmpeg-multi-pass"
		| "qcut-safe-passthrough"
		| "jianying-native-face-region"
		| "jianying-native-portrait"
		| "jianying-native-swing"
		| "jianying-native-multi-pass";
	fidelity: "lut" | "structural" | "native-local" | "safe-passthrough";
}

export type FilterLabRenderPlan = {
	evidence: FilterLabRenderEvidence;
} & (
	| { kind: "ffmpeg"; filterGraph: string; outputLabel: string }
	| {
			kind: "native";
			mode: "portrait" | "face-region" | "multi-pass" | "swing";
			packagePath: string;
			runtime: JianyingFilterLocalRuntimeInspection;
			captureFace: boolean;
	  }
);

async function requireNativeRuntime() {
	const runtime = await inspectJianyingFilterLocalRuntime();
	if (runtime.status.state !== "ready") {
		throw new Error(
			`Local Jianying runtime is not ready: ${runtime.status.message}`
		);
	}
	return runtime;
}

export async function resolveFilterLabRenderPlan({
	card,
	intensity,
}: {
	card: JianyingFilterCatalogCard;
	intensity: number;
}): Promise<FilterLabRenderPlan> {
	if (!card.available || card.cacheStatus !== "cached" || !card.version) {
		throw new Error(
			`Filter ${card.resourceId} is not available in Filter Lab.`
		);
	}
	const cacheRoots = [...new Set(jianyingFilterCacheRoots().map(dirname))];
	const references = (await listJianyingLutReferences()).filter(
		(reference) =>
			reference.resourceId === card.resourceId && reference.size <= 65
	);
	const packages = await inspectJianyingFilterPackages({
		filters: [card],
		references,
		cacheRoots,
	});
	const summary = buildJianyingFilterLabCatalog({
		catalog: { order: card.categories, filters: [card] },
		references,
		packages,
		verifications: new Map(),
	});
	const filter = summary.filters[0];
	const packageSummary = packages.get(card.resourceId);
	if (
		!filter?.available ||
		filter.version !== card.version ||
		!packageSummary
	) {
		throw new Error(
			"The selected filter package changed or is no longer loadable. Refresh the catalog."
		);
	}
	const evidence = {
		resourceId: card.resourceId,
		title: card.title,
		version: card.version,
		implementation: filter.implementation,
		verification: card.verification,
		intensity,
	};

	const multiPass = packageSummary.multiPassRenderer;
	if (filter.renderer && multiPass?.version === card.version) {
		const cacheRoot = selectJianyingFilterCacheRoot({
			cacheRoots,
			identity: multiPass,
		});
		const settings = await loadJianyingFilterLabRenderer({
			cacheRoot,
			filterTitle: card.title,
			loadRecipe: loadJianyingMultiPassRecipe,
			renderer: multiPass,
			resourceId: card.resourceId,
		});
		if (settings.nativeEffect) {
			return {
				kind: "native",
				mode: "multi-pass",
				captureFace: false,
				packagePath: resolveMultiPassPackagePath({
					cacheRoot,
					renderer: multiPass,
				}),
				runtime: await requireNativeRuntime(),
				evidence: {
					...evidence,
					backend: "jianying-native-multi-pass",
					fidelity: "native-local",
				},
			};
		}
		const graph = buildVideoColorMultiPassGraph({
			settings: { ...settings, intensity },
			inputLabel: "filter_input",
			labelPrefix: "filter_lab",
		});
		return {
			kind: "ffmpeg",
			filterGraph: [
				"[0:v:0]format=rgba[filter_input]",
				...graph.filterSteps,
			].join(";"),
			outputLabel: graph.outputLabel,
			evidence: {
				...evidence,
				backend: "ffmpeg-multi-pass",
				fidelity: "structural",
			},
		};
	}

	if (filter.implementation === "face-region-lut") {
		const renderer = packageSummary.nativeFaceRegionRenderer;
		if (!renderer || renderer.version !== card.version) {
			throw new Error(
				"This face-region LUT has no supported native face package."
			);
		}
		const cacheRoot = selectJianyingFilterCacheRoot({
			cacheRoots,
			identity: renderer,
		});
		return {
			kind: "native",
			mode: "face-region",
			packagePath: resolveJianyingNativeFaceRegionPackagePath({
				cacheRoot,
				renderer,
			}),
			captureFace: false,
			runtime: await requireNativeRuntime(),
			evidence: {
				...evidence,
				backend: "jianying-native-face-region",
				fidelity: "native-local",
			},
		};
	}

	if (
		(filter.implementation === "dual-lut" ||
			filter.implementation === "shader" ||
			filter.implementation === "face-ai") &&
		filter.renderer?.kind === "native-swing-effect"
	) {
		const renderer = packageSummary.nativeSwingRenderer;
		if (!renderer || renderer.version !== card.version) {
			throw new Error("This filter has no supported native Swing package.");
		}
		const cacheRoot = selectJianyingFilterCacheRoot({
			cacheRoots,
			identity: renderer,
		});
		const compatibility = resolveJianyingFilterSwingCompatibility({
			resourceId: card.resourceId,
			version: renderer.version,
		});
		return {
			kind: "native",
			mode: "swing",
			packagePath: resolveJianyingNativeSwingPackagePath({
				cacheRoot,
				renderer,
			}),
			captureFace: false,
			runtime: await requireNativeRuntime(),
			evidence: {
				...evidence,
				backend: compatibility
					? "qcut-safe-passthrough"
					: "jianying-native-swing",
				fidelity: compatibility ? "safe-passthrough" : "native-local",
			},
		};
	}

	if (filter.implementation === "dual-lut") {
		const native = packageSummary.nativePortraitRenderer;
		const tiled = packageSummary.dualRenderer?.background;
		const renderer = native?.version === card.version ? native : tiled;
		if (!renderer || renderer.version !== card.version) {
			throw new Error(
				"This dual LUT has no supported native skin-segmentation package."
			);
		}
		const cacheRoot = selectJianyingFilterCacheRoot({
			cacheRoots,
			identity: renderer,
		});
		return {
			kind: "native",
			mode: "portrait",
			packagePath:
				renderer === native
					? resolveJianyingNativePortraitPackagePath({
							cacheRoot,
							renderer: native,
						})
					: resolveTiledLutPackagePath({ cacheRoot, renderer: tiled! }),
			captureFace: native?.faceDetection === true,
			runtime: await requireNativeRuntime(),
			evidence: {
				...evidence,
				backend: "jianying-native-portrait",
				fidelity: "native-local",
			},
		};
	}

	const single = filter.luts.find(({ role }) => role === "single");
	const tiledReferences = tiledReferencesFromPackages({ packages, cacheRoots });
	const reference =
		single &&
		(references.find(({ lutId }) => lutId === single.lutId) ??
			tiledReferences.get(single.lutId));
	if (!reference || reference.version !== card.version) {
		throw new Error(
			"No supported single LUT was found for the selected version."
		);
	}
	const cube = tiledReferences.has(reference.lutId)
		? await loadTiledLutCube({ filePath: reference.filePath })
		: (await loadJianyingLut({ reference }))?.cube;
	if (!cube) throw new Error("The selected LUT could not be decoded.");
	const lutPlan = {
		kind: "ffmpeg" as const,
		outputLabel: "filter_output",
		evidence: {
			...evidence,
			backend: "ffmpeg-lut" as const,
			fidelity: "lut" as const,
		},
	};
	if (intensity === 0) {
		// Even an identity LUT can round 8-bit pixels during interpolation.
		return { ...lutPlan, filterGraph: "[0:v:0]null[filter_output]" };
	}
	const lutPath = materializeVideoCubeLut({
		name: card.title,
		cube: {
			size: cube.size,
			values: Array.from(cube.values),
			domainMin: cube.domainMin ?? [0, 0, 0],
			domainMax: cube.domainMax ?? [1, 1, 1],
		},
		intensity,
		skinProtection: 0,
	});
	return {
		...lutPlan,
		filterGraph: `[0:v:0]lut3d=file='${escapeFfmpegFilterPath(lutPath)}':interp=tetrahedral[filter_output]`,
	};
}
