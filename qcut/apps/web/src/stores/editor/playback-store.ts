/**
 * Playback Store
 *
 * Manages video playback state and controls for the timeline editor.
 * Handles play/pause, seeking, volume, speed, and synchronization
 * with video elements via custom events.
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

/**
 * Synchronously gets the timeline store reference.
 * Triggers async import on first call; returns cached value on subsequent calls.
 * @returns The timeline store hook or null if not yet loaded
 */
const getTimelineStoreSync = () => {
	if (!_timelineStore) {
		// This will work because by the time playback starts, stores are loaded
		import("@/stores/timeline/timeline-store")
			.then((m) => {
				_timelineStore = m.useTimelineStore;
			})
			.catch((err) => console.error("Failed to load timeline store:", err));
	}
	return _timelineStore;
};

/**
 * Synchronously gets the project store reference.
 * Triggers async import on first call; returns cached value on subsequent calls.
 * @returns The project store hook or null if not yet loaded
 */
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

/**
 * Playback store interface combining state and control methods
 * Manages video playback timing, controls, and synchronization
 */
interface PlaybackStore extends PlaybackState, PlaybackControls {
	/** Set the total duration of the timeline content */
	setDuration: (duration: number) => void;
	/** Set the current playback position */
	setCurrentTime: (time: number) => void;
}

/** Animation frame ID for playback timer */
let playbackTimer: number | null = null;

/**
 * Starts the playback timer using requestAnimationFrame for smooth updates
 * @param store - Function returning the playback store instance
 */
const startTimer = (store: () => PlaybackStore) => {
	if (playbackTimer) cancelAnimationFrame(playbackTimer);

	const { isPlaying, currentTime, speed } = store();

	let loggedNotPlaying = false;
	let loggedDurationReached = false;

	// Cache store references outside the loop to avoid per-frame lookups
	const cachedProjectStore = getProjectStoreSync();
	const cachedTimelineStore = getTimelineStoreSync();

	// Diagnostic: track frame timing on-screen
	let frameCount = 0;
	let frameTimes: number[] = [];
	// Auto-enable debug overlay
	(window as any).__PLAYBACK_DEBUG = true;
	let debugEl = document.getElementById("playback-debug-overlay");
	if (!debugEl) {
		debugEl = document.createElement("div");
		debugEl.id = "playback-debug-overlay";
		debugEl.style.cssText =
			"position:fixed;top:8px;left:8px;z-index:999999;background:rgba(0,0,0,0.85);color:#0f0;font:bold 14px monospace;padding:8px 12px;border-radius:8px;pointer-events:none;white-space:pre;max-width:90vw;";
		debugEl.textContent = "Playback: waiting...";
		document.body.appendChild(debugEl);
	}

	// Use requestAnimationFrame for smoother updates
	const updateTime = () => {
		const state = store();
		if (state.isPlaying && state.currentTime < state.duration) {
			const now = performance.now();
			const delta = (now - lastUpdate) / 1000; // Convert to seconds

			// Diagnostic logging — writes to on-screen overlay
			frameTimes.push(delta * 1000);
			frameCount++;
			if (frameCount % 30 === 0) {
				const avg =
					frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
				const max = Math.max(...frameTimes);
				const min = Math.min(...frameTimes);
				const fps = 1000 / avg;
				const jank = frameTimes.filter((t) => t > 33).length;
				const msg = `FPS: ${fps.toFixed(1)} | avg: ${avg.toFixed(1)}ms\nmin: ${min.toFixed(1)}ms | max: ${max.toFixed(1)}ms\njank(>33ms): ${jank}/${frameTimes.length} | frame#${frameCount}`;
				console.log(`[Playback] ${msg.replace(/\n/g, " | ")}`);
				const el = document.getElementById("playback-debug-overlay");
				if (el) el.textContent = msg;
				frameTimes = [];
			}

			lastUpdate = now;

			const newTime = state.currentTime + delta * state.speed;
			const projectStore = cachedProjectStore ?? getProjectStoreSync();
			const timelineStore = cachedTimelineStore ?? getTimelineStoreSync();
			const projectFps = projectStore?.getState()?.activeProject?.fps ?? 30;
			const frameNumber = Math.round(newTime * projectFps);

			// Get actual content duration from timeline store
			const actualContentDuration =
				timelineStore?.getState()?.getTotalDuration() ?? state.duration;

			// Stop at actual content end, not timeline duration (which has 10s minimum)
			// It was either this or reducing default min timeline to 1 second
			const effectiveDuration =
				actualContentDuration > 0 ? actualContentDuration : state.duration;

			if (newTime >= effectiveDuration) {
				// When content completes, pause just before the end so we can see the last frame
				const projectFps = projectStore?.getState()?.activeProject?.fps;
				if (!projectFps) {
					// Project FPS is not set, assuming 30fps
				}

				const frameOffset = 1 / (projectFps ?? 30); // Stop 1 frame before end based on project FPS
				const stopTime = Math.max(0, effectiveDuration - frameOffset);

				state.pause();
				state.setCurrentTime(stopTime);
				// Notify video elements to sync with end position
				window.dispatchEvent(
					new CustomEvent("playback-seek", {
						detail: { time: stopTime },
					})
				);
			} else {
				state.setCurrentTime(newTime);
				// Notify video elements to sync
				window.dispatchEvent(
					new CustomEvent("playback-update", { detail: { time: newTime } })
				);
			}
			loggedNotPlaying = false;
			loggedDurationReached = false;
		} else {
			if (!state.isPlaying && !loggedNotPlaying) {
				loggedNotPlaying = true;
			}
			if (state.currentTime >= state.duration && !loggedDurationReached) {
				loggedDurationReached = true;
			}
		}
		playbackTimer = requestAnimationFrame(updateTime);
	};

	let lastUpdate = performance.now();
	playbackTimer = requestAnimationFrame(updateTime);
};

/**
 * Stops the playback timer and cleans up the animation frame.
 * Called when playback is paused or the component unmounts.
 */
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
		set({ isPlaying: true });
		// Dispatch synchronously so video elements can call play() within the user gesture context (iOS requirement)
		window.dispatchEvent(new CustomEvent("playback-play"));
		startTimer(get);
	},

	pause: () => {
		set({ isPlaying: false });
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
		const { duration, currentTime: previousTime } = get();
		const clampedTime = Math.max(0, Math.min(duration, time));

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
		const { speed: previousSpeed } = get();
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
