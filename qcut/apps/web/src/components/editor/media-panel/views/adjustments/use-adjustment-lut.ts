import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
	buildLegacyColorAdjustments,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";
import { addAdjustmentLayer } from "@/lib/timeline/adjustment-layer";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	AdjustmentElement,
	ColorCubeLut,
	ColorLutSettings,
	ColorMultiPassSettings,
} from "@/types/timeline";

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
	const intensityInteractionActive = useRef(false);
	const intensityInteractionTargetId = useRef("");
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
	const activeLut = useMemo(() => {
		if (!target) return null;
		const settings = normalizeMediaColorSettings({ element: target.element });
		if (settings.multiPass) return null;
		const lut = settings.lut;
		return lut.cube ? lut : null;
	}, [target]);
	const activeMultiPass = useMemo(() => {
		if (!target) return null;
		return (
			normalizeMediaColorSettings({ element: target.element }).multiPass ?? null
		);
	}, [target]);

	const updateActiveLut = useCallback(
		({
			patch,
			pushHistory,
		}: {
			patch: Partial<Pick<ColorLutSettings, "enabled" | "intensity">>;
			pushHistory: boolean;
		}) => {
			if (!target) return false;
			const settings = normalizeMediaColorSettings({ element: target.element });
			if (!settings.lut.cube) return false;
			const next = {
				...settings,
				lut: { ...settings.lut, ...patch },
			};
			updateAdjustmentElement(
				target.trackId,
				target.element.id,
				{
					color: next,
					adjustments: buildLegacyColorAdjustments({ settings: next }),
				},
				pushHistory
			);
			return true;
		},
		[target, updateAdjustmentElement]
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

	const adjustmentDestination = useCallback(
		({ layerName }: { layerName: string }): AdjustmentDestination | null => {
			if (target) {
				return {
					element: target.element,
					elementId: target.element.id,
					trackId: target.trackId,
				};
			}
			const created = createAdjustment({ name: layerName, announce: false });
			return created?.elementId
				? { elementId: created.elementId, trackId: created.trackId }
				: null;
		},
		[createAdjustment, target]
	);

	const applyLut = useCallback(
		({
			name,
			cube,
			skinCube,
			localPortraitResourceId,
			layerName = `LUT - ${name}`,
			successMessage = `已应用 ${name}`,
		}: {
			name: string;
			cube: ColorCubeLut;
			skinCube?: ColorCubeLut;
			localPortraitResourceId?: string;
			layerName?: string;
			successMessage?: string;
		}) => {
			const destination = adjustmentDestination({ layerName });
			if (!destination) return false;
			intensityInteractionActive.current = false;
			intensityInteractionTargetId.current = destination.elementId;

			const settings = normalizeMediaColorSettings({
				element: destination.element ?? {},
			});
			const next = {
				...settings,
				multiPass: undefined,
				lut: {
					...settings.lut,
					enabled: true,
					presetId: "custom" as const,
					name,
					cube,
					dual: skinCube
						? localPortraitResourceId
							? {
									skinCube,
									maskKind: "skin-segmentation-v1" as const,
									resourceId: localPortraitResourceId,
								}
							: { skinCube, maskKind: "skin-tone-v1" as const }
						: undefined,
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
		[adjustmentDestination, updateAdjustmentElement]
	);

	const applyMultiPass = useCallback(
		({
			settings: multiPass,
			layerName = `剪映 Shader - ${multiPass.name}`,
			successMessage = `已应用 ${multiPass.name} 多 Pass Shader`,
		}: {
			settings: ColorMultiPassSettings;
			layerName?: string;
			successMessage?: string;
		}) => {
			const destination = adjustmentDestination({ layerName });
			if (!destination) return false;
			intensityInteractionActive.current = false;
			intensityInteractionTargetId.current = destination.elementId;
			const settings = normalizeMediaColorSettings({
				element: destination.element ?? {},
			});
			const next = {
				...settings,
				lut: { ...settings.lut, enabled: false },
				multiPass: {
					...multiPass,
					passes: multiPass.passes.map((pass) => ({ ...pass })),
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
		[adjustmentDestination, updateAdjustmentElement]
	);

	const setLutEnabled = useCallback(
		({ enabled }: { enabled: boolean }) => {
			intensityInteractionActive.current = false;
			intensityInteractionTargetId.current = target?.element.id ?? "";
			return updateActiveLut({ patch: { enabled }, pushHistory: true });
		},
		[target?.element.id, updateActiveLut]
	);

	const updateLutIntensity = useCallback(
		({ value }: { value: number }) => {
			const targetId = target?.element.id ?? "";
			if (intensityInteractionTargetId.current !== targetId) {
				intensityInteractionActive.current = false;
				intensityInteractionTargetId.current = targetId;
			}
			const pushHistory = !intensityInteractionActive.current;
			const updated = updateActiveLut({
				patch: { intensity: Math.min(100, Math.max(0, value)) },
				pushHistory,
			});
			if (updated) intensityInteractionActive.current = true;
			return updated;
		},
		[target?.element.id, updateActiveLut]
	);

	const completeLutIntensityInteraction = useCallback(() => {
		intensityInteractionActive.current = false;
	}, []);

	const updateActiveMultiPass = useCallback(
		({
			patch,
			pushHistory,
		}: {
			patch: Partial<Pick<ColorMultiPassSettings, "enabled" | "intensity">>;
			pushHistory: boolean;
		}) => {
			if (!target) return false;
			const settings = normalizeMediaColorSettings({ element: target.element });
			if (!settings.multiPass) return false;
			const next = {
				...settings,
				multiPass: { ...settings.multiPass, ...patch },
			};
			updateAdjustmentElement(
				target.trackId,
				target.element.id,
				{
					color: next,
					adjustments: buildLegacyColorAdjustments({ settings: next }),
				},
				pushHistory
			);
			return true;
		},
		[target, updateAdjustmentElement]
	);

	const setMultiPassEnabled = useCallback(
		({ enabled }: { enabled: boolean }) => {
			intensityInteractionActive.current = false;
			intensityInteractionTargetId.current = target?.element.id ?? "";
			return updateActiveMultiPass({ patch: { enabled }, pushHistory: true });
		},
		[target?.element.id, updateActiveMultiPass]
	);

	const updateMultiPassIntensity = useCallback(
		({ value }: { value: number }) => {
			const targetId = target?.element.id ?? "";
			if (intensityInteractionTargetId.current !== targetId) {
				intensityInteractionActive.current = false;
				intensityInteractionTargetId.current = targetId;
			}
			const pushHistory = !intensityInteractionActive.current;
			const updated = updateActiveMultiPass({
				patch: { intensity: Math.min(100, Math.max(0, value)) },
				pushHistory,
			});
			if (updated) intensityInteractionActive.current = true;
			return updated;
		},
		[target?.element.id, updateActiveMultiPass]
	);

	return {
		activeLut,
		activeMultiPass,
		applyLut,
		applyMultiPass,
		completeLutIntensityInteraction,
		createAdjustment,
		setLutEnabled,
		setMultiPassEnabled,
		target,
		updateLutIntensity,
		updateMultiPassIntensity,
	};
}
