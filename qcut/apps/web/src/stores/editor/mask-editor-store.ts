import { create } from "zustand";

interface MaskEditorState {
	selectedElementId: string | null;
	selectedMaskId: string | null;
	isEditing: boolean;
	selectMask: (elementId: string, maskId: string) => void;
	setEditing: (editing: boolean) => void;
	clearSelection: () => void;
}

export const useMaskEditorStore = create<MaskEditorState>((set) => ({
	selectedElementId: null,
	selectedMaskId: null,
	isEditing: false,
	selectMask: (elementId, maskId) =>
		set({ selectedElementId: elementId, selectedMaskId: maskId }),
	setEditing: (isEditing) => set({ isEditing }),
	clearSelection: () =>
		set({ selectedElementId: null, selectedMaskId: null, isEditing: false }),
}));
