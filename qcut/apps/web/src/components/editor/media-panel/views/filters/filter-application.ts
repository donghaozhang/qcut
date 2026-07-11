import {
	buildLegacyColorAdjustments,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";
import type { TimelineStore } from "@/stores/timeline/types";
import type { MediaColorSettings } from "@/types/timeline";
import {
	getSelectedMediaTargets,
	type SelectedMediaTarget,
} from "./filter-selection";

type FilterTimelineState = Pick<
	TimelineStore,
	"selectedElements" | "tracks" | "pushHistory" | "updateMediaElement"
>;

export function updateSelectedMediaColors({
	timeline,
	transform,
	history,
}: {
	timeline: FilterTimelineState;
	transform: ({
		settings,
		target,
	}: {
		settings: MediaColorSettings;
		target: SelectedMediaTarget;
	}) => MediaColorSettings | undefined;
	history: boolean;
}): number {
	const targets = getSelectedMediaTargets({
		selectedElements: timeline.selectedElements,
		tracks: timeline.tracks,
	});
	if (targets.length === 0) return 0;
	if (history) timeline.pushHistory();

	let updated = 0;
	for (const target of targets) {
		const settings = normalizeMediaColorSettings({ element: target.element });
		const next = transform({ settings, target });
		if (!next) continue;
		timeline.updateMediaElement(
			target.trackId,
			target.element.id,
			{
				color: next,
				adjustments: buildLegacyColorAdjustments({ settings: next }),
			},
			false
		);
		updated += 1;
	}
	return updated;
}
