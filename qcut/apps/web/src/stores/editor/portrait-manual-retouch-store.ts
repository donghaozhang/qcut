import { create } from "zustand";
import type {
	MediaPortraitManualRetouchPoint,
	MediaPortraitManualRetouchStroke,
	MediaPortraitManualRetouchTool,
} from "@/types/timeline";

const MINIMUM_POINT_DISTANCE = 0.0025;
const MAXIMUM_STROKE_POINTS = 512;

interface ManualRetouchDraft {
	faceTrackId?: number;
	points: MediaPortraitManualRetouchPoint[];
}

interface PortraitManualRetouchState {
	active: boolean;
	tool: MediaPortraitManualRetouchTool;
	mode: "paint" | "erase";
	size: number;
	intensity: number;
	draft: ManualRetouchDraft | null;
	commitHandler: ((stroke: MediaPortraitManualRetouchStroke) => void) | null;
	setActive: ({ active }: { active: boolean }) => void;
	setTool: ({ tool }: { tool: MediaPortraitManualRetouchTool }) => void;
	setMode: ({ mode }: { mode: "paint" | "erase" }) => void;
	setSize: ({ size }: { size: number }) => void;
	setIntensity: ({ intensity }: { intensity: number }) => void;
	setCommitHandler: ({
		handler,
	}: {
		handler: ((stroke: MediaPortraitManualRetouchStroke) => void) | null;
	}) => void;
	beginStroke: ({
		point,
		faceTrackId,
	}: {
		point: MediaPortraitManualRetouchPoint;
		faceTrackId?: number;
	}) => void;
	appendPoint: ({ point }: { point: MediaPortraitManualRetouchPoint }) => void;
	finishStroke: () => void;
	cancelStroke: () => void;
}

function distance({
	left,
	right,
}: {
	left: MediaPortraitManualRetouchPoint;
	right: MediaPortraitManualRetouchPoint;
}) {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

export const usePortraitManualRetouchStore = create<PortraitManualRetouchState>(
	(set, get) => ({
		active: false,
		tool: "smooth",
		mode: "paint",
		size: 50,
		intensity: 100,
		draft: null,
		commitHandler: null,
		setActive: ({ active }) =>
			set({ active, ...(active ? {} : { draft: null }) }),
		setTool: ({ tool }) => set({ tool }),
		setMode: ({ mode }) => set({ mode }),
		setSize: ({ size }) => set({ size: Math.min(100, Math.max(1, size)) }),
		setIntensity: ({ intensity }) =>
			set({ intensity: Math.min(100, Math.max(0, intensity)) }),
		setCommitHandler: ({ handler }) => set({ commitHandler: handler }),
		beginStroke: ({ point, faceTrackId }) =>
			set({
				draft: {
					points: [point],
					...(faceTrackId === undefined ? {} : { faceTrackId }),
				},
			}),
		appendPoint: ({ point }) => {
			const draft = get().draft;
			const previous = draft?.points.at(-1);
			if (
				!draft ||
				!previous ||
				draft.points.length >= MAXIMUM_STROKE_POINTS ||
				distance({ left: previous, right: point }) < MINIMUM_POINT_DISTANCE
			) {
				return;
			}
			set({ draft: { ...draft, points: [...draft.points, point] } });
		},
		finishStroke: () => {
			const state = get();
			const draft = state.draft;
			if (!draft) return;
			const firstPoint = draft.points[0];
			if (!firstPoint) return;
			const points =
				draft.points.length === 1
					? [firstPoint, { ...firstPoint }]
					: draft.points;
			set({ draft: null });
			state.commitHandler?.({
				id: globalThis.crypto.randomUUID(),
				tool: state.tool,
				mode: state.mode,
				size: state.size,
				intensity: state.intensity,
				points,
				...(draft.faceTrackId === undefined
					? {}
					: { faceTrackId: draft.faceTrackId }),
			});
		},
		cancelStroke: () => set({ draft: null }),
	})
);
