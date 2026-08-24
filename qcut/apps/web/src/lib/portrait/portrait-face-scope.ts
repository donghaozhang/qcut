import type {
	MediaPortraitAdjustments,
	MediaPortraitFaceAdjustments,
} from "@/types/timeline";

/**
 * Which adjustment set the panel is editing. `all` is the legacy whole-frame
 * layer; a track id edits that one person's set.
 */
export type PortraitEditScope =
	| { mode: "all" }
	| { mode: "face"; trackId: number };

export function portraitFaceEntry({
	adjustments,
	trackId,
}: {
	adjustments: MediaPortraitAdjustments;
	trackId: number;
}): MediaPortraitFaceAdjustments | undefined {
	return adjustments.faces?.find((face) => face.trackId === trackId);
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
	const entry = portraitFaceEntry({ adjustments, trackId: scope.trackId });
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
	const others = (adjustments.faces ?? []).filter(
		(face) => face.trackId !== scope.trackId
	);
	const hasValues = Object.values(edited.values).some((value) => value !== 0);
	const hasMakeup = Object.keys(edited.makeup ?? {}).length > 0;
	const faces = [
		...others,
		...(hasValues || hasMakeup
			? [
					{
						trackId: scope.trackId,
						values: edited.values,
						...(hasMakeup ? { makeup: edited.makeup } : {}),
					},
				]
			: []),
	].sort((left, right) => left.trackId - right.trackId);
	return {
		...adjustments,
		enabled: edited.enabled,
		...(faces.length > 0 ? { faces } : { faces: undefined }),
	};
}
