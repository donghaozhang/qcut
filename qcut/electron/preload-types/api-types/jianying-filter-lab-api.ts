import type { JianyingFilterLabAPI } from "../../jianying-filter-lab-contract";
import type { IndependentFilterAPI } from "../../qcut-independent-filter/contract";

export interface JianyingFilterLabPreloadAPI {
	qcutIndependentFilter?: IndependentFilterAPI;
	jianyingFilterLab?: JianyingFilterLabAPI;
}
