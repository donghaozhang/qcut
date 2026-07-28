"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { TimelineElement, CaptionElement } from "@/types/timeline";
import { ScrollArea } from "../../ui/scroll-area";
import { AudioProperties } from "./audio-properties";
import {
	AudioMultiSelectionProperties,
	type AudioBatchSelection,
} from "./audio-multi-selection-properties";
import { MediaProperties } from "./media-properties";
import {
	TextGroupProperties,
	TextProperties,
	type TextGroupSelection,
} from "./text-properties";
import { PanelTabs } from "./panel-tabs";
import { useExportStore } from "@/stores/export-store";
import { ExportPanelContent } from "./export-panel-content";
import { SettingsView } from "./settings-view";
import { PanelView } from "@/types/panel";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { EffectsProperties } from "./effects-properties";
import { TransformProperties } from "./transform-properties";
import { RemotionProperties } from "./remotion-properties";
import { HyperframesProperties } from "./hyperframes-properties";
import { EFFECTS_ENABLED } from "@/config/features";
import { MarkdownProperties } from "./markdown-properties";
import { CaptionProperties } from "./caption-properties";
import { ProjectInfoView } from "./project-info-view";
import { BackgroundView } from "./background-view";
import { PropertyGroup } from "./property-item";
import { ScreenRecordingPanel } from "../screen-recording-panel";
import {
	useScreenRecordingEnhancementStore,
	hasActiveEnhancements,
} from "@/stores/screen-recording-store";
import { TransitionProperties } from "./transition-properties";
import { AdjustmentProperties } from "./adjustment-properties";
import { StickerProperties } from "./sticker-properties";
import { useTranslation } from "@/lib/i18n";

