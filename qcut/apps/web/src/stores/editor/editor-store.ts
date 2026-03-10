import { create } from "zustand";
import { CanvasSize, CanvasPreset } from "@/types/editor";

/** Canvas sizing mode - determines how canvas dimensions are calculated */
type CanvasMode = "preset" | "original" | "custom";

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
	setCanvasSize: (size: CanvasSize) => void;
	/** Set canvas size to match original media aspect ratio */
	setCanvasSizeToOriginal: (aspectRatio: number) => void;
	/** Set canvas size based on aspect ratio using best matching preset */
	setCanvasSizeFromAspectRatio: (aspectRatio: number) => void;
}

const DEFAULT_CANVAS_PRESETS: CanvasPreset[] = [
	{ name: "16:9", width: 1920, height: 1080 },
	{ name: "9:16", width: 1080, height: 1920 },
	{ name: "1:1", width: 1080, height: 1080 },
	{ name: "4:3", width: 1440, height: 1080 },
];

/**
 * Finds the best matching canvas preset for a given aspect ratio
 * Falls back to custom dimensions if no preset matches closely enough
 * @param aspectRatio - Target aspect ratio (width/height)
 * @returns Canvas size with width and height dimensions
 */
const findBestCanvasPreset = (aspectRatio: number): CanvasSize => {
	// Calculate aspect ratio for each preset and find the closest match
	let bestMatch = DEFAULT_CANVAS_PRESETS[0]; // Default to 16:9 HD
	let smallestDifference = Math.abs(
		aspectRatio - bestMatch.width / bestMatch.height
	);

	for (const preset of DEFAULT_CANVAS_PRESETS) {
		const presetAspectRatio = preset.width / preset.height;
		const difference = Math.abs(aspectRatio - presetAspectRatio);

		if (difference < smallestDifference) {
			smallestDifference = difference;
			bestMatch = preset;
		}
	}

	// If the difference is still significant (> 0.1), create a custom size
	// based on the media aspect ratio with a reasonable resolution
	const bestAspectRatio = bestMatch.width / bestMatch.height;
	if (Math.abs(aspectRatio - bestAspectRatio) > 0.1) {
		// Create custom dimensions based on the aspect ratio
		if (aspectRatio > 1) {
			// Landscape - use 1920 width
			return { width: 1920, height: Math.round(1920 / aspectRatio) };
		}
		// Portrait or square - use 1080 height
		return { width: Math.round(1080 * aspectRatio), height: 1080 };
	}

	return { width: bestMatch.width, height: bestMatch.height };
};

export const useEditorStore = create<EditorState>((set, get) => ({
	// Initial states
	isInitializing: true,
	isPanelsReady: false,
	canvasSize: { width: 1920, height: 1080 }, // Default 16:9 HD
	canvasMode: "preset" as CanvasMode,
	canvasPresets: DEFAULT_CANVAS_PRESETS,

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

	setCanvasSize: (size) => {
		set({ canvasSize: size, canvasMode: "preset" });
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
