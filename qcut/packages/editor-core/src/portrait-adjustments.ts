export const MEDIA_PORTRAIT_ADJUSTMENT_KEYS = [
	"face_adjust_TotalFace",
	"face_adjust_EyeSpacing",
	"face_adjust_EnlargeEye",
	"face_adjust_MoveEye",
	"face_adjust_Nose",
	"face_adjust_MoveNose",
	"face_adjust_MoveMouth",
	"face_adjust_ZoomMouth",
	"face_adjust_Chin",
	"face_adjust_Forehead",
	"face_adjust_CutFace",
	"face_adjust_SmallFace",
	"face_adjust_ZoomJawbone",
	"face_adjust_ZoomCheekbone",
	"face_adjust_MouthCorner",
	"face_adjust_CornerEye",
	"face_adjust_ChinSharp",
	"face_adjust_VFace",
	"face_adjust_skin_Intensity",
	"face_adjust_skin_ColdWarm",
	"face_adjust_outer_corner",
	"face_adjust_inner_corner",
	"face_adjust_outer_corner_inout",
	"face_adjust_eye_width",
	"face_adjust_pupil",
	"face_adjust_eye_height",
	"face_adjust_eye",
	"face_adjust_lower_eyelid",
	"face_adjust_eye_position",
	"face_adjust_eye_distance",
	"face_adjust_nose",
	"face_adjust_nose_bridge",
	"face_adjust_nose_position",
	"face_adjust_nose_root",
	"face_adjust_nose_tip",
	"face_adjust_nose_wing",
	"face_adjust_brow_ridge",
	"face_adjust_brow_size",
	"face_adjust_brow_position",
	"face_adjust_brow_tilt",
	"face_adjust_brow_width",
	"face_adjust_brow_distance",
	"face_adjust_mouse_width",
	"face_adjust_mouse_corner",
	"face_adjust_mouse",
	"face_adjust_mouse_position",
	"face_adjust_under_lip",
	"face_adjust_upper_lip",
	"face_adjust_lip_line",
	"face_adjust_BrightEye",
	"face_adjust_Pouch",
	"face_adjust_NasolabialFolds",
	"face_adjust_Smooth",
	"face_adjust_Whiten",
	"face_adjust_Clarity",
	"face_adjust_yunfu",
	"face_adjust_fuling",
	"face_adjust_SpotAcne",
	"face_adjust_WhiteTeeth",
	"face_adjust_temple",
	"face_adjust_cheekbone",
	"face_adjust_pointy_chin",
	"face_adjust_jaw",
	"face_adjust_underjaw",
	"face_adjust_upper_atrium",
	"face_adjust_mid_atrium",
	"face_adjust_lower_atrium",
	"body_adjust_SmallHead",
	"body_adjust_SwanNeck",
	"body_adjust_SlimArm",
	"body_adjust_OrthoShoulder",
	"body_adjust_WidenShoulderTest",
	"body_adjust_SlimBody",
	"body_adjust_SlimWaist",
	"body_adjust_StretchLeg",
	"body_adjust_SlimBreast",
	"body_adjust_SlimHip",
] as const;

export type MediaPortraitAdjustmentKey =
	(typeof MEDIA_PORTRAIT_ADJUSTMENT_KEYS)[number];

export const MEDIA_PORTRAIT_MAKEUP_CATEGORIES = [
	"look",
	"lip",
	"blush",
	"contour",
	"aegyo",
	"brows",
	"lashes",
	"eyeliner",
	"eyeshadow",
	"contacts",
	"highlight",
	"freckles",
] as const;

export type MediaPortraitMakeupCategory =
	(typeof MEDIA_PORTRAIT_MAKEUP_CATEGORIES)[number];

export interface MediaPortraitMakeupSelection {
	cardId: string;
	intensity: number;
}

export interface MediaPortraitFaceTarget {
	mode: "all" | "single";
	faceId?: number;
}

