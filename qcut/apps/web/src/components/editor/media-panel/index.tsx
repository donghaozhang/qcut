"use client";

import { GroupBar } from "./group-bar";
import { TabBar } from "./tabbar";
import { MediaView } from "./views/media";
import { useMediaPanelStore, Tab } from "./store";
import { TextView } from "./views/text";
import { Text2ImageView } from "./views/text2image";
import { AiView } from "./views/ai";
import { StickersView } from "./views/stickers";
import { SoundsView } from "./views/sounds";
import { SkillsView } from "./views/skills";
import VideoEditView from "./views/video-edit";
import { SegmentationPanel } from "@/components/editor/segmentation";
import { RemotionView } from "./views/remotion";
import { PtyTerminalView } from "./views/pty-terminal";
import { WordTimelineView } from "./views/word-timeline-view";
import { ProjectFolderView } from "./views/project-folder";
import { UpscaleView } from "./views/upscale";
import { MoyinView } from "./views/moyin";
import React from "react";
import { EFFECTS_ENABLED } from "@/config/features";

// Lazy load effects view only when enabled
const EffectsView = React.lazy(() =>
	EFFECTS_ENABLED
		? import("./views/effects")
		: Promise.resolve({
				default: () => React.createElement("div", null, "Effects disabled"),
			})
);

/** Root media panel component that renders the group bar, tab bar, and active tab view. */
export function MediaPanel() {
	const activeTab = useMediaPanelStore((state) => state.activeTab);

	const viewMap: Record<Exclude<Tab, "pty">, React.ReactNode> = {
		media: <MediaView />,
		text: <TextView />,
		stickers: <StickersView />,
		"video-edit": <VideoEditView />,
		effects: EFFECTS_ENABLED ? (
			<React.Suspense fallback={<div className="p-4">Loading effects...</div>}>
				<EffectsView />
			</React.Suspense>
		) : (
			<div className="p-4 text-muted-foreground">
				Effects view coming soon...
			</div>
		),
		transitions: (
			<div className="p-4 text-muted-foreground">
				Transitions view coming soon...
			</div>
		),
		filters: (
			<div className="p-4 text-muted-foreground">
				Filters view coming soon...
			</div>
		),
		text2image: <Text2ImageView />,
		"nano-edit": <SkillsView />,
		ai: <AiView />,
		sounds: <SoundsView />,
		segmentation: <SegmentationPanel />,
		remotion: <RemotionView />,
		"word-timeline": <WordTimelineView />,
		"project-folder": <ProjectFolderView />,
		upscale: <UpscaleView />,
		moyin: <MoyinView />,
	};

	const activeNonPtyTab = activeTab === "pty" ? null : activeTab;

	return (
		<div
			className="h-full flex flex-col bg-panel rounded-lg overflow-hidden"
			data-testid="media-panel"
		>
			<GroupBar />
			<TabBar />
			<div
				className="flex-1 min-h-0"
				style={{ display: activeTab === "pty" ? "flex" : "none" }}
				data-testid="media-panel-pty-container"
			>
				<PtyTerminalView />
			</div>
			{activeNonPtyTab && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					{viewMap[activeNonPtyTab]}
				</div>
			)}
		</div>
	);
}
