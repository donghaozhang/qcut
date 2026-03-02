import { create } from "zustand";

export type PreviewMode = "video" | "mcp" | "agent";

interface PreviewModeState {
	/** Which view is active in the center preview panel */
	previewMode: PreviewMode;
	setPreviewMode: (mode: PreviewMode) => void;
}

export const usePreviewModeStore = create<PreviewModeState>((set) => ({
	previewMode: "video",
	setPreviewMode: (mode) => set({ previewMode: mode }),
}));
