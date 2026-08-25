import type {
	MediaPortraitAdjustmentKey,
	MediaPortraitAdjustments,
	MediaPortraitFaceAdjustments,
	MediaPortraitPersonBindingAnchor,
} from "@/types/timeline";
import type { JianyingPortraitDetectedFace } from "@/types/electron";

/**
 * Which adjustment set the panel is editing. `all` is the legacy whole-frame
 * layer; a track id edits that one person's set.
 */
export type PortraitEditScope =
	| { mode: "all" }
	| {
			mode: "face";
			personBindingId: string;
			trackId: number;
			bindingAnchor: MediaPortraitPersonBindingAnchor;
	  };

export function portraitScopeForDetectedFace({
	face,
	frameNumber,
}: {
	face: JianyingPortraitDetectedFace;
	frameNumber: number;
}): PortraitEditScope {
	return {
		mode: "face",
		personBindingId: face.personBindingId,
		trackId: face.trackId,
		bindingAnchor: { rect: { ...face.rect }, frameNumber },
	};
}

export function rebindPortraitAdjustments({
	adjustments,
	faces,
	frameNumber,
}: {
	adjustments: MediaPortraitAdjustments;
	faces: JianyingPortraitDetectedFace[];
	frameNumber: number;
}): MediaPortraitAdjustments {
	if (!adjustments.faces) return adjustments;
	const detectedByBindingId = new Map(
		faces.map((face) => [face.personBindingId, face] as const)
	);
	let changed = false;
	const rebound = adjustments.faces.map((entry) => {
		if (!entry.personBindingId) return entry;
		const face = detectedByBindingId.get(entry.personBindingId);
		if (!face) return entry;
		const bindingAnchor = { rect: { ...face.rect }, frameNumber };
		const previousRect = entry.bindingAnchor?.rect;
		if (
			entry.trackId === face.trackId &&
			entry.bindingAnchor?.frameNumber === frameNumber &&
			previousRect?.x === bindingAnchor.rect.x &&
			previousRect.y === bindingAnchor.rect.y &&
			previousRect.width === bindingAnchor.rect.width &&
			previousRect.height === bindingAnchor.rect.height
		) {
			return entry;
		}
		changed = true;
		return { ...entry, trackId: face.trackId, bindingAnchor };
	});
	return changed ? { ...adjustments, faces: rebound } : adjustments;
}

export function portraitFaceEntry({
	adjustments,
	personBindingId,
	trackId,
}: {
	adjustments: MediaPortraitAdjustments;
	personBindingId: string;
	trackId: number;
}): MediaPortraitFaceAdjustments | undefined {
	return adjustments.faces?.find((face) =>
		personBindingId
			? face.personBindingId === personBindingId
			: !face.personBindingId && face.trackId === trackId
	);
}

/**
 * Presents one scope's values as if they were the whole element's, so every
 * existing slider and preset control keeps working unchanged while editing a
 * single person.
 */
export function projectPortraitAdjustments({
	adjustments,
	scope,
}: {
	adjustments: MediaPortraitAdjustments;
	scope: PortraitEditScope;
}): MediaPortraitAdjustments {
	if (scope.mode === "all") return adjustments;
	const entry = portraitFaceEntry({
		adjustments,
		personBindingId: scope.personBindingId,
		trackId: scope.trackId,
	});
	return {
		...adjustments,
		values: entry?.values ?? {},
		...(entry?.makeup ? { makeup: entry.makeup } : { makeup: undefined }),
	};
}

/**
 * Folds an edited projection back into the element. Editing a face never
 * touches the legacy layer, and an entry that has been emptied is dropped so
 * the stored shape stays minimal.
 */
export function applyPortraitAdjustments({
	adjustments,
	scope,
	edited,
}: {
	adjustments: MediaPortraitAdjustments;
	scope: PortraitEditScope;
	edited: MediaPortraitAdjustments;
}): MediaPortraitAdjustments {
	if (scope.mode === "all") return edited;
	const current = portraitFaceEntry({
		adjustments,
		personBindingId: scope.personBindingId,
		trackId: scope.trackId,
	});
	const others = (adjustments.faces ?? []).filter(
		(face) =>
			face.personBindingId !== scope.personBindingId &&
			(face.personBindingId !== undefined || face.trackId !== scope.trackId)
	);
	const hasValues = Object.values(edited.values).some((value) => value !== 0);
	const hasMakeup = Object.keys(edited.makeup ?? {}).length > 0;
	const faces = [
		...others,
		...(hasValues || hasMakeup
			? [
					{
						...current,
						trackId: scope.trackId,
						personBindingId: scope.personBindingId,
						bindingAnchor: scope.bindingAnchor,
						values: edited.values,
						...(hasMakeup ? { makeup: edited.makeup } : {}),
					},
				]
			: []),
	].sort((left, right) => {
		if (left.trackId !== right.trackId) return left.trackId - right.trackId;
		return (left.personBindingId ?? "").localeCompare(
			right.personBindingId ?? ""
		);
	});
	return {
		...adjustments,
		enabled: edited.enabled,
		...(faces.length > 0 ? { faces } : { faces: undefined }),
	};
}

export function applyPortraitMakeup({
	adjustments,
	makeup,
}: {
	adjustments: MediaPortraitAdjustments;
	makeup: NonNullable<MediaPortraitAdjustments["makeup"]>;
}): MediaPortraitAdjustments {
	return {
		...adjustments,
		enabled: true,
		...(Object.keys(makeup).length > 0 ? { makeup } : { makeup: undefined }),
	};
}

function withoutBodyValues({
	values,
}: {
	values: MediaPortraitFaceAdjustments["values"];
}): MediaPortraitFaceAdjustments["values"] {
	const faceValues: MediaPortraitFaceAdjustments["values"] = {};
	for (const [key, value] of Object.entries(values) as Array<
		[MediaPortraitAdjustmentKey, number]
	>) {
		if (!key.startsWith("body_adjust_")) faceValues[key] = value;
	}
	return faceValues;
}

/**
 * Body cards operate on the frame rather than a native face id. Keep their
 * values on the shared layer and remove legacy per-face body values, which the
 * runtime cannot represent faithfully.
 */
export function applyWholeFrameBodyAdjustments({
	edited,
}: {
	edited: MediaPortraitAdjustments;
}): MediaPortraitAdjustments {
	const faces = (edited.faces ?? []).flatMap((face) => {
		const values = withoutBodyValues({ values: face.values });
		const hasValues = Object.values(values).some((value) => value !== 0);
		const hasMakeup = Object.keys(face.makeup ?? {}).length > 0;
		if (!hasValues && !hasMakeup) return [];
		return [
			{
				...face,
				values,
			},
		];
	});
	return {
		...edited,
		...(faces.length > 0 ? { faces } : { faces: undefined }),
	};
}
