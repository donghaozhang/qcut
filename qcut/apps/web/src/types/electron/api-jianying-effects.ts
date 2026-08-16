import type { JianyingEffectAPI } from "../../../../../electron/jianying-effect-contract";

export interface ElectronJianyingEffectOps {
	jianyingEffects?: JianyingEffectAPI;
}

export type {
	JianyingEffectAPI,
	JianyingEffectAccess,
	JianyingEffectAdjustParameter,
	JianyingEffectAdjustValue,
	JianyingEffectDefinition,
	JianyingEffectDownloadRequest,
	JianyingEffectDownloadResult,
	JianyingEffectPanel,
	JianyingEffectPreviewRequest,
	JianyingEffectPreviewResult,
	JianyingEffectRenderRequest,
	JianyingEffectRenderResult,
	JianyingEffectRuntimeState,
	JianyingEffectRuntimeStatus,
} from "../../../../../electron/jianying-effect-contract";
