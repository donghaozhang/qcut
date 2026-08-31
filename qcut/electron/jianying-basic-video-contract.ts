export const JIANYING_BASIC_VIDEO_INSPECT_CHANNEL =
	"jianying-basic-video:inspect";
export const JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL =
	"jianying-basic-video:deflicker";
export const JIANYING_BASIC_VIDEO_CANCEL_CHANNEL =
	"jianying-basic-video:cancel";
export const JIANYING_BASIC_VIDEO_PROGRESS_CHANNEL =
	"jianying-basic-video:progress";

export const JIANYING_PRIVATE_DEFLICKER_ROUTE =
	"qcut-jianying-private-deflicker-v2" as const;

export interface JianyingBasicVideoStatus {
	available: boolean;
	appVersion?: string;
	deflickerModelSha256?: string;
	lensSha256?: string;
	localOnly: true;
	message: string;
	offlineReady: boolean;
	platformSupported: boolean;
	route: typeof JIANYING_PRIVATE_DEFLICKER_ROUTE;
}

export interface JianyingDeflickerRequest {
	sourcePath: string;
	strength: number;
	taskId: string;
}

export interface JianyingBasicVideoCancelRequest {
	taskId: string;
}

export interface JianyingBasicVideoProgress {
	progress: number;
	stage: "decode" | "encode" | "prepare" | "process" | "publish" | "verify";
	status: string;
	taskId: string;
}

export interface JianyingDeflickerResult {
	cacheHit: boolean;
	durationSeconds: number;
	fps: number;
	frameCount: number;
	hasAudio: boolean;
	height: number;
	outputPath: string;
	provider: "jianying-private-cache";
	route: typeof JIANYING_PRIVATE_DEFLICKER_ROUTE;
	runtime: {
		appVersion: string;
		deflickerModelSha256: string;
		lensSha256: string;
		localOnly: true;
	};
	strength: number;
	width: number;
}

export interface JianyingBasicVideoAPI {
	cancel: (request: JianyingBasicVideoCancelRequest) => Promise<void>;
	deflicker: (
		request: JianyingDeflickerRequest
	) => Promise<JianyingDeflickerResult>;
	inspect: () => Promise<JianyingBasicVideoStatus>;
	onProgress: (
		callback: (progress: JianyingBasicVideoProgress) => void
	) => () => void;
}
