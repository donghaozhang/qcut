import type { JianyingMotionTrackingAPI } from "../../../../../electron/jianying-motion-tracking-contract";

export interface ElectronJianyingMotionTrackingOps {
	jianyingMotionTracking?: JianyingMotionTrackingAPI;
}

export type {
	JianyingMotionTrackingAPI,
	JianyingMotionTrackingDirection,
	JianyingMotionTrackingProgress,
	JianyingMotionTrackingRect,
	JianyingMotionTrackingRequest,
	JianyingMotionTrackingResult,
	JianyingMotionTrackingSample,
	JianyingMotionTrackingStatus,
} from "../../../../../electron/jianying-motion-tracking-contract";
