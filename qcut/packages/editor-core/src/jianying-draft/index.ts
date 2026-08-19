export { buildJianyingDraft } from "./build.js";
export { buildCapCut81Draft } from "./capcut-8-1-build.js";
export type {
	BuildCapCut81DraftOptions,
	CapCut81DraftBuildResult,
} from "./capcut-8-1-build.js";
export {
	composeCapCut81BuildResultContent,
	composeCapCut81Content,
	validateCapCut81Content,
} from "./capcut-8-1-content.js";
export {
	CAPCUT_8_1_LEGACY_DEFAULT_FONT_ALIAS,
	CAPCUT_8_1_SYSTEM_DEFAULT_FONT_DRAFT_FIELDS,
	CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY,
	CAPCUT_8_1_CMAP_COVERED_HAN_RANGES,
	resolveCapCut81Font,
} from "./capcut-8-1-font-resolver.js";
export type {
	CapCut81FontResolution,
	CapCut81FontResolutionError,
	CapCut81FontResolutionWarning,
	CapCut81FontRun,
	CapCut81SystemDefaultFontResolution,
	CapCut81UnsupportedFontResolution,
	ResolveCapCut81FontOptions,
} from "./capcut-8-1-font-resolver.js";
export {
	CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER,
	mapMediaElementLutToCapCut81,
} from "./capcut-8-1-lut.js";
export type {
	CapCut81AdjustPlaceholderMaterial,
	CapCut81AdjustSegment,
	CapCut81AdjustTrack,
	CapCut81CustomLutEffectMaterial,
	CapCut81CustomLutMapping,
	CapCut81GeneratedLutAsset,
} from "./capcut-8-1-lut.js";
export {
	buildCapCut81ActiveContentMirrorPaths,
	buildCapCut81PlaceholderAssetPath,
	CAPCUT_8_1_ACTIVE_CONTENT_MIRROR_TEMPLATES,
	CAPCUT_8_1_APP_ID,
	CAPCUT_8_1_APP_SOURCE,
	CAPCUT_8_1_APP_VERSION,
	CAPCUT_8_1_CONFIG_KEYS,
	CAPCUT_8_1_EXCLUDED_PLATFORM_IDENTITY_FIELDS,
	CAPCUT_8_1_KEYFRAME_BUCKET_KEYS,
	CAPCUT_8_1_MATERIAL_BUCKET_KEYS,
	CAPCUT_8_1_NEW_VERSION,
	CAPCUT_8_1_PLACEHOLDER_ASSET_PATH_TEMPLATE,
	CAPCUT_8_1_PROFILE_ID,
	CAPCUT_8_1_SCAFFOLD_PROFILE,
	CAPCUT_8_1_SCHEMA_VERSION,
	CAPCUT_8_1_SAVED_NEW_VERSION,
	CAPCUT_8_1_TIMELINE_ID_TOKEN,
	CAPCUT_8_1_TOP_LEVEL_KEYS,
	createEmptyCapCut81Materials,
	parseCapCut81PlaceholderAssetPath,
} from "./capcut-8-1-profile.js";
export {
	JIANYING_IMAGE_SOURCE_DURATION_MICROSECONDS,
	JIANYING_PLAINTEXT_APP_VERSION,
	JIANYING_PLAINTEXT_SCHEMA_VERSION,
} from "./constants.js";
export { createDeterministicJianyingId } from "./deterministic-id.js";
export {
	CAPCUT_8_1_MASK_RESOURCE_RESOLUTION_NOTE,
	CAPCUT_8_1_STATIC_MASK_METADATA,
	mapMediaElementStaticMaskToCapCut81,
	mapStaticMediaMaskToCapCut81,
} from "./mask-mapping.js";
export type {
	CapCut81CommonMaskMaterial,
	MappedCapCut81StaticMask,
} from "./mask-mapping.js";
export {
	isCapCut81StaticMaskType,
	resolveConfiguredMediaMasks,
	validateCapCut81MediaMaskElement,
	validateCapCut81StaticMediaMask,
} from "./mask-validation.js";
export type { CapCut81StaticMaskType } from "./mask-validation.js";
export {
	serializeColorCubeLut,
	validateColorCubeLut,
} from "./color-cube-lut.js";
export { secondsToMicroseconds } from "./time.js";
export {
	CAPCUT_NATIVE_DISSOLVE_METADATA,
	JIANYING_NATIVE_DISSOLVE_METADATA,
} from "./transition-mapping.js";
export { validateJianyingDraftContent } from "./validation.js";
export type {
	CapCut81DraftContent,
	CapCut81DraftMaterials,
	CapCut81DraftSegment,
	CapCut81DraftTrack,
	CapCut81Platform,
} from "./capcut-8-1-content.js";
export type {
	CapCut81AssetMediaFolder,
	CapCut81EmptyMaterials,
	CapCut81MaterialBucketKey,
	CapCut81PlaceholderAssetPath,
} from "./capcut-8-1-profile.js";
export type {
	JianyingAudioMaterial,
	JianyingClipSettings,
	JianyingDraftAssetCopy,
	JianyingDraftBuildResult,
	JianyingDraftCompatibility,
	JianyingDraftContent,
	JianyingDraftIssue,
	JianyingDraftIssueSeverity,
	JianyingDraftMaterials,
	JianyingDraftMediaType,
	JianyingDraftPlatform,
	JianyingDraftSegment,
	JianyingDraftTargetPlatform,
	JianyingDraftTrack,
	JianyingSpeedMaterial,
	JianyingTimeRange,
	JianyingTextMaterial,
	JianyingVideoMaterial,
	JianyingTransitionMaterial,
	QCutDraftExportAudioMedia,
	QCutDraftExportImageMedia,
	QCutDraftExportMedia,
	QCutDraftExportProject,
	QCutDraftExportSnapshotV1,
	QCutDraftExportVideoMedia,
} from "./types.js";

