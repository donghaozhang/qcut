import { isValidPlanarQuad } from "@qcut/editor-core";
import type { PlanarQuad, PlanarTrackingErrorCode } from "@qcut/editor-core";
import { create } from "zustand";
import type {
	PlanarTrackingAnalysisPhase,
	PlanarTrackingAnalysisProgress,
} from "@/lib/tracking/planar-tracking-analyzer";

export interface PlanarTrackingSelection {
	quad: PlanarQuad;
	sourceElementId: string;
	stickerElementId: string;
}

export interface PlanarTrackingEditorJob {
	errorCode?: PlanarTrackingErrorCode;
	phase: PlanarTrackingAnalysisPhase;
	processedFrames: number;
	progress: number;
	status: "processing" | "ready" | "partial" | "error" | "cancelled";
	trackingId: string;
}

interface PlanarTrackingEditorStore {
	jobs: Record<string, PlanarTrackingEditorJob>;
	selection: PlanarTrackingSelection | null;
	beginSelection: ({
		selection,
	}: {
		selection: PlanarTrackingSelection;
	}) => void;
	clearSelection: ({ stickerElementId }: { stickerElementId: string }) => void;
	setJob: ({
		job,
		stickerElementId,
	}: {
		job: PlanarTrackingEditorJob;
		stickerElementId: string;
	}) => void;
	setProgress: ({
		progress,
		stickerElementId,
	}: {
		progress: PlanarTrackingAnalysisProgress;
		stickerElementId: string;
	}) => void;
	setSelectionQuad: ({
		quad,
		stickerElementId,
	}: {
		quad: PlanarQuad;
		stickerElementId: string;
	}) => void;
}

export const usePlanarTrackingEditorStore = create<PlanarTrackingEditorStore>(
	(set) => ({
		jobs: {},
		selection: null,
		beginSelection: ({ selection }) => set({ selection }),
		clearSelection: ({ stickerElementId }) =>
			set((state) => ({
				selection:
					state.selection?.stickerElementId === stickerElementId
						? null
						: state.selection,
			})),
		setJob: ({ job, stickerElementId }) =>
			set((state) => ({ jobs: { ...state.jobs, [stickerElementId]: job } })),
		setProgress: ({ progress, stickerElementId }) =>
			set((state) => {
				const job = state.jobs[stickerElementId];
				if (!job || job.status !== "processing") return state;
				return {
					jobs: {
						...state.jobs,
						[stickerElementId]: {
							...job,
							phase: progress.phase,
							processedFrames: progress.processedFrames,
							progress: progress.progress,
						},
					},
				};
			}),
		setSelectionQuad: ({ quad, stickerElementId }) =>
			set((state) => {
				if (
					state.selection?.stickerElementId !== stickerElementId ||
					!isValidPlanarQuad({ quad })
				) {
					return state;
				}
				return { selection: { ...state.selection, quad } };
			}),
	})
);
