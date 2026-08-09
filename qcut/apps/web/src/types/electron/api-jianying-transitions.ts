import type { JianyingTransitionAPI } from "../../../../../electron/jianying-transition-contract";

export interface ElectronJianyingTransitionOps {
	jianyingTransitions?: JianyingTransitionAPI;
}

export type {
	JianyingTransitionAPI,
	JianyingTransitionRenderRequest,
	JianyingTransitionRenderResult,
	JianyingTransitionPreviewRequest,
	JianyingTransitionPreviewResult,
	JianyingTimelinePreviewRequest,
	JianyingTimelinePreviewSource,
	JianyingTimelinePreviewSourceKind,
	JianyingTimelineRenderRequest,
	JianyingTimelineRenderResult,
	JianyingTimelineTransitionSpec,
	JianyingTransitionRuntimeStatus,
} from "../../../../../electron/jianying-transition-contract";
