import { resolveSubtitleStyle } from "@/lib/captions/subtitle-style";
import type {
	SelectedElement,
	CaptionStyleScope,
} from "@/stores/timeline/types";
import type { SubtitleStyle, TimelineTrack } from "@/types/timeline";

export function applyCaptionStyleToTracks({
	tracks,
	selectedElements,
	trackId,
	elementId,
	style,
	scope,
}: {
	tracks: TimelineTrack[];
	selectedElements: SelectedElement[];
	trackId: string;
	elementId: string;
	style: Partial<SubtitleStyle>;
	scope: CaptionStyleScope;
}): { tracks: TimelineTrack[]; updatedCount: number } {
	const selectedCaptionIds = new Set(
		selectedElements.map(
			({ trackId: selectedTrackId, elementId: selectedId }) =>
				`${selectedTrackId}:${selectedId}`
		)
	);
	let updatedCount = 0;

	const nextTracks = tracks.map((track) => {
		const shouldInspectTrack =
			scope === "project" || scope === "selection" || track.id === trackId;
		if (!shouldInspectTrack || track.type !== "captions") return track;

		let trackChanged = false;
		const elements = track.elements.map((element) => {
			if (element.type !== "captions") return element;

			const isTarget =
				scope === "project" ||
				(scope === "track" && track.id === trackId) ||
				(scope === "element" &&
					track.id === trackId &&
					element.id === elementId) ||
				(scope === "selection" &&
					selectedCaptionIds.has(`${track.id}:${element.id}`));
			if (!isTarget) return element;

			const currentStyle = resolveSubtitleStyle(element.style);
			trackChanged = true;
			updatedCount += 1;
			return {
				...element,
				style: {
					...currentStyle,
					...style,
					position: style.position
						? { ...currentStyle.position, ...style.position }
						: currentStyle.position,
				},
			};
		});

		return trackChanged ? { ...track, elements } : track;
	});

	return { tracks: nextTracks, updatedCount };
}