export {
	CAPCUT_8_1_DRAFT_PROFILE,
	getDraftProfile,
	isDraftProfileWritable,
	JIANYING_11_3_BETA2_APP_ID,
	JIANYING_11_3_BETA2_APP_SOURCE,
	JIANYING_11_3_BETA2_APP_VERSION,
	JIANYING_11_3_BETA2_NEW_VERSION,
	JIANYING_11_3_BETA2_PROFILE,
	JIANYING_11_3_BETA2_PROFILE_ID,
	JIANYING_11_3_BETA2_SCHEMA_VERSION,
	JIANYING_11_3_BETA2_TOP_LEVEL_KEYS,
	isJianying113ProfileId,
	JIANYING_11_3_BETA3_APP_ID,
	JIANYING_11_3_BETA3_APP_SOURCE,
	JIANYING_11_3_BETA3_APP_VERSION,
	JIANYING_11_3_BETA3_NEW_VERSION,
	JIANYING_11_3_BETA3_PROFILE,
	JIANYING_11_3_BETA3_PROFILE_ID,
	JIANYING_11_3_BETA3_SCHEMA_VERSION,
	JIANYING_11_3_BETA3_TOP_LEVEL_KEYS,
	JIANYING_11_3_BETA4_APP_ID,
	JIANYING_11_3_BETA4_APP_SOURCE,
	JIANYING_11_3_BETA4_APP_VERSION,
	JIANYING_11_3_BETA4_NEW_VERSION,
	JIANYING_11_3_BETA4_PROFILE,
	JIANYING_11_3_BETA4_PROFILE_ID,
	JIANYING_11_3_BETA4_SCHEMA_VERSION,
	JIANYING_11_3_BETA4_TOP_LEVEL_KEYS,
	JIANYING_11_3_NEW_VERSION,
	JIANYING_11_3_PROFILE_IDS,
	JIANYING_11_3_SCHEMA_VERSION,
	JIANYING_11_3_TOP_LEVEL_KEYS,
	listDraftProfiles,
	PLAINTEXT_5_9_PROFILE,
	PLAINTEXT_5_9_PROFILE_ID,
	PLAINTEXT_5_9_TOP_LEVEL_KEYS,
	registerDraftProfile,
	type DraftProfileCapabilities,
	type DraftProfileContract,
	type Jianying113ProfileId,
	type ProfileOperationLevel,
} from "./profiles/index.js";

export {
	detectDraftProfile,
	toProfileDetectionEvidence,
	type DraftContentSummary,
	type ProfileDetectionCandidate,
	type ProfileDetectionInput,
	type ProfileDetectionOutcomeKind,
	type ProfileDetectionResult,
} from "./import/profile-detection.js";

