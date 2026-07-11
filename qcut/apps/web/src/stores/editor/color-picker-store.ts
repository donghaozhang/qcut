import { create } from "zustand";

export interface PickedPreviewColor {
	r: number;
	g: number;
	b: number;
}

interface ColorPickerState {
	active: boolean;
	complete: (color: PickedPreviewColor) => void;
	cancel: () => void;
}

let resolvePendingPick:
	| ((color: PickedPreviewColor | undefined) => void)
	| undefined;

export const useColorPickerStore = create<ColorPickerState>((set) => ({
	active: false,
	complete: (color) => {
		resolvePendingPick?.(color);
		resolvePendingPick = undefined;
		set({ active: false });
	},
	cancel: () => {
		resolvePendingPick?.(undefined);
		resolvePendingPick = undefined;
		set({ active: false });
	},
}));

export function requestPreviewColor(): Promise<PickedPreviewColor | undefined> {
	useColorPickerStore.getState().cancel();
	useColorPickerStore.setState({ active: true });
	return new Promise((resolve) => {
		resolvePendingPick = resolve;
	});
}
