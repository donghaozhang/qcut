import type { JianyingFilterLabAPI } from "../../../../../electron/jianying-filter-lab-contract";

export interface ElectronJianyingFilterLabOps {
	jianyingFilterLab?: JianyingFilterLabAPI;
}

export type {
	JianyingFilterLabAPI,
	JianyingFilterLabCube,
	JianyingFilterLabListResult,
	JianyingFilterLabLoadRequest,
	JianyingFilterLabLoadResult,
	JianyingFilterLabLutSummary,
	JianyingLutRole,
} from "../../../../../electron/jianying-filter-lab-contract";
