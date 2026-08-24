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

/** One person's adjustment set, identified by the native freid track id. */
export interface MediaPortraitFaceAdjustments {
	/**
	 * freid trackid reported by the native runtime. Non-negative safe integer,
	 * deliberately not capped at 9 — the id space is the tracker's, not the
	 * legacy ordinal faceTarget's. faceTarget keeps its own 0..9 meaning.
	 */
	trackId: number;
	values: Partial<Record<MediaPortraitAdjustmentKey, number>>;
	makeup?: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	>;
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
	return {
		enabled: adjustments?.enabled ?? false,
		values,
		...(faceTarget ? { faceTarget } : {}),
		...(Object.keys(makeup).length > 0 ? { makeup } : {}),
		...(faces.length > 0 ? { faces } : {}),
	};
}

const MAXIMUM_PORTRAIT_FACE_ENTRIES = 10;

function normalizeFaceEntries({
	entries,
}: {
	entries?: readonly Partial<MediaPortraitFaceAdjustments>[];
}): MediaPortraitFaceAdjustments[] {
	if (!entries) return [];
	const byTrackId = new Map<number, MediaPortraitFaceAdjustments>();
	for (const entry of entries) {
		const trackId = entry?.trackId;
		if (
			typeof trackId !== "number" ||
			!Number.isSafeInteger(trackId) ||
			trackId < 0 ||
			byTrackId.has(trackId)
		) {
			continue;
		}
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
		byTrackId.set(trackId, {
			trackId,
			values,
			...(Object.keys(makeup).length > 0 ? { makeup } : {}),
		});
		if (byTrackId.size >= MAXIMUM_PORTRAIT_FACE_ENTRIES) break;
	}
	return [...byTrackId.values()].sort((a, b) => a.trackId - b.trackId);
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
