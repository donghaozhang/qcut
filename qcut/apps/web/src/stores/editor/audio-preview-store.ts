import { create } from "zustand";

interface AudioPreviewState {
	bypassedElementIds: Record<string, true>;
	setElementBypassed: ({
		elementId,
		bypassed,
	}: {
		elementId: string;
		bypassed: boolean;
	}) => void;
	clearElement: ({ elementId }: { elementId: string }) => void;
}

export const useAudioPreviewStore = create<AudioPreviewState>((set) => ({
	bypassedElementIds: {},
	setElementBypassed: ({ elementId, bypassed }) =>
		set((state) => {
			if (bypassed) {
				return {
					bypassedElementIds: {
						...state.bypassedElementIds,
						[elementId]: true,
					},
				};
			}
			const { [elementId]: _removed, ...remainingElementIds } =
				state.bypassedElementIds;
			return { bypassedElementIds: remainingElementIds };
		}),
	clearElement: ({ elementId }) =>
		set((state) => {
			const { [elementId]: _removed, ...remainingElementIds } =
				state.bypassedElementIds;
			return { bypassedElementIds: remainingElementIds };
		}),
}));

export function selectAudioPreviewBypassed({
	state,
	elementId,
}: {
	state: AudioPreviewState;
	elementId: string | undefined;
}): boolean {
	return elementId ? state.bypassedElementIds[elementId] === true : false;
}
