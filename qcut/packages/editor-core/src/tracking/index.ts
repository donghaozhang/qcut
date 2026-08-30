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

export type { StickerTracking } from "../types/timeline.js";