export interface MediaPortraitPersonBindingAnchor {
	rect: { x: number; y: number; width: number; height: number };
	frameNumber?: number;
}

/** One person's project-level adjustment set. */
export interface MediaPortraitFaceAdjustments {
	/**
	 * Last confirmed freid trackid. This value is session-local and must only be
	 * used together with personBindingId after a fresh native detection.
	 */
	trackId: number;
	/** Stable project identity; absent only on legacy project data. */
	personBindingId?: string;
	/** Last frame geometry used for explicit cross-session rebinding. */
	bindingAnchor?: MediaPortraitPersonBindingAnchor;
	values: Partial<Record<MediaPortraitAdjustmentKey, number>>;
	makeup?: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	>;
}

export const MEDIA_PORTRAIT_MANUAL_RETOUCH_TOOLS = ["smooth", "acne"] as const;
export type MediaPortraitManualRetouchTool =
	(typeof MEDIA_PORTRAIT_MANUAL_RETOUCH_TOOLS)[number];
export type MediaPortraitManualRetouchMode = "paint" | "erase";

export interface MediaPortraitManualRetouchPoint {
	x: number;
	y: number;
}

export interface MediaPortraitManualRetouchStroke {
	id: string;
	tool: MediaPortraitManualRetouchTool;
	mode: MediaPortraitManualRetouchMode;
	size: number;
	intensity: number;
	points: MediaPortraitManualRetouchPoint[];
	faceTrackId?: number;
}

export interface MediaPortraitManualRetouch {
	strokes: MediaPortraitManualRetouchStroke[];
}

export type MediaPortraitManualBodyTool = "stretch" | "slim" | "zoom";

export interface MediaPortraitManualBodyStretch {
	intensity: number;
	upper: number;
	bottom: number;
}

export interface MediaPortraitManualBodySlim {
	intensity: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
}

export interface MediaPortraitManualBodyZoom {
	intensity: number;
	x: number;
	y: number;
	radius: number;
}

export interface MediaPortraitManualBody {
	stretch?: MediaPortraitManualBodyStretch;
	slim?: MediaPortraitManualBodySlim;
	zoom?: MediaPortraitManualBodyZoom;
}

export interface MediaPortraitAdjustments {
	enabled: boolean;
	values: Partial<Record<MediaPortraitAdjustmentKey, number>>;
	faceTarget?: MediaPortraitFaceTarget;
	makeup?: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	>;
	/**
	 * Optional per-person adjustment sets. Absent on every legacy project and
	 * omitted again by normalize whenever empty, so stored legacy shapes stay
	 * byte-identical. Entries are deduped by trackId (first wins), sorted
	 * ascending, and capped at the native 10-face tracking limit.
	 */
	faces?: MediaPortraitFaceAdjustments[];
	manualRetouch?: MediaPortraitManualRetouch;
	manualBody?: MediaPortraitManualBody;
}

export const DEFAULT_MEDIA_PORTRAIT_ADJUSTMENTS: MediaPortraitAdjustments = {
	enabled: false,
	values: {},
};

export function normalizeMediaPortraitAdjustments({
	adjustments,
}: {
	adjustments?: Partial<MediaPortraitAdjustments>;
}): MediaPortraitAdjustments {
	const values: MediaPortraitAdjustments["values"] = {};
	for (const key of MEDIA_PORTRAIT_ADJUSTMENT_KEYS) {
		const value = adjustments?.values?.[key];
		if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
			values[key] = value;
		}
	}
	const faceTarget = normalizeFaceTarget({ target: adjustments?.faceTarget });
	const makeup = normalizeMakeupSelections({ selections: adjustments?.makeup });
	const faces = normalizeFaceEntries({ entries: adjustments?.faces });
	const manualRetouch = normalizeManualRetouch({
		manualRetouch: adjustments?.manualRetouch,
	});
	const manualBody = normalizeManualBody({
		manualBody: adjustments?.manualBody,
	});
	return {
		enabled: adjustments?.enabled ?? false,
		values,
		...(faceTarget ? { faceTarget } : {}),
		...(Object.keys(makeup).length > 0 ? { makeup } : {}),
		...(faces.length > 0 ? { faces } : {}),
		...(manualRetouch ? { manualRetouch } : {}),
		...(manualBody ? { manualBody } : {}),
	};
}

