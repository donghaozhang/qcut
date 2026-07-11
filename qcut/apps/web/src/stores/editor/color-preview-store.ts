import { create } from "zustand";

interface ColorPreviewState {
	bypassed: boolean;
	setBypassed: (bypassed: boolean) => void;
}

export const useColorPreviewStore = create<ColorPreviewState>((set) => ({
	bypassed: false,
	setBypassed: (bypassed) => set({ bypassed }),
}));
