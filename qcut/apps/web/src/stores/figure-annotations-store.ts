/**
 * Figure annotations store — arrows, circles, rectangles on the timeline.
 * Follows the same Zustand pattern as stickers-overlay-store.ts.
 */

import { create } from "zustand";
import type {
	ArrowDirection,
	FigureType,
} from "@/lib/screen-recording/figure-paths";

export interface FigureAnnotation {
	id: string;
	type: FigureType;
	arrowDirection?: ArrowDirection;

	/** Position as percentage of container (0–100) */
	x: number;
	y: number;
	/** Size as percentage of container (0–100) */
	width: number;
	height: number;
	rotation: number;

	strokeColor: string;
	strokeWidth: number;
	fillColor?: string;
	fillOpacity?: number;
	opacity: number;

	/** Timeline visibility */
	startMs: number;
	endMs: number;
	zIndex: number;
}

const DEFAULT_STROKE_COLOR = "#ff4444";
const DEFAULT_STROKE_WIDTH = 3;

interface FigureAnnotationsState {
	annotations: Map<string, FigureAnnotation>;
	selectedId: string | null;

	addAnnotation: (
		type: FigureType,
		startMs: number,
		endMs: number,
		arrowDirection?: ArrowDirection
	) => string;
	removeAnnotation: (id: string) => void;
	updateAnnotation: (id: string, updates: Partial<FigureAnnotation>) => void;
	setSelectedId: (id: string | null) => void;

	getVisibleAnnotationsAtTime: (timeMs: number) => FigureAnnotation[];

	bringToFront: (id: string) => void;
	sendToBack: (id: string) => void;
}

export const useFigureAnnotationsStore = create<FigureAnnotationsState>(
	(set, get) => ({
		annotations: new Map(),
		selectedId: null,

		addAnnotation: (type, startMs, endMs, arrowDirection) => {
			const id = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			const maxZ = Math.max(
				0,
				...Array.from(get().annotations.values()).map((a) => a.zIndex)
			);

			const annotation: FigureAnnotation = {
				id,
				type,
				arrowDirection:
					type === "arrow" ? (arrowDirection ?? "right") : undefined,
				x: 40,
				y: 40,
				width: 20,
				height: 20,
				rotation: 0,
				strokeColor: DEFAULT_STROKE_COLOR,
				strokeWidth: DEFAULT_STROKE_WIDTH,
				opacity: 1,
				startMs,
				endMs,
				zIndex: maxZ + 1,
			};

			set((state) => {
				const next = new Map(state.annotations);
				next.set(id, annotation);
				return { annotations: next, selectedId: id };
			});

			return id;
		},

		removeAnnotation: (id) =>
			set((state) => {
				const next = new Map(state.annotations);
				next.delete(id);
				return {
					annotations: next,
					selectedId: state.selectedId === id ? null : state.selectedId,
				};
			}),

		updateAnnotation: (id, updates) =>
			set((state) => {
				const existing = state.annotations.get(id);
				if (!existing) return state;
				const next = new Map(state.annotations);
				next.set(id, { ...existing, ...updates });
				return { annotations: next };
			}),

		setSelectedId: (id) => set({ selectedId: id }),

		getVisibleAnnotationsAtTime: (timeMs) => {
			return Array.from(get().annotations.values())
				.filter((a) => timeMs >= a.startMs && timeMs <= a.endMs)
				.sort((a, b) => a.zIndex - b.zIndex);
		},

		bringToFront: (id) =>
			set((state) => {
				const maxZ = Math.max(
					0,
					...Array.from(state.annotations.values()).map((a) => a.zIndex)
				);
				const existing = state.annotations.get(id);
				if (!existing) return state;
				const next = new Map(state.annotations);
				next.set(id, { ...existing, zIndex: maxZ + 1 });
				return { annotations: next };
			}),

		sendToBack: (id) =>
			set((state) => {
				const minZ = Math.min(
					...Array.from(state.annotations.values()).map((a) => a.zIndex)
				);
				const existing = state.annotations.get(id);
				if (!existing) return state;
				const next = new Map(state.annotations);
				next.set(id, { ...existing, zIndex: minZ - 1 });
				return { annotations: next };
			}),
	})
);
