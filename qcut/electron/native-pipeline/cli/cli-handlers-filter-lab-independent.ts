import {
	resolveIndependentFogLut,
	validateIndependentFilterIdentity,
} from "../../qcut-independent-filter/assets.js";
import { resolveIndependentFilterHost } from "../../qcut-independent-filter/bridge.js";
import {
	independentFogSettings,
	independentLutSettings,
	QCUT_FOG_RESOURCE,
	QCUT_FOG_VERSION,
} from "../../qcut-independent-filter/contract.js";
import type { JianyingFilterCatalogExport } from "../../jianying-filter-catalog-export.js";
import type { FilterLabRenderPlan } from "../filters/filter-lab-render-plan.js";
import { handleFilterLabRender } from "./cli-handlers-filter-lab-render.js";
import { exportCatalogDefault } from "./cli-handlers-filter-lab-catalog.js";
import {
	listIndependentFilters,
	loadIndependentCube,
} from "../../qcut-independent-filter/lut-catalog.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export async function independentFilterCatalog(): Promise<JianyingFilterCatalogExport> {
	return listIndependentFilters({ exporter: exportCatalogDefault });
}

export async function handleIndependentFilterCatalog(): Promise<CLIResult> {
	try {
		return { success: true, data: await independentFilterCatalog() };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function resolveIndependentFilterPlan({
	card,
	intensity,
}: {
	card: JianyingFilterCatalogExport["cards"][number];
	intensity: number;
}): Promise<FilterLabRenderPlan> {
	if (card.resourceId !== QCUT_FOG_RESOURCE) {
		const cube = await loadIndependentCube({ card });
		await resolveIndependentFilterHost();
		return {
			kind: "native",
			mode: "qcut-metal-lut",
			cube,
			editorColor: {
				multiPass: independentLutSettings({
					resourceId: card.resourceId,
					version: card.version!,
					title: card.title,
				}),
			},
			evidence: {
				resourceId: card.resourceId,
				version: card.version!,
				title: card.title,
				implementation: card.implementation,
				verification: "unverified",
				intensity,
				backend: "qcut-metal",
				fidelity: "lut",
			},
		};
	}
	validateIndependentFilterIdentity({
		resourceId: card.resourceId,
		version: card.version ?? "",
	});
	const [lutPath] = await Promise.all([
		resolveIndependentFogLut(),
		resolveIndependentFilterHost(),
	]);
	return {
		kind: "native",
		mode: "qcut-metal",
		lutPath,
		editorColor: { multiPass: independentFogSettings() },
		evidence: {
			resourceId: card.resourceId,
			version: QCUT_FOG_VERSION,
			title: card.title,
			implementation: "shader",
			verification: card.verification,
			intensity,
			backend: "qcut-metal",
			fidelity: "native-local",
		},
	};
}

export function handleFilterLabIndependent({
	options,
	onProgress,
	signal,
}: {
	options: CLIRunOptions;
	onProgress: ProgressFn;
	signal: AbortSignal;
}): Promise<CLIResult> {
	if (!options.output) {
		return Promise.resolve({
			success: false,
			error: "Independent rendering requires an explicit --output path.",
		});
	}
	return handleFilterLabRender({
		options,
		onProgress,
		signal,
		dependencies: {
			exportCatalog: independentFilterCatalog,
			resolvePlan: resolveIndependentFilterPlan,
		},
	});
}
