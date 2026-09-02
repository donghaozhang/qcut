import { create } from "zustand";

/**
 * Preview-side "拖拽变形" mode: while active for an element, the media
 * transform overlay swaps its resize handles for draggable perspective corners.
 */
interface PerspectiveEditorState {
	editingElementId: string | null;
	setEditing: (elementId: string | null) => void;
	toggleEditing: (elementId: string) => void;
}

export const usePerspectiveEditorStore = create<PerspectiveEditorState>(
	(set, get) => ({
		editingElementId: null,
		setEditing: (elementId) => set({ editingElementId: elementId }),
		toggleEditing: (elementId) =>
			set({
				editingElementId:
					get().editingElementId === elementId ? null : elementId,
			}),
	})
);
