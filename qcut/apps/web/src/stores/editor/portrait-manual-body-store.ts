import { create } from "zustand";
import type {
	MediaPortraitManualBody,
	MediaPortraitManualBodyTool,
} from "@/types/timeline";

interface ManualBodyBindings {
	onChange: (manualBody: MediaPortraitManualBody | undefined) => void;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
}

interface PortraitManualBodyState {
	active: boolean;
	elementId: string | null;
	tool: MediaPortraitManualBodyTool;
	manualBody: MediaPortraitManualBody;
	past: MediaPortraitManualBody[];
	future: MediaPortraitManualBody[];
	interactionStartValue: MediaPortraitManualBody | null;
	bindings: ManualBodyBindings | null;
	setActive: ({ active }: { active: boolean }) => void;
	setTool: ({ tool }: { tool: MediaPortraitManualBodyTool }) => void;
	setBindings: ({ bindings }: { bindings: ManualBodyBindings | null }) => void;
	syncValue: ({
		elementId,
		manualBody,
	}: {
		elementId: string;
		manualBody?: MediaPortraitManualBody;
	}) => void;
	beginInteraction: () => void;
	updateManualBody: ({
		manualBody,
	}: {
		manualBody: MediaPortraitManualBody;
	}) => void;
	finishInteraction: () => void;
	cancelInteraction: () => void;
	applyManualBody: ({
		manualBody,
	}: {
		manualBody: MediaPortraitManualBody;
	}) => void;
	undo: () => void;
	redo: () => void;
}

function copyManualBody({
	manualBody,
}: {
	manualBody: MediaPortraitManualBody;
}): MediaPortraitManualBody {
	return {
		...(manualBody.stretch ? { stretch: { ...manualBody.stretch } } : {}),
		...(manualBody.slim ? { slim: { ...manualBody.slim } } : {}),
		...(manualBody.zoom ? { zoom: { ...manualBody.zoom } } : {}),
	};
}

function equalManualBody({
	left,
	right,
}: {
	left: MediaPortraitManualBody;
	right: MediaPortraitManualBody;
}) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function optionalManualBody({
	manualBody,
}: {
	manualBody: MediaPortraitManualBody;
}) {
	return Object.keys(manualBody).length > 0 ? manualBody : undefined;
}

export const usePortraitManualBodyStore = create<PortraitManualBodyState>(
	(set, get) => ({
		active: false,
		elementId: null,
		tool: "stretch",
		manualBody: {},
		past: [],
		future: [],
		interactionStartValue: null,
		bindings: null,
		setActive: ({ active }) =>
			set({ active, ...(active ? {} : { interactionStartValue: null }) }),
		setTool: ({ tool }) => set({ tool }),
		setBindings: ({ bindings }) => set({ bindings }),
		syncValue: ({ elementId, manualBody }) => {
			const state = get();
			const next = copyManualBody({ manualBody: manualBody ?? {} });
			if (state.elementId !== elementId) {
				set({
					elementId,
					manualBody: next,
					past: [],
					future: [],
					interactionStartValue: null,
				});
				return;
			}
			if (
				state.interactionStartValue === null &&
				!equalManualBody({ left: state.manualBody, right: next })
			) {
				set({ manualBody: next });
			}
		},
		beginInteraction: () => {
			const state = get();
			if (state.interactionStartValue) return;
			state.bindings?.onInteractionStart();
			set({
				interactionStartValue: copyManualBody({ manualBody: state.manualBody }),
			});
		},
		updateManualBody: ({ manualBody }) => {
			const next = copyManualBody({ manualBody });
			set({ manualBody: next });
			get().bindings?.onChange(optionalManualBody({ manualBody: next }));
		},
		finishInteraction: () => {
			const state = get();
			const previous = state.interactionStartValue;
			if (!previous) return;
			const changed = !equalManualBody({
				left: previous,
				right: state.manualBody,
			});
			set({
				interactionStartValue: null,
				...(changed ? { past: [...state.past, previous], future: [] } : {}),
			});
			state.bindings?.onInteractionEnd();
		},
		cancelInteraction: () => {
			const state = get();
			const previous = state.interactionStartValue;
			if (!previous) return;
			set({ manualBody: previous, interactionStartValue: null });
			state.bindings?.onChange(optionalManualBody({ manualBody: previous }));
			state.bindings?.onInteractionEnd();
		},
		applyManualBody: ({ manualBody }) => {
			get().beginInteraction();
			get().updateManualBody({ manualBody });
			get().finishInteraction();
		},
		undo: () => {
			const state = get();
			const previous = state.past.at(-1);
			if (!previous) return;
			const current = copyManualBody({ manualBody: state.manualBody });
			const next = copyManualBody({ manualBody: previous });
			state.bindings?.onInteractionStart();
			set({
				manualBody: next,
				past: state.past.slice(0, -1),
				future: [...state.future, current],
			});
			state.bindings?.onChange(optionalManualBody({ manualBody: next }));
			state.bindings?.onInteractionEnd();
		},
		redo: () => {
			const state = get();
			const nextValue = state.future.at(-1);
			if (!nextValue) return;
			const current = copyManualBody({ manualBody: state.manualBody });
			const next = copyManualBody({ manualBody: nextValue });
			state.bindings?.onInteractionStart();
			set({
				manualBody: next,
				past: [...state.past, current],
				future: state.future.slice(0, -1),
			});
			state.bindings?.onChange(optionalManualBody({ manualBody: next }));
			state.bindings?.onInteractionEnd();
		},
	})
);
