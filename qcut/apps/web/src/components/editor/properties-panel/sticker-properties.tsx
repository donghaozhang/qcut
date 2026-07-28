import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n";
import {
	DEFAULT_TIMELINE_STICKER_VISUAL,
	resolveTimelineStickerVisualAtTime,
} from "@/lib/stickers/timeline-sticker-visual";
import {
	getStickerFrameContext,
	getStickerPropertyKeyframes,
	removeStickerKeyframe,
	STICKER_BASIC_KEYFRAME_PROPERTIES,
	STICKER_KEYFRAME_PROPERTIES,
	STICKER_PERSPECTIVE_KEYFRAME_PROPERTIES,
	upsertStickerKeyframe,
} from "@/lib/stickers/sticker-keyframes";
import { useEditorStore } from "@/stores/editor/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	generateUUID,
	type MediaPerspective,
	type StickerElement,
	type StickerKeyframeProperty,
} from "@/types/timeline";
import { StickerAnimationProperties } from "./sticker-animation-properties";
import { StickerBasicProperties } from "./sticker-basic-properties";
import { StickerDeformationProperties } from "./sticker-deformation-properties";
import type { UpdateStickerProperties } from "./sticker-property-types";
import { StickerTrackingProperties } from "./sticker-tracking-properties";

const DEFAULT_PERSPECTIVE: MediaPerspective = {
	...DEFAULT_TIMELINE_STICKER_VISUAL.perspective,
};

