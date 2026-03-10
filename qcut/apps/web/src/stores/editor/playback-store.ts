/**
 * Playback Store
 *
 * Manages video playback state and controls for the timeline editor.
 * Handles play/pause, seeking, volume, speed, and synchronization
 * with video elements via custom events.
 *
 * Performance: During playback, currentTime updates are throttled to avoid
 * re-rendering the full React tree on every animation frame. Video/audio
 * elements sync via lightweight CustomEvents instead of React state.
 *
 * @module stores/playback-store
 */

import { create } from "zustand";
import type { PlaybackState, PlaybackControls } from "@/types/playback";

// Lazy import getters to avoid circular dependencies
type TimelineStoreHook =
	typeof import("@/stores/timeline/timeline-store")["useTimelineStore"];
type ProjectStoreHook = typeof import("../project-store")["useProjectStore"];

let _timelineStore: TimelineStoreHook | null = null;
let _projectStore: ProjectStoreHook | null = null;

const getTimelineStoreSync = () => {
	if (!_timelineStore) {
		import("@/stores/timeline/timeline-store")
			.then((m) => {
				_timelineStore = m.useTimelineStore;
			})
			.catch((err) => console.error("Failed to load timeline store:", err));
	}
	return _timelineStore;
};

const getProjectStoreSync = () => {
	if (!_projectStore) {
		import("../project-store")
			.then((m) => {
				_projectStore = m.useProjectStore;
			})
			.catch((err) => console.error("Failed to load project store:", err));
	}
	return _projectStore;
};

// Pre-initialize stores when module loads
import("@/stores/timeline/timeline-store")
	.then((m) => {
		_timelineStore = m.useTimelineStore;
	})
	.catch((err) => console.error("Failed to pre-load timeline store:", err));
import("../project-store")
	.then((m) => {
		_projectStore = m.useProjectStore;
	})
	.catch((err) => console.error("Failed to pre-load project store:", err));

interface PlaybackStore extends PlaybackState, PlaybackControls {
	setDuration: (duration: number) => void;
	setCurrentTime: (time: number) => void;
}

/** Animation frame ID for playback timer */
let playbackTimer: number | null = null;

/**
 * Mutable current time updated every frame without triggering React re-renders.
 * The Zustand store is updated at a throttled rate for UI (timecode, cursor).
 */
let _mutableCurrentTime = 0;

/** How often (ms) to sync mutable time → Zustand store for UI updates */
const STORE_SYNC_INTERVAL_MS = 50;

const startTimer = (store: () => PlaybackStore) => {
	if (playbackTimer) cancelAnimationFrame(playbackTimer);

	// Cache store references outside the loop
	const cachedProjectStore = getProjectStoreSync();
	const cachedTimelineStore = getTimelineStoreSync();

	let lastStoreSyncTime = 0;

	const updateTime = () => {
		const state = store();
		if (state.isPlaying && _mutableCurrentTime < state.duration) {
			const now = performance.now();
			const delta = (now - lastUpdate) / 1000;
			lastUpdate = now;

			const newTime = _mutableCurrentTime + delta * state.speed;
			const projectStore = cachedProjectStore ?? getProjectStoreSync();
			const timelineStore = cachedTimelineStore ?? getTimelineStoreSync();
			const projectFps = projectStore?.getState()?.activeProject?.fps ?? 30;

			const actualContentDuration =
				timelineStore?.getState()?.getTotalDuration() ?? state.duration;
			const effectiveDuration =
				actualContentDuration > 0 ? actualContentDuration : state.duration;

			if (newTime >= effectiveDuration) {
				const fps = projectStore?.getState()?.activeProject?.fps ?? 30;
				const frameOffset = 1 / fps;
				const stopTime = Math.max(0, effectiveDuration - frameOffset);

				_mutableCurrentTime = stopTime;
				state.pause();
				state.setCurrentTime(stopTime);
				window.dispatchEvent(
					new CustomEvent("playback-seek", {
						detail: { time: stopTime },
					})
				);
			} else {
				_mutableCurrentTime = newTime;

				// Dispatch event every frame for video/audio sync (lightweight, no React)
				window.dispatchEvent(
					new CustomEvent("playback-update", {
						detail: { time: newTime },
					})
				);

				// Throttle Zustand store updates for UI (timecode, cursor)
				if (now - lastStoreSyncTime >= STORE_SYNC_INTERVAL_MS) {
					state.setCurrentTime(newTime);
					lastStoreSyncTime = now;
				}
			}
		}
		playbackTimer = requestAnimationFrame(updateTime);
	};

	let lastUpdate = performance.now();
	playbackTimer = requestAnimationFrame(updateTime);
};

const stopTimer = () => {
	if (playbackTimer) {
		cancelAnimationFrame(playbackTimer);
		playbackTimer = null;
	}
};

// Expose store on window for iPad CLI debugging (qcut://eval)
const exposeStore = (store: any) => {
	(window as any).__playbackStore = store;
};

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
	isPlaying: false,
	currentTime: 0,
	duration: 0,
	volume: 1,
	muted: false,
	previousVolume: 1,
	speed: 1.0,

	play: () => {
		_mutableCurrentTime = get().currentTime;
		set({ isPlaying: true });
		// Dispatch synchronously so video elements can call play() within the user gesture context (iOS requirement)
		window.dispatchEvent(new CustomEvent("playback-play"));
		startTimer(get);
	},

	pause: () => {
		set({ isPlaying: false, currentTime: _mutableCurrentTime });
		stopTimer();
	},

	toggle: () => {
		const { isPlaying } = get();
		if (isPlaying) {
			get().pause();
		} else {
			get().play();
		}
	},

	seek: (time: number) => {
		const { duration } = get();
		const clampedTime = Math.max(0, Math.min(duration, time));

		_mutableCurrentTime = clampedTime;
		set({ currentTime: clampedTime });

		const event = new CustomEvent("playback-seek", {
			detail: { time: clampedTime },
		});
		window.dispatchEvent(event);
	},

	setVolume: (volume: number) =>
		set((state) => ({
			volume: Math.max(0, Math.min(1, volume)),
			muted: volume === 0,
			previousVolume: volume > 0 ? volume : state.previousVolume,
		})),

	setSpeed: (speed: number) => {
		const newSpeed = Math.max(0.1, Math.min(2.0, speed));
		set({ speed: newSpeed });

		const event = new CustomEvent("playback-speed", {
			detail: { speed: newSpeed },
		});
		window.dispatchEvent(event);
	},

	setDuration: (duration: number) => {
		set({ duration });
	},
	setCurrentTime: (time: number) => set({ currentTime: time }),

	mute: () => {
		const { volume, previousVolume } = get();
		set({
			muted: true,
			previousVolume: volume > 0 ? volume : previousVolume,
			volume: 0,
		});
	},

	unmute: () => {
		const { previousVolume } = get();
		set({ muted: false, volume: previousVolume ?? 1 });
	},

	toggleMute: () => {
		const { muted } = get();
		if (muted) {
			get().unmute();
		} else {
			get().mute();
		}
	},
}));

// Expose for CLI debugging
exposeStore(usePlaybackStore);
