"use client";

import { TabBar } from "./tabbar";
import { MediaView } from "./views/media";
import { useMediaPanelStore, Tab } from "./store";
import { TextView } from "./views/text";
import { Text2ImageView } from "./views/text2image";
import { AiView } from "./views/ai";
import { StickersView } from "./views/stickers/stickers-view";
import { SoundsView } from "./views/sounds";
import { AIVoiceView } from "./views/sounds-ai-voice";
import { SkillsView } from "./views/skills";
import VideoEditView from "./views/video-edit";
import { SegmentationPanel } from "@/components/editor/segmentation";
import { RemotionView } from "./views/remotion";
import { HyperframesView } from "./views/hyperframes";
import { TemplatesView } from "./views/templates";
import { PtyTerminalView } from "./views/pty-terminal";
import { WordTimelineView } from "./views/word-timeline-view";
import { ProjectFolderView } from "./views/project-folder";
import { UpscaleView } from "./views/upscale";
import { MoyinView } from "./views/moyin";
import { GeminiTerminalView } from "./views/gemini-terminal";
import { SearchView } from "./views/search-view";
import { TransitionsView } from "./views/transitions";
import { FiltersView } from "./views/filters";
import { createElement, lazy, Suspense, type ReactNode } from "react";
import { EFFECTS_ENABLED } from "@/config/features";
import { CaptionsView } from "./views/captions";
import { AdjustmentsView } from "./views/adjustments";
import { DigitalHumanView } from "./views/digital-human";
import { StandardEditorNavigation } from "./standard-editor-navigation";

// Lazy load effects view only when enabled
const EffectsView = lazy(() =>
	EFFECTS_ENABLED
		? import("./views/effects")
		: Promise.resolve({
				default: () => createElement("div", null, "Effects disabled"),
			})
);

/** Root media panel component that renders the group bar, tab bar, and active tab view. */
export function MediaPanel() {
	const activeTab = useMediaPanelStore((state) => state.activeTab);
	const activeGroup = useMediaPanelStore((state) => state.activeGroup);
	const activeEditSubgroup = useMediaPanelStore(
		(state) => state.activeEditSubgroup
	);
	const showWorkspaceTabs =
		activeGroup === "ai-create" ||
		activeGroup === "agents" ||
		(activeGroup === "edit" && activeEditSubgroup === "ai-edit");

	const viewMap: Record<Exclude<Tab, "pty">, ReactNode> = {
		media: <MediaView />,
		audio: <SoundsView />,
		captions: <CaptionsView />,
		text: <TextView />,
		stickers: <StickersView />,
		"video-edit": <VideoEditView />,
		effects: EFFECTS_ENABLED ? (
			<Suspense fallback={<div className="p-4">Loading effects...</div>}>
				<EffectsView />
			</Suspense>
		) : (
			<div className="p-4 text-muted-foreground">
				Effects view coming soon...
			</div>
		),
		transitions: <TransitionsView />,
		filters: <FiltersView />,
		adjustments: <AdjustmentsView />,
		templates: <TemplatesView />,
		text2image: <Text2ImageView />,
		"nano-edit": <SkillsView />,
		ai: <AiView />,
		sounds: <AIVoiceView />,
		segmentation: <SegmentationPanel />,
		remotion: <RemotionView />,
		hyperframes: <HyperframesView />,
		"word-timeline": <WordTimelineView />,
		"project-folder": <ProjectFolderView />,
		upscale: <UpscaleView />,
		moyin: <MoyinView />,
		"ai-chat": <GeminiTerminalView />,
		"digital-human": <DigitalHumanView />,
		search: <SearchView />,
	};

	const activeNonPtyTab = activeTab === "pty" ? null : activeTab;

	return (
		<div
			className="h-full flex flex-col bg-panel rounded-lg overflow-hidden"
			data-testid="media-panel"
		>
			<StandardEditorNavigation />
			{showWorkspaceTabs ? <TabBar /> : null}
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