export function StickerProperties({
	element,
	trackId,
}: {
	element: StickerElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const updateStickerElement = useTimelineStore(
		(state) => state.updateStickerElement
	);
	const pushHistory = useTimelineStore((state) => state.pushHistory);
	const tracks = useTimelineStore((state) => state.tracks);
	const selectElement = useTimelineStore((state) => state.selectElement);
	const canvasSize = useEditorStore((state) => state.canvasSize);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const overlaySticker = useStickersOverlayStore((state) =>
		state.overlayStickers.get(element.stickerId)
	);
	const updateOverlaySticker = useStickersOverlayStore(
		(state) => state.updateOverlaySticker
	);
	const saveHistorySnapshot = useStickersOverlayStore(
		(state) => state.saveHistorySnapshot
	);
	const interactionActive = useRef(false);
	const visual = resolveTimelineStickerVisualAtTime({
		element,
		currentTime,
		fps,
		fallback: overlaySticker,
	});
	const { clipLocalFrame: currentFrame } = getStickerFrameContext({
		element,
		currentTime,
		fps,
	});
	const perspective: MediaPerspective = visual.perspective
		? { ...visual.perspective }
		: { ...DEFAULT_PERSPECTIVE };
	const animationInType =
		visual.animationInType ?? DEFAULT_TIMELINE_STICKER_VISUAL.animationInType;
	const animationInDuration =
		visual.animationInDuration ??
		DEFAULT_TIMELINE_STICKER_VISUAL.animationInDuration;
	const animationOutType =
		visual.animationOutType ?? DEFAULT_TIMELINE_STICKER_VISUAL.animationOutType;
	const animationOutDuration =
		visual.animationOutDuration ??
		DEFAULT_TIMELINE_STICKER_VISUAL.animationOutDuration;
	const animationLoopType =
		visual.animationLoopType ??
		DEFAULT_TIMELINE_STICKER_VISUAL.animationLoopType;
	const animationLoopIntensity =
		visual.animationLoopIntensity ??
		DEFAULT_TIMELINE_STICKER_VISUAL.animationLoopIntensity;

	const saveHistoryCheckpoint = () => {
		pushHistory();
		saveHistorySnapshot({ syncTimelineHistory: false });
	};
	const beginInteraction = () => {
		if (interactionActive.current) return;
		interactionActive.current = true;
		saveHistoryCheckpoint();
	};
	const endInteraction = () => {
		interactionActive.current = false;
	};
	const update: UpdateStickerProperties = ({
		clearKeyframes,
		history = false,
		keyframeValues,
		updates,
	}) => {
		if (history) saveHistoryCheckpoint();

		let timelineUpdates = updates;
		let nextKeyframes = element.keyframes;
		let keyframesChanged = false;
		if (clearKeyframes?.length) {
			nextKeyframes = { ...nextKeyframes };
			for (const property of clearKeyframes) nextKeyframes[property] = [];
			keyframesChanged = true;
		}
		for (const [property, value] of Object.entries(keyframeValues ?? {}) as [
			StickerKeyframeProperty,
			number,
		][]) {
			const keyframes = getStickerPropertyKeyframes({ element, property });
			if (keyframes.length === 0) continue;
			const existing = keyframes.find(
				(keyframe) => keyframe.frame === currentFrame
			);
			nextKeyframes = {
				...nextKeyframes,
				[property]: upsertStickerKeyframe({
					keyframes,
					keyframe: {
						id: existing?.id ?? generateUUID(),
						frame: currentFrame,
						value,
						easing: existing?.easing ?? "linear",
					},
				}),
			};
			keyframesChanged = true;
		}
		if (keyframesChanged) {
			timelineUpdates = { ...updates, keyframes: nextKeyframes };
		}

		updateStickerElement(trackId, element.id, timelineUpdates, false);
		updateOverlaySticker(
			element.stickerId,
			{
				position: {
					x: updates.x ?? visual.position.x,
					y: updates.y ?? visual.position.y,
				},
				size: {
					width: updates.width ?? visual.size.width,
					height: updates.height ?? visual.size.height,
				},
				rotation: updates.rotation ?? visual.rotation,
				opacity: updates.opacity ?? visual.opacity,
				maintainAspectRatio:
					updates.maintainAspectRatio ?? visual.maintainAspectRatio,
				perspective: updates.perspective ?? perspective,
				animationInType: updates.animationInType ?? animationInType,
				animationInDuration: updates.animationInDuration ?? animationInDuration,
				animationOutType: updates.animationOutType ?? animationOutType,
				animationOutDuration:
					updates.animationOutDuration ?? animationOutDuration,
				animationLoopType: updates.animationLoopType ?? animationLoopType,
				animationLoopIntensity:
					updates.animationLoopIntensity ?? animationLoopIntensity,
			},
			{
				syncTimeline: false,
			}
		);
	};
	const isKeyframed = ({ property }: { property: StickerKeyframeProperty }) =>
		getStickerPropertyKeyframes({ element, property }).some(
			(keyframe) => keyframe.frame === currentFrame
		);
	const toggleKeyframe = ({
		property,
		value,
	}: {
		property: StickerKeyframeProperty;
		value: number;
	}) => {
		const keyframes = getStickerPropertyKeyframes({ element, property });
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === currentFrame
		);
		const nextPropertyKeyframes = existing
			? removeStickerKeyframe({ keyframes, frame: currentFrame })
			: upsertStickerKeyframe({
					keyframes,
					keyframe: {
						id: generateUUID(),
						frame: currentFrame,
						value,
						easing: "linear",
					},
				});
		update({
			history: true,
			updates: {
				keyframes: {
					...element.keyframes,
					[property]: nextPropertyKeyframes,
				},
			},
		});
	};
	const keyframeControls = { isKeyframed, toggleKeyframe };

	const resetBasic = () =>
		update({
			clearKeyframes: [...STICKER_BASIC_KEYFRAME_PROPERTIES],
			history: true,
			updates: {
				x: 50,
				y: 50,
				width: 15,
				height: 15,
				rotation: 0,
				opacity: 1,
				maintainAspectRatio: true,
			},
		});
	const resetDeformation = () =>
		update({
			clearKeyframes: [...STICKER_PERSPECTIVE_KEYFRAME_PROPERTIES],
			history: true,
			updates: { perspective: { ...DEFAULT_PERSPECTIVE } },
		});
	const resetAll = () =>
		update({
			clearKeyframes: [...STICKER_KEYFRAME_PROPERTIES],
			history: true,
			updates: {
				x: 50,
				y: 50,
				width: 15,
				height: 15,
				rotation: 0,
				opacity: 1,
				maintainAspectRatio: true,
				perspective: { ...DEFAULT_PERSPECTIVE },
				animationInType: "none",
				animationInDuration: 0.5,
				animationOutType: "none",
				animationOutDuration: 0.5,
				animationLoopType: "none",
				animationLoopIntensity: 0.5,
			},
		});

	return (
		<div className="min-w-0 space-y-4" data-testid="sticker-properties">
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-sm font-medium">{t("stickerProperties.title")}</h3>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={resetAll}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<RotateCcw className="size-3.5" />
					{t("mediaProperties.resetAll")}
				</Button>
			</div>

			<Tabs defaultValue="basic">
				<TabsList className="grid h-8 w-full grid-cols-4 gap-0.5 rounded-sm p-0.5">
					<TabsTrigger value="basic" className="px-1 text-xs">
						{t("stickerProperties.tab.basic")}
					</TabsTrigger>
					<TabsTrigger value="deformation" className="px-1 text-xs">
						{t("stickerProperties.tab.deformation")}
					</TabsTrigger>
					<TabsTrigger value="animation" className="px-1 text-xs">
						{t("stickerProperties.tab.animation")}
					</TabsTrigger>
					<TabsTrigger value="tracking" className="px-1 text-xs">
						{t("stickerProperties.tab.tracking")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="basic" className="mt-4 space-y-4">
					<StickerBasicProperties
						visual={visual}
						canvasSize={canvasSize}
						keyframeControls={keyframeControls}
						update={update}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
						onReset={resetBasic}
					/>
				</TabsContent>

				<TabsContent value="deformation" className="mt-4 space-y-4">
					<StickerDeformationProperties
						perspective={perspective}
						keyframeControls={keyframeControls}
						update={update}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
						onReset={resetDeformation}
					/>
				</TabsContent>

				<TabsContent value="animation" className="mt-4 space-y-4">
					<StickerAnimationProperties
						animationInType={animationInType}
						animationInDuration={animationInDuration}
						animationOutType={animationOutType}
						animationOutDuration={animationOutDuration}
						animationLoopType={animationLoopType}
						animationLoopIntensity={animationLoopIntensity}
						update={update}
						onInteractionStart={beginInteraction}
						onInteractionEnd={endInteraction}
					/>
				</TabsContent>

				<TabsContent value="tracking" className="mt-4 space-y-4">
					<StickerTrackingProperties
						element={element}
						tracks={tracks}
						currentTime={currentTime}
						fps={fps}
						canvasSize={canvasSize}
						update={update}
						selectElement={selectElement}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