export function PropertiesPanel() {
	const { t } = useTranslation();
	const { selectedElements, selectedTransition, tracks } = useTimelineStore();
	const selectedStickerId = useStickersOverlayStore(
		(state) => state.selectedStickerId
	);
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	const activeEffects = useEffectsStore((s) => s.activeEffects);

	// Helper to check if element has effects
	const hasEffects = (elementId: string) => {
		if (!EFFECTS_ENABLED) return false;
		const effects = activeEffects.get(elementId) || [];
		return effects.length > 0;
	};

	const panelView = useExportStore((s) => s.panelView);
	const setPanelView = useExportStore((s) => s.setPanelView);
	const selectionSignature = selectedTransition
		? `${selectedTransition.trackId}:transition:${selectedTransition.transitionId}`
		: selectedElements.length > 0
			? selectedElements
					.map(({ trackId, elementId }) => `${trackId}:${elementId}`)
					.join("|")
			: selectedStickerId
				? `sticker:${selectedStickerId}`
				: "";
	const previousSelectionSignature = useRef("");
	useEffect(() => {
		if (
			selectionSignature &&
			selectionSignature !== previousSelectionSignature.current
		) {
			setPanelView(PanelView.PROPERTIES);
		}
		previousSelectionSignature.current = selectionSignature;
	}, [selectionSignature, setPanelView]);
	const resolvedSelections = useMemo(
		() =>
			selectedElements.flatMap(({ trackId, elementId }) => {
				const track = tracks.find((candidate) => candidate.id === trackId);
				const element = track?.elements.find(
					(candidate) => candidate.id === elementId
				);
				return element ? [{ trackId, element }] : [];
			}),
		[selectedElements, tracks]
	);
	const resolvedTransition = useMemo(() => {
		if (!selectedTransition) return null;
		const track = tracks.find(
			(candidate) => candidate.id === selectedTransition.trackId
		);
		const transition = track?.transitions?.find(
			(candidate) => candidate.id === selectedTransition.transitionId
		);
		return track && transition ? { track, transition } : null;
	}, [selectedTransition, tracks]);
	const resolvedOverlaySticker = useMemo(() => {
		if (!selectedStickerId || resolvedSelections.length > 0) return null;
		for (const track of tracks) {
			const element = track.elements.find(
				(candidate) =>
					candidate.type === "sticker" &&
					candidate.stickerId === selectedStickerId
			);
			if (element?.type === "sticker") return { trackId: track.id, element };
		}
		return null;
	}, [resolvedSelections.length, selectedStickerId, tracks]);
	const audioBatchSelections = useMemo(
		() =>
			resolvedSelections.flatMap(({ trackId, element }) => {
				if (element.type !== "media") return [];
				const mediaItem = mediaItems.find(
					(candidate) => candidate.id === element.mediaId
				);
				return mediaItem?.type === "audio"
					? ([{ trackId, element }] satisfies AudioBatchSelection[])
					: [];
			}),
		[mediaItems, resolvedSelections]
	);
	const isSingleAudioSelection =
		resolvedSelections.length === 1 && audioBatchSelections.length === 1;
	const isAudioBatchSelection =
		resolvedSelections.length > 1 &&
		audioBatchSelections.length === resolvedSelections.length;
	const textGroupSelections = useMemo(() => {
		if (resolvedSelections.length < 2) return [];
		const textSelections = resolvedSelections.flatMap(({ trackId, element }) =>
			element.type === "text"
				? ([{ trackId, element }] satisfies TextGroupSelection[])
				: []
		);
		if (textSelections.length !== resolvedSelections.length) return [];
		const groupId = textSelections[0]?.element.groupId;
		if (!groupId) return [];
		return textSelections.every(
			(selection) => selection.element.groupId === groupId
		)
			? textSelections
			: [];
	}, [resolvedSelections]);
	const isTextGroupSelection = textGroupSelections.length > 1;
	const showScreenRecordingPanel = useScreenRecordingEnhancementStore(
		(s) => s.cursorTelemetry !== null || hasActiveEnhancements(s)
	);

	const emptyView = (
		<div className="space-y-4 p-5">
			<PropertyGroup
				title={t("editor.panel.projectInfo")}
				defaultExpanded={true}
			>
				<ProjectInfoView />
			</PropertyGroup>
			<PropertyGroup
				title={t("editor.panel.background")}
				defaultExpanded={false}
			>
				<BackgroundView />
			</PropertyGroup>
		</div>
	);

	// Handle media loading states
	if (mediaItemsError) {
		return (
			<ScrollArea className="h-full bg-panel rounded-sm">
				<div className="p-4">
					<div className="text-center">
						<div className="text-red-500 mb-2">
							{t("editor.panel.mediaLoadFailed")}
						</div>
						<div className="text-sm text-muted-foreground">
							{mediaItemsError.message}
						</div>
					</div>
				</div>
			</ScrollArea>
		);
	}

	if (mediaItemsLoading) {
		return (
			<ScrollArea className="h-full bg-panel rounded-sm">
				<div className="p-4">
					<div className="flex items-center justify-center">
						<div className="flex items-center space-x-2">
							<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
							<span>{t("editor.panel.loading")}</span>
						</div>
					</div>
				</div>
			</ScrollArea>
		);
	}

	// Helper function to render element-specific properties
	const renderElementProperties = (
		element: TimelineElement,
		trackId: string
	) => {
		if (element.type === "text") {
			return <TextProperties element={element} trackId={trackId} />;
		}

		if (element.type === "media") {
			const mediaItem = mediaItems.find((item) => item.id === element.mediaId);

			if (mediaItem?.type === "audio") {
				return <AudioProperties element={element} trackId={trackId} />;
			}

			return <MediaProperties element={element} trackId={trackId} />;
		}

		if (element.type === "remotion") {
			return <RemotionProperties element={element} trackId={trackId} />;
		}

		if (element.type === "hyperframes") {
			return <HyperframesProperties element={element} trackId={trackId} />;
		}

		if (element.type === "markdown") {
			return <MarkdownProperties element={element} trackId={trackId} />;
		}

		if (element.type === "adjustment") {
			return <AdjustmentProperties element={element} trackId={trackId} />;
		}

		if (element.type === "sticker") {
			return <StickerProperties element={element} trackId={trackId} />;
		}

		if (element.type === "captions" || (element as any).type === "caption") {
			console.log(
				"[CaptionDebug] Properties panel rendering CaptionProperties for element:",
				element.id,
				"type:",
				element.type
			);
			return (
				<CaptionProperties
					element={element as CaptionElement}
					trackId={trackId}
				/>
			);
		}

		return null;
	};

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden">
			<PanelTabs activeTab={panelView} onTabChange={setPanelView} />
			<div className="min-w-0 flex-1 overflow-auto">
				{panelView === PanelView.EXPORT ? (
					<ExportPanelContent />
				) : panelView === PanelView.SETTINGS ? (
					<SettingsView />
				) : (
					<ScrollArea className="h-full min-w-0 rounded-sm bg-panel">
						{resolvedTransition ? (
							<TransitionProperties
								key={resolvedTransition.transition.id}
								track={resolvedTransition.track}
								transition={resolvedTransition.transition}
							/>
						) : resolvedSelections.length > 0 ? (
							<div
								className={
									isSingleAudioSelection || isAudioBatchSelection
										? ""
										: "min-w-0 space-y-4 overflow-x-hidden p-5"
								}
							>
								{isAudioBatchSelection ? (
									<AudioMultiSelectionProperties
										selections={audioBatchSelections}
									/>
								) : isTextGroupSelection ? (
									<TextGroupProperties selections={textGroupSelections} />
								) : resolvedSelections.length === 1 ? (
									(() => {
										const { trackId, element } = resolvedSelections[0];
										const showEffects =
											EFFECTS_ENABLED && hasEffects(element.id);
										const showTransform =
											element.type === "markdown" ||
											(showEffects && element.type !== "adjustment");
										return (
											<div key={element.id}>
												{showEffects ? (
													<EffectsProperties elementId={element.id} />
												) : null}
												{showTransform ? (
													<TransformProperties
														element={element}
														trackId={trackId}
													/>
												) : null}
												{renderElementProperties(element, trackId)}
											</div>
										);
									})()
								) : (
									<div className="py-8 text-center text-xs text-muted-foreground">
										已选择 {resolvedSelections.length} 个不同类型的片段
									</div>
								)}
								{showScreenRecordingPanel ? <ScreenRecordingPanel /> : null}
							</div>
						) : resolvedOverlaySticker ? (
							<div className="min-w-0 space-y-4 overflow-x-hidden p-5">
								<StickerProperties
									element={resolvedOverlaySticker.element}
									trackId={resolvedOverlaySticker.trackId}
								/>
								{showScreenRecordingPanel ? <ScreenRecordingPanel /> : null}
							</div>
						) : showScreenRecordingPanel ? (
							<div className="space-y-4">
								{emptyView}
								<ScreenRecordingPanel />
							</div>
						) : (
							emptyView
						)}
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
