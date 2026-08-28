import type { TemattingBlendImplementation } from "./jianying-person-cutout/tematting-blend.js";

export const JIANYING_PERSON_CUTOUT_INSPECT_CHANNEL =
	"jianying-person-cutout:inspect";
export const JIANYING_PERSON_CUTOUT_RENDER_CHANNEL =
	"jianying-person-cutout:render";
export const JIANYING_PERSON_CUTOUT_CANCEL_CHANNEL =
	"jianying-person-cutout:cancel";
export const JIANYING_PERSON_CUTOUT_PROGRESS_CHANNEL =
	"jianying-person-cutout:progress";
export const JIANYING_PERSON_CUTOUT_RELEASE_CHANNEL =
	"jianying-person-cutout:release";

export interface JianyingPersonCutoutStatus {
	available: boolean;
	blendImplementation: TemattingBlendImplementation;
	message: string;
	provider: "jianying-gru-local-v1";
	offlineReady: boolean;
}

export interface JianyingPersonCutoutRenderRequest {
	taskId: string;
	sourcePath: string;
	settings: {
		threshold: number;
		temporalSmoothing: number;
		edgeShift: number;
		feather: number;
	};
}

export interface JianyingPersonCutoutCancelRequest {
	taskId: string;
}

export interface JianyingPersonCutoutProgress {
	taskId: string;
	progress: number;
	status: string;
}

export interface JianyingPersonCutoutRenderResult {
	blendImplementation: TemattingBlendImplementation;
	provider: "jianying-gru-local-v1";
	outputPath: string;
	width: number;
	height: number;
	duration: number;
	frameRate: number;
	frameCount: number;
	hasAudio: boolean;
	codec: "vp9";
}

export interface JianyingPersonCutoutReleaseRequest {
	outputPath: string;
}

export interface JianyingPersonCutoutAPI {
	inspect: () => Promise<JianyingPersonCutoutStatus>;
	render: (
		request: JianyingPersonCutoutRenderRequest
	) => Promise<JianyingPersonCutoutRenderResult>;
	cancel: (request: JianyingPersonCutoutCancelRequest) => Promise<void>;
	onProgress: (
		callback: (progress: JianyingPersonCutoutProgress) => void
	) => () => void;
	release: (request: JianyingPersonCutoutReleaseRequest) => Promise<void>;
}

export type { TemattingBlendImplementation } from "./jianying-person-cutout/tematting-blend.js";
