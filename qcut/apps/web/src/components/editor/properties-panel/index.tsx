"use client";

import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineElement, CaptionElement } from "@/types/timeline";
import { ScrollArea } from "../../ui/scroll-area";
import { AudioProperties } from "./audio-properties";
import { MediaProperties } from "./media-properties";
import { TextProperties } from "./text-properties";
import { PanelTabs } from "./panel-tabs";
import { useExportStore } from "@/stores/export-store";
import { ExportPanelContent } from "./export-panel-content";
import { SettingsView } from "./settings-view";
import { PanelView } from "@/types/panel";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { EffectsProperties } from "./effects-properties";
import { TransformProperties } from "./transform-properties";
import { RemotionProperties } from "./remotion-properties";
import { EFFECTS_ENABLED } from "@/config/features";
import { MarkdownProperties } from "./markdown-properties";
import { CaptionProperties } from "./caption-properties";
import { ProjectInfoView } from "./project-info-view";
import { BackgroundView } from "./background-view";
import { PropertyGroup } from "./property-item";

export function PropertiesPanel() {
	const { selectedElements, tracks } = useTimelineStore();
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

	const emptyView = (
		<div className="space-y-4 p-5">
			<PropertyGroup title="Project Information" defaultExpanded={true}>
				<ProjectInfoView />
			</PropertyGroup>
			<PropertyGroup title="Background" defaultExpanded={false}>
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
						<div className="text-red-500 mb-2">Failed to load media items</div>
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
							<span>Loading properties...</span>
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

		if (element.type === "markdown") {
			return <MarkdownProperties element={element} trackId={trackId} />;
		}

		if (
			element.type === "captions" ||
			(element as any).type === "caption"
		) {
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
		<div className="h-full flex flex-col">
			<PanelTabs activeTab={panelView} onTabChange={setPanelView} />
			<div className="flex-1 overflow-auto">
				{panelView === PanelView.EXPORT ? (
					<ExportPanelContent />
				) : panelView === PanelView.SETTINGS ? (
					<SettingsView />
				) : (
					<ScrollArea className="h-full bg-panel rounded-sm">
						{selectedElements.length > 0 ? (
							<div className="p-5 space-y-4">
								{selectedElements.map(({ trackId, elementId }) => {
									const track = tracks.find((t) => t.id === trackId);
									const element = track?.elements.find(
										(e) => e.id === elementId
									);

									if (!element) return null;

									const showEffects = EFFECTS_ENABLED && hasEffects(element.id);
									const showTransform =
										element.type === "text" ||
										element.type === "markdown" ||
										showEffects;

									return (
										<div key={elementId}>
											{showEffects && (
												<EffectsProperties elementId={element.id} />
											)}
											{showTransform && (
												<TransformProperties
													element={element}
													trackId={trackId}
												/>
											)}
											{renderElementProperties(element, trackId)}
										</div>
									);
								})}
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
