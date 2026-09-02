import {
	DEFAULT_CANVAS_PRESETS,
	findBestCanvasPreset,
} from "@qcut/editor-core";
import { create } from "zustand";
import type { CanvasMode, CanvasPreset, CanvasSize } from "@/types/editor";

/**
 * Editor store state interface
 * Manages global editor settings, canvas configuration, and initialization state
 */
interface EditorState {
	/** Whether the app is currently initializing */
	isInitializing: boolean;
	/** Whether UI panels are ready for user interaction */
	isPanelsReady: boolean;

	/** Current canvas dimensions for the video project */
	canvasSize: CanvasSize;
	/** Current canvas sizing mode */
	canvasMode: CanvasMode;
	/** Available canvas size presets (16:9, 9:16, etc.) */
	canvasPresets: CanvasPreset[];

	/** Set the app initialization state */
	setInitializing: (loading: boolean) => void;
	/** Set whether panels are ready for interaction */
	setPanelsReady: (ready: boolean) => void;
	/** Initialize the entire application */
	initializeApp: () => Promise<void>;
	/** Set canvas to a specific size */
	setCanvasSize: (size: CanvasSize, mode?: CanvasMode) => void;
	/** Set canvas size to match original media aspect ratio */
	setCanvasSizeToOriginal: (aspectRatio: number) => void;
	/** Set canvas size based on aspect ratio using best matching preset */
	setCanvasSizeFromAspectRatio: (aspectRatio: number) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
	// Initial states
	isInitializing: true,
	isPanelsReady: false,
	canvasSize: { width: 1920, height: 1080 }, // Default 16:9 HD
	canvasMode: "preset" as CanvasMode,
	canvasPresets: [...DEFAULT_CANVAS_PRESETS],

	// Actions
	setInitializing: (loading) => {
		set({ isInitializing: loading });
	},

	setPanelsReady: (ready) => {
		set({ isPanelsReady: ready });
	},

	initializeApp: async () => {
		set({ isInitializing: true, isPanelsReady: false });

		set({ isPanelsReady: true, isInitializing: false });
	},

	setCanvasSize: (size, mode = "preset") => {
		set({ canvasSize: size, canvasMode: mode });
	},

	setCanvasSizeToOriginal: (aspectRatio) => {
		const newCanvasSize = findBestCanvasPreset(aspectRatio);
		set({ canvasSize: newCanvasSize, canvasMode: "original" });
	},

	setCanvasSizeFromAspectRatio: (aspectRatio) => {
		const newCanvasSize = findBestCanvasPreset(aspectRatio);
		set({ canvasSize: newCanvasSize, canvasMode: "custom" });
	},
}));

// Expose for iPad CLI debugging (qcut://eval)
(window as any).__editorStore = useEditorStore;
