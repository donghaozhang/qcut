import { create } from "zustand";

export type PreviewMode = "video" | "mcp" | "agent";

interface PreviewModeState {
	/** Which view is active in the center preview panel */
	previewMode: PreviewMode;
	isPreviewExpanded: boolean;
	setPreviewMode: (mode: PreviewMode) => void;
	setPreviewExpanded: ({ expanded }: { expanded: boolean }) => void;
}

export const usePreviewModeStore = create<PreviewModeState>((set) => ({
	previewMode: "video",
	isPreviewExpanded: false,
	setPreviewMode: (mode) => set({ previewMode: mode }),
	setPreviewExpanded: ({ expanded }) => set({ isPreviewExpanded: expanded }),
}));
