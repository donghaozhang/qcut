import type { JianyingLutRole } from "./native-pipeline/filters/filter-lab-lut.js";

export const JIANYING_FILTER_LAB_LIST_CHANNEL = "jianying-filter-lab:list";
export const JIANYING_FILTER_LAB_LOAD_CHANNEL = "jianying-filter-lab:load";

export interface JianyingFilterLabLutSummary {
	lutId: string;
	resourceId: string;
	version: string;
	fileName: string;
	role: JianyingLutRole;
	size: number;
	title?: string;
}

export interface JianyingFilterLabListResult {
	count: number;
	luts: JianyingFilterLabLutSummary[];
}

export interface JianyingFilterLabLoadRequest {
	lutId: string;
}

export interface JianyingFilterLabCube {
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	values: number[];
}

export interface JianyingFilterLabLoadResult
	extends JianyingFilterLabLutSummary {
	kind: "colour" | "monochrome";
	cube: JianyingFilterLabCube;
}

export interface JianyingFilterLabAPI {
	list: () => Promise<JianyingFilterLabListResult>;
	load: (
		request: JianyingFilterLabLoadRequest
	) => Promise<JianyingFilterLabLoadResult>;
}

export type { JianyingLutRole };
