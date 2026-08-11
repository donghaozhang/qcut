import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
	buildLegacyColorAdjustments,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";
import { addAdjustmentLayer } from "@/lib/timeline/adjustment-layer";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { AdjustmentElement, ColorCubeLut } from "@/types/timeline";

interface SelectedAdjustmentTarget {
	element: AdjustmentElement;
	trackId: string;
}

interface AdjustmentDestination {
	element?: AdjustmentElement;
	elementId: string;
	trackId: string;
}

function selectedAdjustmentTarget({
	selectedElements,
	tracks,
}: {
	selectedElements: ReturnType<
		typeof useTimelineStore.getState
	>["selectedElements"];
	tracks: ReturnType<typeof useTimelineStore.getState>["tracks"];
}): SelectedAdjustmentTarget | null {
	for (const selection of selectedElements) {
		const track = tracks.find(
			(candidate) => candidate.id === selection.trackId
		);
		const element = track?.elements.find(
			(candidate) => candidate.id === selection.elementId
		);
		if (element?.type === "adjustment") {
			return {
				element: element as AdjustmentElement,
				trackId: selection.trackId,
			};
		}
	}
	return null;
}

export function useAdjustmentLut() {
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const insertTrackAt = useTimelineStore((state) => state.insertTrackAt);
	const addElementToTrack = useTimelineStore(
		(state) => state.addElementToTrack
	);
	const getTotalDuration = useTimelineStore((state) => state.getTotalDuration);
	const updateAdjustmentElement = useTimelineStore(
		(state) => state.updateAdjustmentElement
	);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const target = useMemo(
		() => selectedAdjustmentTarget({ selectedElements, tracks }),
		[selectedElements, tracks]
	);

	const createAdjustment = useCallback(
		({
			name = "自定义调节",
			announce = true,
		}: {
			name?: string;
			announce?: boolean;
		} = {}) => {
			const created = addAdjustmentLayer({
				timeline: {
					tracks,
					insertTrackAt,
					addElementToTrack,
					getTotalDuration,
				},
				currentTime,
				name,
			});
			if (!created.elementId) {
				toast.error("无法创建调节层");
				return null;
			}
			if (announce) toast.success("已新建调节层");
			return created;
		},
		[addElementToTrack, currentTime, getTotalDuration, insertTrackAt, tracks]
	);

	const applyLut = useCallback(
		({
			name,
			cube,
			layerName = `LUT - ${name}`,
			successMessage = `已应用 ${name}`,
		}: {
			name: string;
			cube: ColorCubeLut;
			layerName?: string;
			successMessage?: string;
		}) => {
			const created = target
				? null
				: createAdjustment({ name: layerName, announce: false });
			const destination: AdjustmentDestination | null = target
				? {
						element: target.element,
						elementId: target.element.id,
						trackId: target.trackId,
					}
				: created?.elementId
					? {
							elementId: created.elementId,
							trackId: created.trackId,
						}
					: null;
			if (!destination) return false;

			const settings = normalizeMediaColorSettings({
				element: destination.element ?? {},
			});
			const next = {
				...settings,
				lut: {
					...settings.lut,
					enabled: true,
					presetId: "custom" as const,
					name,
					cube,
				},
			};
			updateAdjustmentElement(
				destination.trackId,
				destination.elementId,
				{
					color: next,
					adjustments: buildLegacyColorAdjustments({ settings: next }),
				},
				Boolean(destination.element)
			);
			toast.success(successMessage);
			return true;
		},
		[createAdjustment, target, updateAdjustmentElement]
	);

	return { applyLut, createAdjustment, target };
}
