/**
 * Gap Generation Store
 *
 * Zustand store managing gap detection, selection, generation state,
 * and chained generation for filling timeline gaps with AI video.
 *
 * Gap detection scans media tracks for empty spaces > 50ms between elements.
 * Supports single-segment and chained multi-segment generation for long gaps.
 *
 * @module stores/timeline/gap-store
 */

import { create } from "zustand";
import type { TimelineTrack } from "@/types/timeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineGap {
	trackId: string;
	startTime: number;
	endTime: number;
}

export type GapGenerateMode =
	| "text-to-video"
	| "image-to-video"
	| "text-to-image";

export interface GapSegment {
	index: number;
	startTime: number;
	duration: number;
	mode: "text-to-video" | "image-to-video";
	conditioningFrameUrl: string | null;
	status: "pending" | "generating" | "complete" | "failed";
	resultMediaId: string | null;
}

export interface GeneratingGap {
	trackId: string;
	startTime: number;
	endTime: number;
	mode: GapGenerateMode;
	prompt: string;
	model: string;
	segments: GapSegment[];
	currentSegmentIndex: number;
	overallProgress: number;
}

interface GapStore {
	// Selection
	selectedGap: TimelineGap | null;
	gapAnchorPosition: { x: number; top: number; bottom: number } | null;
	gapGenerateMode: GapGenerateMode | null;

	// Prompt
	gapPrompt: string;
	gapSuggestion: string | null;
	gapSuggesting: boolean;
	gapSuggestionError: boolean;

	// Context frames
	beforeFrameUrl: string | null;
	afterFrameUrl: string | null;

	// Generation settings
	gapModel: string;

	// Background generation
	generatingGap: GeneratingGap | null;

	// Actions
	selectGap: (
		gap: TimelineGap,
		anchor: { x: number; top: number; bottom: number }
	) => void;
	clearGapSelection: () => void;
	setGapGenerateMode: (mode: GapGenerateMode | null) => void;
	setGapPrompt: (prompt: string) => void;
	setGapSuggestion: (suggestion: string | null) => void;
	setGapSuggesting: (suggesting: boolean) => void;
	setGapSuggestionError: (error: boolean) => void;
	setBeforeFrameUrl: (url: string | null) => void;
	setAfterFrameUrl: (url: string | null) => void;
	setGapModel: (model: string) => void;
	setGeneratingGap: (gap: GeneratingGap | null) => void;
	updateSegmentStatus: (
		segmentIndex: number,
		status: GapSegment["status"],
		resultMediaId?: string | null
	) => void;
	updateGenerationProgress: (
		currentSegmentIndex: number,
		overallProgress: number
	) => void;
	resetGapState: () => void;
}

// ---------------------------------------------------------------------------
// Gap detection (pure function, called from components)
// ---------------------------------------------------------------------------

const GAP_THRESHOLD = 0.05; // 50ms minimum gap

/**
 * Detect gaps between elements on media tracks.
 * Returns gaps sorted by startTime per track.
 */
export function detectTimelineGaps(tracks: TimelineTrack[]): TimelineGap[] {
	const gaps: TimelineGap[] = [];

	for (const track of tracks) {
		if (track.type !== "media") continue;

		const sorted = [...track.elements]
			.filter((e) => e.type === "media")
			.sort((a, b) => a.startTime - b.startTime);

		if (sorted.length === 0) continue;

		// Gap at track start
		if (sorted[0].startTime > GAP_THRESHOLD) {
			gaps.push({
				trackId: track.id,
				startTime: 0,
				endTime: sorted[0].startTime,
			});
		}

		// Gaps between consecutive elements
		for (let i = 0; i < sorted.length - 1; i++) {
			const endOfCurrent =
				sorted[i].startTime +
				sorted[i].duration -
				sorted[i].trimStart -
				sorted[i].trimEnd;
			const startOfNext = sorted[i + 1].startTime;
			if (startOfNext - endOfCurrent > GAP_THRESHOLD) {
				gaps.push({
					trackId: track.id,
					startTime: endOfCurrent,
					endTime: startOfNext,
				});
			}
		}
	}

	return gaps;
}

// ---------------------------------------------------------------------------
// Close gap (ripple delete)
// ---------------------------------------------------------------------------

/**
 * Produce new tracks with all elements after the gap shifted earlier to close it.
 * Returns a new tracks array (immutable).
 */
export function closeGapInTracks(
	tracks: TimelineTrack[],
	gap: TimelineGap
): TimelineTrack[] {
	const gapDuration = gap.endTime - gap.startTime;

	return tracks.map((track) => ({
		...track,
		elements: track.elements.map((el) => {
			if (el.startTime >= gap.endTime) {
				return { ...el, startTime: Math.max(0, el.startTime - gapDuration) };
			}
			return el;
		}),
	}));
}

