import type { JianyingTextRuntimeAPI } from "../../../../../electron/jianying-text-runtime-contract";

export interface ElectronJianyingTextRuntimeOps {
	jianyingTextRuntime?: JianyingTextRuntimeAPI;
}

export type {
	JianyingTextAnimationReference,
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
	JianyingTextRuntimeCancelRequest,
	JianyingTextRuntimeInspectRequest,
	JianyingTextRuntimePackageKind,
	JianyingTextRuntimeReference,
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
	JianyingTextRuntimeRenderSource,
	JianyingTextRuntimeRenderStrategy,
	JianyingTextRuntimeState,
	JianyingTextRuntimeStatus,
	JianyingTextRuntimeTransform,
} from "../../../../../electron/jianying-text-runtime-contract";
