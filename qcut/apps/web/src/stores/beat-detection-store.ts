/**
 * Beat Detection Store
 *
 * Zustand store managing beat analysis state, results caching,
 * and utility methods for snap-to-beat and cut point extraction.
 */

import { create } from "zustand";
import type {
	BeatDetectionResult,
	BeatDetectionConfig,
} from "@qcut/editor-core";

interface BeatDetectionState {
	/** Whether analysis is currently running */
	isAnalyzing: boolean;
	/** Progress (0-1) during analysis */
	progress: number;
	/** Error message if analysis failed */
	error: string | null;
	/** Cached results keyed by element ID */
	cache: Map<string, BeatDetectionResult>;
	/** Currently active element ID being analyzed or with results */
	activeElementId: string | null;
	/** User-configured sensitivity (threshold multiplier) */
	sensitivity: number;
}

interface BeatDetectionActions {
	/** Run beat detection on audio from a URL */
	analyze: (
		elementId: string,
		audioUrl: string,
		config?: BeatDetectionConfig
	) => Promise<BeatDetectionResult | null>;
	/** Clear results for current element */
	clear: () => void;
	/** Clear all cached results */
	clearAll: () => void;
	/** Set the active element (loads from cache if available) */
	setActiveElement: (elementId: string | null) => void;
	/** Set sensitivity (threshold multiplier) */
	setSensitivity: (value: number) => void;
	/** Get the current result (for active element) */
	getResult: () => BeatDetectionResult | null;
	/** Snap a time to the nearest beat timestamp */
	snapToNearestBeat: (time: number) => number;
	/** Get cut points within a time range */
	getCutPoints: (startTime: number, endTime: number) => number[];
}

export type BeatDetectionStore = BeatDetectionState & BeatDetectionActions;

export const useBeatDetectionStore = create<BeatDetectionStore>((set, get) => ({
	isAnalyzing: false,
	progress: 0,
	error: null,
	cache: new Map(),
	activeElementId: null,
	sensitivity: 1.5,

	analyze: async (elementId, audioUrl, config) => {
		const state = get();

		// Return cached result if available
		const cached = state.cache.get(elementId);
		if (cached) {
			set({ activeElementId: elementId, error: null });
			return cached;
		}

		set({
			isAnalyzing: true,
			progress: 0,
			error: null,
			activeElementId: elementId,
		});

		let audioContext: AudioContext | null = null;
		try {
			// Decode audio to get raw PCM samples
			set({ progress: 0.1 });
			const response = await fetch(audioUrl);
			const arrayBuffer = await response.arrayBuffer();

			set({ progress: 0.3 });
			audioContext = new AudioContext();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			set({ progress: 0.5 });

			// Mix down to mono
			const samples = audioBuffer.getChannelData(0);
			const sampleRate = audioBuffer.sampleRate;

			// Dynamic import to keep editor-core tree-shakable
			const { analyzeFromSamples } = await import("@qcut/editor-core");

			set({ progress: 0.7 });

			const result = analyzeFromSamples(samples, sampleRate, {
				thresholdMultiplier: get().sensitivity,
				...config,
			});

			set({ progress: 1 });

			// Cache result
			const newCache = new Map(get().cache);
			newCache.set(elementId, result);

			set({
				isAnalyzing: false,
				progress: 1,
				cache: newCache,
			});

			return result;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Beat detection failed";
			set({ isAnalyzing: false, progress: 0, error: message });
			return null;
		} finally {
			if (audioContext) {
				await audioContext.close().catch(() => {});
			}
		}
	},

	clear: () => {
		const { activeElementId, cache } = get();
		if (activeElementId) {
			const newCache = new Map(cache);
			newCache.delete(activeElementId);
			set({ cache: newCache, error: null, progress: 0 });
		}
	},

	clearAll: () => {
		set({ cache: new Map(), error: null, progress: 0, activeElementId: null });
	},

	setActiveElement: (elementId) => {
		set({ activeElementId: elementId, error: null });
	},

	setSensitivity: (value) => {
		set({ sensitivity: value });
	},

	getResult: () => {
		const { activeElementId, cache } = get();
		if (!activeElementId) return null;
		return cache.get(activeElementId) ?? null;
	},

	snapToNearestBeat: (time) => {
		const result = get().getResult();
		if (!result || result.beats.length === 0) return time;

		let closest = result.beats[0].timestamp;
		let minDist = Math.abs(time - closest);

		for (const beat of result.beats) {
			const dist = Math.abs(time - beat.timestamp);
			if (dist < minDist) {
				minDist = dist;
				closest = beat.timestamp;
			}
		}

		return closest;
	},

	getCutPoints: (startTime, endTime) => {
		const result = get().getResult();
		if (!result) return [];

		return result.beats
			.map((b) => b.timestamp)
			.filter((t) => t > startTime && t < endTime);
	},
}));