// ---------------------------------------------------------------------------
// Segment planning for chained generation
// ---------------------------------------------------------------------------

/** Model max durations (seconds) by model ID prefix */
const MODEL_MAX_DURATIONS: Record<string, number> = {
	"fal-ai/ltx-video-v02": 20,
	"fal-ai/ltx-video/v0.2.3": 20,
	"fal-ai/veo3": 8,
	"fal-ai/wan/v2.6": 10,
	"fal-ai/vidu/q3": 8,
	"fal-ai/kling-video": 10,
	"fal-ai/seedance": 10,
};

export function getModelMaxDuration(model: string): number {
	for (const [prefix, max] of Object.entries(MODEL_MAX_DURATIONS)) {
		if (model.startsWith(prefix)) return max;
	}
	return 10; // conservative default
}

/**
 * Plan gap segments for chained generation.
 * If the gap fits in one segment, returns a single segment.
 */
export function planGapSegments(
	gapDuration: number,
	maxSegmentDuration: number,
	gapStartTime: number,
	hasBeforeFrame: boolean
): GapSegment[] {
	const segments: GapSegment[] = [];
	let remaining = gapDuration;
	let currentTime = gapStartTime;
	let index = 0;

	while (remaining > GAP_THRESHOLD) {
		// Last segment: if remainder < 1s, merge with previous
		let duration = Math.min(remaining, maxSegmentDuration);
		if (remaining - duration > 0 && remaining - duration < 1) {
			duration = remaining; // take it all to avoid a tiny leftover
		}

		segments.push({
			index,
			startTime: currentTime,
			duration: Math.round(duration * 10) / 10, // round to 0.1s
			mode:
				index === 0 && !hasBeforeFrame ? "text-to-video" : "image-to-video",
			conditioningFrameUrl: null,
			status: "pending",
			resultMediaId: null,
		});

		currentTime += duration;
		remaining -= duration;
		index++;
	}

	return segments;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGapStore = create<GapStore>((set, get) => ({
	selectedGap: null,
	gapAnchorPosition: null,
	gapGenerateMode: null,
	gapPrompt: "",
	gapSuggestion: null,
	gapSuggesting: false,
	gapSuggestionError: false,
	beforeFrameUrl: null,
	afterFrameUrl: null,
	gapModel: "fal-ai/ltx-video/v0.2.3",
	generatingGap: null,

	selectGap: (gap, anchor) =>
		set({
			selectedGap: gap,
			gapAnchorPosition: anchor,
			gapGenerateMode: null,
			gapPrompt: "",
			gapSuggestion: null,
			gapSuggesting: false,
			gapSuggestionError: false,
			beforeFrameUrl: null,
			afterFrameUrl: null,
		}),

	clearGapSelection: () =>
		set({
			selectedGap: null,
			gapAnchorPosition: null,
			gapGenerateMode: null,
			gapPrompt: "",
			gapSuggestion: null,
			gapSuggesting: false,
			gapSuggestionError: false,
			beforeFrameUrl: null,
			afterFrameUrl: null,
		}),

	setGapGenerateMode: (mode) => set({ gapGenerateMode: mode }),
	setGapPrompt: (prompt) => set({ gapPrompt: prompt }),
	setGapSuggestion: (suggestion) => set({ gapSuggestion: suggestion }),
	setGapSuggesting: (suggesting) => set({ gapSuggesting: suggesting }),
	setGapSuggestionError: (error) => set({ gapSuggestionError: error }),
	setBeforeFrameUrl: (url) => set({ beforeFrameUrl: url }),
	setAfterFrameUrl: (url) => set({ afterFrameUrl: url }),
	setGapModel: (model) => set({ gapModel: model }),
	setGeneratingGap: (gap) => set({ generatingGap: gap }),

	updateSegmentStatus: (segmentIndex, status, resultMediaId) => {
		const { generatingGap } = get();
		if (!generatingGap) return;
		const segments = [...generatingGap.segments];
		segments[segmentIndex] = {
			...segments[segmentIndex],
			status,
			...(resultMediaId !== undefined ? { resultMediaId } : {}),
		};
		set({ generatingGap: { ...generatingGap, segments } });
	},

	updateGenerationProgress: (currentSegmentIndex, overallProgress) => {
		const { generatingGap } = get();
		if (!generatingGap) return;
		set({
			generatingGap: {
				...generatingGap,
				currentSegmentIndex,
				overallProgress,
			},
		});
	},

	resetGapState: () =>
		set({
			selectedGap: null,
			gapAnchorPosition: null,
			gapGenerateMode: null,
			gapPrompt: "",
			gapSuggestion: null,
			gapSuggesting: false,
			gapSuggestionError: false,
			beforeFrameUrl: null,
			afterFrameUrl: null,
			generatingGap: null,
		}),
}));
