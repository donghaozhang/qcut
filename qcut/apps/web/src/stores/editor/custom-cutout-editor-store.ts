import { create } from "zustand";

export type CustomCutoutTool = "foreground" | "background" | "erase";

interface CustomCutoutEditorState {
	elementId: string | null;
	editing: boolean;
	tool: CustomCutoutTool;
	brushSize: number;
	startEditing: (elementId: string) => void;
	stopEditing: () => void;
	setTool: (tool: CustomCutoutTool) => void;
	setBrushSize: (brushSize: number) => void;
	clear: () => void;
}

export const useCustomCutoutEditorStore = create<CustomCutoutEditorState>(
	(set) => ({
		elementId: null,
		editing: false,
		tool: "foreground",
		brushSize: 0.08,
		startEditing: (elementId) => set({ elementId, editing: true }),
		stopEditing: () => set({ editing: false }),
		setTool: (tool) => set({ tool }),
		setBrushSize: (brushSize) =>
			set({ brushSize: Math.min(0.25, Math.max(0.005, brushSize)) }),
		clear: () =>
			set({
				elementId: null,
				editing: false,
				tool: "foreground",
				brushSize: 0.08,
			}),
	})
);
