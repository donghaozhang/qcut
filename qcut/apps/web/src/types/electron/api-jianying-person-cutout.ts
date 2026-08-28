import type { JianyingPersonCutoutAPI } from "../../../../../electron/jianying-person-cutout-contract";

export interface ElectronJianyingPersonCutoutOps {
	jianyingPersonCutout?: JianyingPersonCutoutAPI;
}

export type {
	JianyingPersonCutoutAPI,
	JianyingPersonCutoutRenderRequest,
	JianyingPersonCutoutRenderResult,
	JianyingPersonCutoutStatus,
	TemattingBlendImplementation,
} from "../../../../../electron/jianying-person-cutout-contract";
