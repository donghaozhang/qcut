export type {
	JianyingTextAnimationLabListRequest,
	JianyingTextAnimationLabListResult,
	JianyingTextAnimationLabSummary,
	JianyingTextStyleCompatibility,
	JianyingTextStyleCategoryId,
	JianyingTextStyleFillKind,
	JianyingTextStyleLabCategorySummary,
	JianyingTextStyleLabAPI,
	JianyingTextStyleLabCoverRequest,
	JianyingTextStyleLabCoverResult,
	JianyingTextStyleLabListRequest,
	JianyingTextStyleLabListResult,
	JianyingTextStyleLabStyleSummary,
	JianyingTextStylePackageKind,
	JianyingTextStyleQcutApproximation,
} from "../../../../../electron/jianying-text-style-lab-contract";

import type { JianyingTextStyleLabAPI } from "../../../../../electron/jianying-text-style-lab-contract";

export interface ElectronJianyingTextStyleLabOps {
	jianyingTextStyleLab?: JianyingTextStyleLabAPI;
}
