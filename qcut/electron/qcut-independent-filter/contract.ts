import type {
	JianyingFilterLabLoadRendererResult,
	JianyingFilterLabRenderLocalEffectRequest,
} from "../jianying-filter-lab-contract.js";

export const QCUT_FILTER_LOAD = "qcut-independent-filter:load";
export const QCUT_FILTER_RENDER = "qcut-independent-filter:render";
export const QCUT_FILTER_LIST = "qcut-independent-filter:list";
export const QCUT_FOG_RESOURCE = "7160594413847203085";
export const QCUT_FOG_VERSION = "e745e131cff1db913aea07f4098ec8de";
export const QCUT_FOG_PROVIDER = "qcut-metal-fog-v1";
export const QCUT_LUT_PROVIDER = "qcut-metal-lut-v1";
export const QCUT_GRAPH_PROVIDER = "qcut-metal-graph-v1";

export interface IndependentFilterIdentity {
	resourceId: string;
	version: string;
}

export interface IndependentFilterRequest
	extends JianyingFilterLabRenderLocalEffectRequest {
	version: string;
}

export interface IndependentFilterResult {
	provider:
		| typeof QCUT_FOG_PROVIDER
		| typeof QCUT_LUT_PROVIDER
		| typeof QCUT_GRAPH_PROVIDER;
	resourceId: string;
	width: number;
	height: number;
	rgba: Uint8Array;
}

export interface IndependentFilterAPI {
	load: (
		request?: IndependentFilterIdentity
	) => Promise<JianyingFilterLabLoadRendererResult>;
	list: (request?: {
		refresh?: boolean;
	}) => Promise<
		import("../jianying-filter-catalog-export.js").JianyingFilterCatalogExport
	>;
	render: (
		request: IndependentFilterRequest
	) => Promise<IndependentFilterResult>;
}

export function independentLutSettings({
	resourceId,
	version,
	title,
	graph = false,
}: IndependentFilterIdentity & {
	title: string;
	graph?: boolean;
}): JianyingFilterLabLoadRendererResult {
	return {
		resourceId,
		version,
		name: `${title} · QCut Metal`,
		enabled: true,
		presetId: `qcut-independent-${graph ? "graph" : "lut"}-${resourceId}`,
		intensity: 100,
		fidelity: "native-local",
		nativeEffect: {
			provider: graph ? QCUT_GRAPH_PROVIDER : QCUT_LUT_PROVIDER,
			resourceId,
			version,
		},
		passes: [],
	};
}

export function independentFogSettings(): JianyingFilterLabLoadRendererResult {
	return {
		resourceId: QCUT_FOG_RESOURCE,
		version: QCUT_FOG_VERSION,
		name: "迷雾 · QCut Metal",
		enabled: true,
		presetId: "qcut-independent-fog-v1",
		intensity: 100,
		fidelity: "native-local",
		nativeEffect: {
			provider: QCUT_FOG_PROVIDER,
			resourceId: QCUT_FOG_RESOURCE,
			version: QCUT_FOG_VERSION,
		},
		passes: [],
	};
}
