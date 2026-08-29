import type { JianyingMusicLabAPI } from "../../../../../electron/jianying-music-lab-contract";

export interface ElectronJianyingMusicLabOps {
	jianyingMusicLab?: JianyingMusicLabAPI;
}

export type {
	JianyingMusicLabAPI,
	JianyingMusicLabBatchRequest,
	JianyingMusicLabBatchResult,
	JianyingMusicLabBatchSummary,
	JianyingMusicLabListRequest,
	JianyingMusicLabListResult,
	JianyingMusicLabLoadRequest,
	JianyingMusicLabLoadResult,
	JianyingMusicLabScanStats,
	JianyingMusicLabTrackSummary,
} from "../../../../../electron/jianying-music-lab-contract";