export {
	asRawDraftContent,
	isRawRecord,
	type RawDraftContent,
	type RawDraftSegment,
	type RawDraftTimeRange,
	type RawDraftTrack,
} from "./import/raw-types.js";

export {
	readRawDraftGraph,
	type DuplicateIdRecord,
	type RawDraftGraph,
	type RawGraphMaterialNode,
	type RawGraphSegmentNode,
	type RawGraphTimeRange,
	type RawGraphTrackNode,
} from "./import/graph-reader.js";

export {
	detectDraftReferenceCycles,
	validateRawDraftGraph,
	type DraftReferenceEdge,
} from "./import/validation.js";

export {
	normalizeRawDraft,
	type NormalizeRawDraftInput,
	type NormalizeRawDraftResult,
} from "./import/normalize.js";

export {
	mapBeta4SegmentEffect,
	type JianyingLocalEffectCapabilities,
	type JianyingLocalEffectCapability,
	type MappedBeta4SegmentEffect,
} from "./import/beta4-effect-mapper.js";

export {
	mapCapCut81StaticText,
	mapStaticText,
	type MapCapCut81StaticTextInput,
	type MappedCapCut81StaticText,
	type MapStaticTextInput,
	type MappedStaticText,
} from "./import/static-text-mapper.js";

export {
	mapStaticAudio,
	type MapStaticAudioInput,
	type MappedStaticAudio,
} from "./import/static-audio-mapper.js";

export {
	mapStaticVideo,
	type MapStaticVideoInput,
	type MappedStaticVideo,
} from "./import/static-video-mapper.js";

export {
	mapCapCut81SeamTransition,
	type MapCapCut81SeamTransitionInput,
	type MappedCapCut81SeamTransition,
} from "./import/capcut-8-1-transition-mapper.js";

export {
	mapInteropDocumentToQCutPlan,
	type QCutImportPlanDowngrade,
	type QCutImportPlanElement,
	type QCutImportPlanMediaKeyframe,
	type QCutImportPlanMediaElement,
	type QCutImportPlanTextElement,
	type QCutImportPlanTrack,
	type QCutImportPlanTrackType,
	type QCutImportPlanTransition,
	type QCutImportSkippedNode,
	type QCutImportTimelinePlanV1,
} from "./import/qcut-mapping.js";

export {
	planCapCut81TimingPatches,
	type CapCut81TimingPatchIssue,
	type CapCut81TimingPatchIssueCode,
	type CapCut81WritebackTimingSnapshot,
	type PlanCapCut81TimingPatchesResult,
} from "./writeback/capcut-8-1-timing-patches.js";

export {
	prepareCapCut81SameProfileWriteback,
	type CapCut81SameProfilePrepareIssue,
	type CapCut81SameProfilePrepareIssueCode,
	type PrepareCapCut81SameProfileWritebackResult,
} from "./writeback/capcut-8-1-same-profile-prepare.js";

export {
	JIANYING_11_3_BETA2_CONTENT_PATH,
	prepareJianying113Beta2SameProfileWriteback,
	type Jianying113Beta2SameProfilePrepareIssue,
	type Jianying113Beta2SameProfilePrepareIssueCode,
	type PrepareJianying113Beta2SameProfileWritebackResult,
} from "./writeback/jianying-11-3-beta2-same-profile-prepare.js";

export {
	planJianying113Beta2TimingPatches,
	type Jianying113Beta2TimingPatchIssue,
	type Jianying113Beta2TimingPatchIssueCode,
	type Jianying113Beta2WritebackTimingSnapshot,
	type PlanJianying113Beta2TimingPatchesResult,
} from "./writeback/jianying-11-3-beta2-timing-patches.js";

export {
	JIANYING_11_3_CONTENT_PATH,
	prepareJianying113SameProfileWriteback,
	type Jianying113SameProfilePrepareIssue,
	type Jianying113SameProfilePrepareIssueCode,
	type PrepareJianying113SameProfileWritebackResult,
} from "./writeback/jianying-11-3-same-profile-prepare.js";

export {
	planJianying113TimingPatches,
	type Jianying113TimingPatchIssue,
	type Jianying113TimingPatchIssueCode,
	type Jianying113WritebackTimingSnapshot,
	type PlanJianying113TimingPatchesResult,
} from "./writeback/jianying-11-3-timing-patches.js";

export type { SameProfileWritebackTimingSnapshot } from "./writeback/same-profile-timing-patches.js";
