export const JIANYING_PORTRAIT_ADJUSTMENT_INSPECT_CHANNEL =
	"jianying-portrait-adjustment:inspect";
export const JIANYING_PORTRAIT_ADJUSTMENT_RENDER_CHANNEL =
	"jianying-portrait-adjustment:render";

export type JianyingPortraitAdjustmentGroup = "face" | "body";
export type JianyingPortraitAdjustmentSection =
	| "skin"
	| "face-shape"
	| "features"
	| "body";
export type JianyingPortraitAdjustmentCategory =
	| "common"
	| "skin"
	| "eyes"
	| "nose"
	| "mouth"
	| "brows"
	| "details"
	| "body";
export type JianyingPortraitAdjustmentRuntimePackage =
	| "face"
	| "features"
	| "eye-details"
	| "skin-tone"
	| "smooth"
	| "whiten"
	| "clarity"
	| "skin-gan"
	| "spot-acne"
	| "teeth"
	| "makeup"
	| "body";

export type MediaPortraitAdjustmentKey =
	| "face_adjust_TotalFace"
	| "face_adjust_EyeSpacing"
	| "face_adjust_EnlargeEye"
	| "face_adjust_MoveEye"
	| "face_adjust_Nose"
	| "face_adjust_MoveNose"
	| "face_adjust_MoveMouth"
	| "face_adjust_ZoomMouth"
	| "face_adjust_Chin"
	| "face_adjust_Forehead"
	| "face_adjust_CutFace"
	| "face_adjust_SmallFace"
	| "face_adjust_ZoomJawbone"
	| "face_adjust_ZoomCheekbone"
	| "face_adjust_MouthCorner"
	| "face_adjust_CornerEye"
	| "face_adjust_ChinSharp"
	| "face_adjust_VFace"
	| "face_adjust_skin_Intensity"
	| "face_adjust_skin_ColdWarm"
	| "face_adjust_outer_corner"
	| "face_adjust_inner_corner"
	| "face_adjust_outer_corner_inout"
	| "face_adjust_eye_width"
	| "face_adjust_pupil"
	| "face_adjust_eye_height"
	| "face_adjust_eye"
	| "face_adjust_lower_eyelid"
	| "face_adjust_eye_position"
	| "face_adjust_eye_distance"
	| "face_adjust_nose"
	| "face_adjust_nose_bridge"
	| "face_adjust_nose_position"
	| "face_adjust_nose_root"
	| "face_adjust_nose_tip"
	| "face_adjust_nose_wing"
	| "face_adjust_brow_ridge"
	| "face_adjust_brow_size"
	| "face_adjust_brow_position"
	| "face_adjust_brow_tilt"
	| "face_adjust_brow_width"
	| "face_adjust_brow_distance"
	| "face_adjust_mouse_width"
	| "face_adjust_mouse_corner"
	| "face_adjust_mouse"
	| "face_adjust_mouse_position"
	| "face_adjust_under_lip"
	| "face_adjust_upper_lip"
	| "face_adjust_lip_line"
	| "face_adjust_BrightEye"
	| "face_adjust_Pouch"
	| "face_adjust_NasolabialFolds"
	| "face_adjust_Smooth"
	| "face_adjust_Whiten"
	| "face_adjust_Clarity"
	| "face_adjust_yunfu"
	| "face_adjust_fuling"
	| "face_adjust_SpotAcne"
	| "face_adjust_WhiteTeeth"
	| "face_adjust_temple"
	| "face_adjust_cheekbone"
	| "face_adjust_pointy_chin"
	| "face_adjust_jaw"
	| "face_adjust_underjaw"
	| "face_adjust_upper_atrium"
	| "face_adjust_mid_atrium"
	| "face_adjust_lower_atrium"
	| "body_adjust_SmallHead"
	| "body_adjust_SwanNeck"
	| "body_adjust_SlimArm"
	| "body_adjust_OrthoShoulder"
	| "body_adjust_WidenShoulderTest"
	| "body_adjust_SlimBody"
	| "body_adjust_SlimWaist"
	| "body_adjust_StretchLeg"
	| "body_adjust_SlimBreast"
	| "body_adjust_SlimHip";

export type MediaPortraitMakeupCategory =
	| "look"
	| "lip"
	| "blush"
	| "contour"
	| "aegyo"
	| "brows"
	| "lashes"
	| "eyeliner"
	| "eyeshadow"
	| "contacts"
	| "highlight"
	| "freckles";

export interface MediaPortraitMakeupSelection {
	cardId: string;
	intensity: number;
}

export interface MediaPortraitFaceTarget {
	mode: "all" | "single";
	faceId?: number;
}

export interface MediaPortraitAdjustments {
	enabled: boolean;
	values: Partial<Record<MediaPortraitAdjustmentKey, number>>;
	faceTarget?: MediaPortraitFaceTarget;
	makeup?: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	>;
}

export interface JianyingPortraitAdjustmentControl {
	key: MediaPortraitAdjustmentKey;
	group: JianyingPortraitAdjustmentGroup;
	section: JianyingPortraitAdjustmentSection;
	category?: JianyingPortraitAdjustmentCategory;
	runtimePackage?: JianyingPortraitAdjustmentRuntimePackage;
	titleZh: string;
	titleEn: string;
	min: number;
	max: number;
	step: number;
}

export type JianyingPortraitAdjustmentRuntimeState =
	| "ready"
	| "unsupported-platform"
	| "bridge-missing"
	| "runtime-incompatible"
	| "model-missing"
	| "package-missing"
	| "error";

export interface JianyingPortraitAdjustmentPackageStatus {
	group: JianyingPortraitAdjustmentGroup;
	runtimePackage: JianyingPortraitAdjustmentRuntimePackage;
	ready: boolean;
	source: "qcut-private" | "jianying-installation" | "none";
}

export interface JianyingPortraitMakeupCardStatus {
	id: string;
	category: MediaPortraitMakeupCategory;
	titleZh: string;
	titleEn: string;
	defaultIntensity: number;
	ready: boolean;
	source: "qcut-private" | "jianying-installation" | "none";
	thumbnailDataUrl?: string;
}

export interface JianyingPortraitAdjustmentStatus {
	state: JianyingPortraitAdjustmentRuntimeState;
	message: string;
	provider: "jianying-local-swing-v1";
	available: boolean;
	offlineReady: boolean;
	catalog: JianyingPortraitAdjustmentControl[];
	packages: JianyingPortraitAdjustmentPackageStatus[];
	makeupCards: JianyingPortraitMakeupCardStatus[];
}

export interface JianyingPortraitAdjustmentInspectRequest {
	refresh?: boolean;
}

export interface JianyingPortraitAdjustmentRenderRequest {
	width: number;
	height: number;
	rgba: Uint8Array;
	adjustments: MediaPortraitAdjustments;
	sourceKey?: string;
	timestampSeconds?: number;
}

export interface JianyingPortraitAdjustmentRenderResult {
	provider: "jianying-local-swing-v1";
	width: number;
	height: number;
	rgba: Uint8Array;
	activeGroups: JianyingPortraitAdjustmentGroup[];
}

export interface JianyingPortraitAdjustmentAPI {
	inspect: (
		request?: JianyingPortraitAdjustmentInspectRequest
	) => Promise<JianyingPortraitAdjustmentStatus>;
	render: (
		request: JianyingPortraitAdjustmentRenderRequest
	) => Promise<JianyingPortraitAdjustmentRenderResult>;
}
