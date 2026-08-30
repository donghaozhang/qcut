export const JIANYING_MOTION_TRACKING_INSPECT_CHANNEL =
	"jianying-motion-tracking:inspect";
export const JIANYING_MOTION_TRACKING_TRACK_CHANNEL =
	"jianying-motion-tracking:track";
export const JIANYING_MOTION_TRACKING_CANCEL_CHANNEL =
	"jianying-motion-tracking:cancel";
export const JIANYING_MOTION_TRACKING_PROGRESS_CHANNEL =
	"jianying-motion-tracking:progress";

export type JianyingMotionTrackingDirection = "backward" | "both" | "forward";

export interface JianyingMotionTrackingRect {
	bottom: number;
	left: number;
	right: number;
	top: number;
}

export interface JianyingMotionTrackingStatus {
	available: boolean;
	appVersion?: string;
	coreSha256?: string;
	coreUuid?: string;
	localOnly: true;
	message: string;
	offlineReady: boolean;
	platformSupported: boolean;
	route: "jianying-bingo-object-tracking-11.3.0";
	runtimeRoot?: string;
}

export interface JianyingMotionTrackingRequest {
	anchorTimeSeconds: number;
	direction: JianyingMotionTrackingDirection;
	initialRect: JianyingMotionTrackingRect;
	rangeEndTimeSeconds: number;
	rangeStartTimeSeconds: number;
	sourcePath: string;
	taskId: string;
}

export interface JianyingMotionTrackingCancelRequest {
	taskId: string;
}

export interface JianyingMotionTrackingProgress {
	progress: number;
	stage: "decode" | "prepare" | "publish" | "track" | "verify";
	status: string;
	taskId: string;
}

export interface JianyingMotionTrackingSample {
	anchor: boolean;
	frameIndex: number;
	rawRotationCentidegrees: number | null;
	rawStatus: number;
	rect: JianyingMotionTrackingRect;
	rotationDegrees: number | null;
	sourceTimeUs: number;
	status: "lost" | "tracked";
}

export interface JianyingMotionTrackingResult {
	anchorFrameIndex: number;
	direction: JianyingMotionTrackingDirection;
	fps: number;
	frameCount: number;
	height: number;
	route: JianyingMotionTrackingStatus["route"];
	runtime: {
		appVersion: string;
		coreSha256: string;
		coreUuid: string;
		localOnly: true;
	};
	samples: JianyingMotionTrackingSample[];
	sourceSha256: string;
	width: number;
}

export interface JianyingMotionTrackingAPI {
	cancel: (request: JianyingMotionTrackingCancelRequest) => Promise<void>;
	inspect: () => Promise<JianyingMotionTrackingStatus>;
	onProgress: (
		callback: (progress: JianyingMotionTrackingProgress) => void
	) => () => void;
	track: (
		request: JianyingMotionTrackingRequest
	) => Promise<JianyingMotionTrackingResult>;
}
