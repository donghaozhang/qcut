import { create } from "zustand";
import type { PortraitFaceDetection } from "@/lib/portrait/jianying-portrait-face-detection";
import type { PortraitEditScope } from "@/lib/portrait/portrait-face-scope";

/**
 * Transient face-detection view state, shared between the properties panel
 * (which runs detection and edits one person) and the preview overlay (which
 * draws the boxes). It describes the current frame, never the project, so it
 * is never persisted and is cleared whenever the element selection changes.
 */
interface PortraitFaceState {
	detection: PortraitFaceDetection | null;
	scope: PortraitEditScope;
	setDetection: (detection: PortraitFaceDetection | null) => void;
	setScope: (scope: PortraitEditScope) => void;
	reset: () => void;
}

export const usePortraitFaceStore = create<PortraitFaceState>((set) => ({
	detection: null,
	scope: { mode: "all" },
	setDetection: (detection) => set({ detection }),
	setScope: (scope) => set({ scope }),
	reset: () => set({ detection: null, scope: { mode: "all" } }),
}));