export const DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY = {
	stretch: {
		intensity: 0,
		upper: 0.448,
		bottom: 0.202,
	},
	slim: {
		intensity: 0,
		x: 0.504,
		y: 0.422,
		width: 0.284,
		height: 0.308,
		rotation: 0,
	},
	zoom: {
		intensity: 0,
		x: 0.495,
		y: 0.64,
		radius: 0.12,
	},
} as const satisfies Required<MediaPortraitManualBody>;

function finiteOrDefault({
	value,
	fallback,
	min,
	max,
}: {
	value: number | undefined;
	fallback: number;
	min: number;
	max: number;
}) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

function normalizeManualBody({
	manualBody,
}: {
	manualBody?: Partial<MediaPortraitManualBody>;
}): MediaPortraitManualBody | undefined {
	if (!manualBody || typeof manualBody !== "object") return undefined;
	const normalized: MediaPortraitManualBody = {};
	if (manualBody.stretch) {
		const upper = finiteOrDefault({
			value: manualBody.stretch.upper,
			fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch.upper,
			min: 0.02,
			max: 1,
		});
		const bottom = finiteOrDefault({
			value: manualBody.stretch.bottom,
			fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch.bottom,
			min: 0,
			max: 0.98,
		});
		normalized.stretch = {
			intensity: finiteOrDefault({
				value: manualBody.stretch.intensity,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch.intensity,
				min: -50,
				max: 50,
			}),
			upper:
				upper - bottom >= 0.02
					? upper
					: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch.upper,
			bottom:
				upper - bottom >= 0.02
					? bottom
					: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch.bottom,
		};
	}
	if (manualBody.slim) {
		normalized.slim = {
			intensity: finiteOrDefault({
				value: manualBody.slim.intensity,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim.intensity,
				min: -50,
				max: 50,
			}),
			x: finiteOrDefault({
				value: manualBody.slim.x,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim.x,
				min: 0,
				max: 1,
			}),
			y: finiteOrDefault({
				value: manualBody.slim.y,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim.y,
				min: 0,
				max: 1,
			}),
			width: finiteOrDefault({
				value: manualBody.slim.width,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim.width,
				min: 0.02,
				max: 1,
			}),
			height: finiteOrDefault({
				value: manualBody.slim.height,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim.height,
				min: 0.02,
				max: 1,
			}),
			rotation: finiteOrDefault({
				value: manualBody.slim.rotation,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim.rotation,
				min: -180,
				max: 180,
			}),
		};
	}
	if (manualBody.zoom) {
		normalized.zoom = {
			intensity: finiteOrDefault({
				value: manualBody.zoom.intensity,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom.intensity,
				min: -50,
				max: 50,
			}),
			x: finiteOrDefault({
				value: manualBody.zoom.x,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom.x,
				min: 0,
				max: 1,
			}),
			y: finiteOrDefault({
				value: manualBody.zoom.y,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom.y,
				min: 0,
				max: 1,
			}),
			radius: finiteOrDefault({
				value: manualBody.zoom.radius,
				fallback: DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom.radius,
				min: 0.01,
				max: 0.5,
			}),
		};
	}
	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

const MAXIMUM_MANUAL_RETOUCH_STROKES = 256;
const MAXIMUM_MANUAL_RETOUCH_POINTS = 512;
const MANUAL_RETOUCH_STROKE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function normalizeManualRetouch({
	manualRetouch,
}: {
	manualRetouch?: Partial<MediaPortraitManualRetouch>;
}): MediaPortraitManualRetouch | undefined {
	if (!Array.isArray(manualRetouch?.strokes)) return undefined;
	const strokes: MediaPortraitManualRetouchStroke[] = [];
	const ids = new Set<string>();
	for (const stroke of manualRetouch.strokes) {
		if (
			!stroke ||
			!MANUAL_RETOUCH_STROKE_ID.test(stroke.id) ||
			ids.has(stroke.id) ||
			!MEDIA_PORTRAIT_MANUAL_RETOUCH_TOOLS.includes(stroke.tool) ||
			(stroke.mode !== "paint" && stroke.mode !== "erase") ||
			!Number.isFinite(stroke.size) ||
			stroke.size < 1 ||
			stroke.size > 100 ||
			!Number.isFinite(stroke.intensity) ||
			stroke.intensity < 0 ||
			stroke.intensity > 100 ||
			!Array.isArray(stroke.points)
		) {
			continue;
		}
		const points = stroke.points
			.filter(
				(point) =>
					Number.isFinite(point?.x) &&
					Number.isFinite(point?.y) &&
					point.x >= 0 &&
					point.x <= 1 &&
					point.y >= 0 &&
					point.y <= 1
			)
			.slice(0, MAXIMUM_MANUAL_RETOUCH_POINTS)
			.map(({ x, y }) => ({ x, y }));
		if (points.length < 2) continue;
		const faceTrackId = stroke.faceTrackId;
		if (
			faceTrackId !== undefined &&
			(!Number.isSafeInteger(faceTrackId) || faceTrackId < 0)
		) {
			continue;
		}
		ids.add(stroke.id);
		strokes.push({
			id: stroke.id,
			tool: stroke.tool,
			mode: stroke.mode,
			size: stroke.size,
			intensity: stroke.intensity,
			points,
			...(faceTrackId === undefined ? {} : { faceTrackId }),
		});
		if (strokes.length >= MAXIMUM_MANUAL_RETOUCH_STROKES) break;
	}
	return strokes.length > 0 ? { strokes } : undefined;
}

const MAXIMUM_PORTRAIT_FACE_ENTRIES = 10;

function normalizeFaceEntries({
	entries,
}: {
	entries?: readonly Partial<MediaPortraitFaceAdjustments>[];
}): MediaPortraitFaceAdjustments[] {
	if (!entries) return [];
	const byBinding = new Map<string, MediaPortraitFaceAdjustments>();
	for (const entry of entries) {
		const trackId = entry?.trackId;
		if (
			typeof trackId !== "number" ||
			!Number.isSafeInteger(trackId) ||
			trackId < 0
		) {
			continue;
		}
		const personBindingId = normalizePersonBindingId({
			value: entry.personBindingId,
		});
		const dedupeKey = personBindingId
			? `person:${personBindingId}`
			: `legacy-track:${trackId}`;
		if (byBinding.has(dedupeKey)) continue;
		const values: MediaPortraitAdjustments["values"] = {};
		for (const key of MEDIA_PORTRAIT_ADJUSTMENT_KEYS) {
			const value = entry.values?.[key];
			if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
				values[key] = value;
			}
		}
		const makeup = normalizeMakeupSelections({ selections: entry.makeup });
		if (Object.keys(values).length === 0 && Object.keys(makeup).length === 0) {
			continue;
		}
		const bindingAnchor = personBindingId
			? normalizePersonBindingAnchor({ anchor: entry.bindingAnchor })
			: undefined;
		// Export validation and the native render parser both require an anchor
		// whenever a person binding id is present, and an unanchored binding can
		// never rebind, so drop the entry instead of emitting an invalid shape.
		if (personBindingId && !bindingAnchor) continue;
		byBinding.set(dedupeKey, {
			trackId,
			...(personBindingId ? { personBindingId } : {}),
			...(bindingAnchor ? { bindingAnchor } : {}),
			values,
			...(Object.keys(makeup).length > 0 ? { makeup } : {}),
		});
		if (byBinding.size >= MAXIMUM_PORTRAIT_FACE_ENTRIES) break;
	}
	return [...byBinding.values()].sort((left, right) => {
		if (left.trackId !== right.trackId) return left.trackId - right.trackId;
		return (left.personBindingId ?? "").localeCompare(
			right.personBindingId ?? ""
		);
	});
}

