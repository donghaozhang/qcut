import type { JianyingBasicVideoAPI } from "../../../../../electron/jianying-basic-video-contract";

export interface ElectronJianyingBasicVideoOps {
	jianyingBasicVideo?: JianyingBasicVideoAPI;
}

export type {
	JianyingBasicVideoAPI,
	JianyingBasicVideoProgress,
	JianyingBasicVideoStatus,
	JianyingDeflickerRequest,
	JianyingDeflickerResult,
} from "../../../../../electron/jianying-basic-video-contract";
