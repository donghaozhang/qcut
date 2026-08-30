export type {
	NormalizedPoint,
	PlanarMatrix3,
	PlanarQuad,
	PlanarSampleStatus,
	PlanarTrackingDiagnostics,
	PlanarTrackingDirection,
	PlanarTrackingErrorCode,
	PlanarTrackingRange,
	PlanarTrackingReference,
	PlanarTrackingReferenceStatus,
	PlanarTrackingSample,
	PlanarTrackingSidecarV1,
	PlanarTrackingValidationIssue,
	PlanarTrackingValidationIssueCode,
	PlanarTrackingValidationResult,
	StickerPlanarTracking,
} from "./planar-types.js";

export {
	buildPlanarHomography,
	buildRelativePlanarHomography,
	hasClockwisePlanarQuadWinding,
	invertPlanarHomography,
	isConvexPlanarQuad,
	isFinitePlanarPoint,
	isSelfIntersectingPlanarQuad,
	isValidPlanarQuad,
	MIN_PLANAR_QUAD_AREA,
	multiplyPlanarHomographies,
	planarQuadArea,
	planarQuadPoints,
	planarQuadSignedArea,
	projectPlanarPoint,
	projectPlanarQuad,
	UNIT_PLANAR_QUAD,
} from "./planar-geometry.js";

export {
	MAX_PLANAR_TRACKING_SAMPLES,
	validatePlanarTrackingReference,
	validatePlanarTrackingSidecar,
	validateStickerPlanarTracking,
} from "./planar-result-validation.js";

export type {
	PlanarTrackingResultStore,
	StoredPlanarTrackingResult,
} from "./planar-result-storage.js";
export {
	createPlanarTrackingResultUri,
	isPlanarTrackingStorageId,
	parsePlanarTrackingResultUri,
} from "./planar-result-storage.js";
export {
	parsePlanarTrackingSidecar,
	PlanarTrackingSidecarValidationError,
	serializePlanarTrackingSidecar,
} from "./planar-sidecar-serialization.js";

export type { StickerTracking } from "../types/timeline.js";
