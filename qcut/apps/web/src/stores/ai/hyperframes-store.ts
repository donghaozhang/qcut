import { create } from "zustand";
import {
	loadHyperframesLibrary,
	saveHyperframesLibrary,
} from "@/lib/hyperframes/library-storage";
import type { HyperframesComposition } from "@/lib/hyperframes/types";

interface HyperframesStore {
	compositions: HyperframesComposition[];
	isInitialized: boolean;
	initialize: () => void;
	upsertComposition: (composition: HyperframesComposition) => void;
	removeComposition: (sourcePath: string) => void;
}

export const useHyperframesStore = create<HyperframesStore>((set, get) => ({
	compositions: [],
	isInitialized: false,
	initialize: () => {
		if (get().isInitialized) return;
		set({
			compositions: loadHyperframesLibrary(),
			isInitialized: true,
		});
	},
	upsertComposition: (composition) => {
		const existing = get().compositions;
		const next = [
			composition,
			...existing.filter((item) => item.sourcePath !== composition.sourcePath),
		];
		saveHyperframesLibrary({ compositions: next });
		set({ compositions: next });
	},
	removeComposition: (sourcePath) => {
		const next = get().compositions.filter(
			(composition) => composition.sourcePath !== sourcePath
		);
		saveHyperframesLibrary({ compositions: next });
		set({ compositions: next });
	},
}));