function normalizePersonBindingId({ value }: { value?: string }) {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 128 ||
		!/^[A-Za-z0-9._:-]+$/.test(value)
	) {
		return undefined;
	}
	return value;
}

function normalizePersonBindingAnchor({
	anchor,
}: {
	anchor?: Partial<MediaPortraitPersonBindingAnchor>;
}): MediaPortraitPersonBindingAnchor | undefined {
	const rect = anchor?.rect;
	if (!rect) return undefined;
	const values = [rect.x, rect.y, rect.width, rect.height];
	if (
		!values.every((value) => Number.isFinite(value)) ||
		rect.x < 0 ||
		rect.y < 0 ||
		rect.width <= 0 ||
		rect.height <= 0 ||
		rect.x + rect.width > 1 ||
		rect.y + rect.height > 1
	) {
		return undefined;
	}
	const frameNumber = anchor.frameNumber;
	return {
		rect: { ...rect },
		...(typeof frameNumber === "number" &&
		Number.isSafeInteger(frameNumber) &&
		frameNumber >= 0
			? { frameNumber }
			: {}),
	};
}

function normalizeFaceTarget({
	target,
}: {
	target?: Partial<MediaPortraitFaceTarget>;
}): MediaPortraitFaceTarget | undefined {
	if (target?.mode !== "single") return undefined;
	if (
		typeof target.faceId !== "number" ||
		!Number.isSafeInteger(target.faceId) ||
		target.faceId < 0 ||
		target.faceId > 9
	) {
		return undefined;
	}
	return { mode: "single", faceId: target.faceId };
}

