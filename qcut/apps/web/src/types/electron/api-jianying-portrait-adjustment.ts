import type { JianyingPortraitAdjustmentAPI } from "../../../../../electron/jianying-portrait-adjustment-contract";
import type {
	MediaPortraitAdjustmentKey,
	MediaPortraitAdjustments,
} from "@/types/timeline";
import type {
	MediaPortraitAdjustmentKey as ElectronPortraitAdjustmentKey,
	MediaPortraitAdjustments as ElectronPortraitAdjustments,
} from "../../../../../electron/jianying-portrait-adjustment-contract";

export interface ElectronJianyingPortraitAdjustmentOps {
	jianyingPortraitAdjustment?: JianyingPortraitAdjustmentAPI;
}

type AssertAssignable<A extends B, B> = A;
type _EditorKeyToElectron = AssertAssignable<
	MediaPortraitAdjustmentKey,
	ElectronPortraitAdjustmentKey
>;
type _ElectronKeyToEditor = AssertAssignable<
	ElectronPortraitAdjustmentKey,
	MediaPortraitAdjustmentKey
>;
type _EditorSettingsToElectron = AssertAssignable<
	MediaPortraitAdjustments,
	ElectronPortraitAdjustments
>;
type _ElectronSettingsToEditor = AssertAssignable<
	ElectronPortraitAdjustments,
	MediaPortraitAdjustments
>;

export type {
	JianyingPortraitAdjustmentAPI,
	JianyingPortraitAdjustmentCategory,
	JianyingPortraitAdjustmentControl,
	JianyingPortraitAdjustmentGroup,
	JianyingPortraitAdjustmentInspectRequest,
	JianyingPortraitAdjustmentPackageStatus,
	JianyingPortraitAdjustmentRenderRequest,
	JianyingPortraitAdjustmentRenderResult,
	JianyingPortraitAdjustmentRuntimeState,
	JianyingPortraitAdjustmentRuntimePackage,
	JianyingPortraitAdjustmentSection,
	JianyingPortraitAdjustmentStatus,
	JianyingPortraitMakeupCardStatus,
	MediaPortraitFaceAdjustments,
} from "../../../../../electron/jianying-portrait-adjustment-contract";