function normalizeMakeupSelections({
	selections,
}: {
	selections?: Partial<
		Record<MediaPortraitMakeupCategory, Partial<MediaPortraitMakeupSelection>>
	>;
}) {
	const normalized: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	> = {};
	for (const category of MEDIA_PORTRAIT_MAKEUP_CATEGORIES) {
		const selection = selections?.[category];
		if (
			!selection ||
			typeof selection.cardId !== "string" ||
			!/^[a-z0-9-]{1,80}$/.test(selection.cardId) ||
			typeof selection.intensity !== "number" ||
			!Number.isFinite(selection.intensity) ||
			selection.intensity <= 0
		) {
			continue;
		}
		normalized[category] = {
			cardId: selection.cardId,
			intensity: Math.min(100, selection.intensity),
		};
	}
	return normalized;
}

export function hasMediaPortraitAdjustments({
	adjustments,
}: {
	adjustments?: Partial<MediaPortraitAdjustments>;
}) {
	if (!adjustments?.enabled) return false;
	if (
		MEDIA_PORTRAIT_ADJUSTMENT_KEYS.some(
			(key) => (adjustments.values?.[key] ?? 0) !== 0
		)
	) {
		return true;
	}
	if ((adjustments.manualRetouch?.strokes.length ?? 0) > 0) return true;
	if (
		(adjustments.manualBody?.stretch?.intensity ?? 0) !== 0 ||
		(adjustments.manualBody?.slim?.intensity ?? 0) !== 0 ||
		(adjustments.manualBody?.zoom?.intensity ?? 0) !== 0
	) {
		return true;
	}
	if (
		MEDIA_PORTRAIT_MAKEUP_CATEGORIES.some(
			(category) => (adjustments.makeup?.[category]?.intensity ?? 0) > 0
		)
	) {
		return true;
	}
	return (adjustments.faces ?? []).some(
		(face) =>
			MEDIA_PORTRAIT_ADJUSTMENT_KEYS.some(
				(key) => (face.values?.[key] ?? 0) !== 0
			) ||
			MEDIA_PORTRAIT_MAKEUP_CATEGORIES.some(
				(category) => (face.makeup?.[category]?.intensity ?? 0) > 0
			)
	);
}
