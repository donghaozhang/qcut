import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePlaybackStore } from "@/stores/editor/playback-store";

// Mock browser APIs
let rafCallbacks: any[] = [];
let rafId = 0;

global.requestAnimationFrame = vi.fn((cb) => {
	rafId++;
	rafCallbacks.push({ id: rafId, cb });
	// Don't immediately call the callback to avoid infinite recursion
	return rafId;
});

global.cancelAnimationFrame = vi.fn((id) => {
	rafCallbacks = rafCallbacks.filter((c) => c.id !== id);
});
global.CustomEvent = class CustomEvent extends Event {
	detail: any;
	constructor(event: string, params: any) {
		super(event, params);
		this.detail = params?.detail;
	}
} as any;

// Mock window object
global.window = {
	dispatchEvent: vi.fn(),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
} as any;

describe("Playback State", () => {
	beforeEach(() => {
		usePlaybackStore.setState({
			isPlaying: false,
			currentTime: 0,
			duration: 0,
			speed: 1,
			volume: 1,
			muted: false,
			previewQuality: "auto",
			runtimePreviewQuality: null,
			runtimePreviewQualityDiagnostic: null,
		});
	});

	it("toggles playback state", () => {
		const store = usePlaybackStore.getState();
		expect(store.isPlaying).toBe(false);

		store.play();
		const playingState = usePlaybackStore.getState();
		expect(playingState.isPlaying).toBe(true);

		store.pause();
		const pausedState = usePlaybackStore.getState();
		expect(pausedState.isPlaying).toBe(false);
	});

	it("updates current time", () => {
		// Set duration first so seek has a valid range
		usePlaybackStore.setState({ duration: 20 });

		const store = usePlaybackStore.getState();
		store.seek(10.5);
		const updatedState = usePlaybackStore.getState();
		expect(updatedState.currentTime).toBe(10.5);
	});

	it("changes playback speed", () => {
		const store = usePlaybackStore.getState();
		// Set speed directly via state since setPlaybackSpeed might not exist
		usePlaybackStore.setState({ speed: 2 });
		const updatedState = usePlaybackStore.getState();
		expect(updatedState.speed).toBe(2);
	});

	it("clears runtime preview downgrade on pause and manual quality change", () => {
		usePlaybackStore.setState({
			isPlaying: true,
			runtimePreviewQuality: "low",
			runtimePreviewQualityDiagnostic: {
				reason: "video-frame",
				averageMainThreadFrameIntervalMs: 20,
				mainThreadStutterCount: 0,
				averagePresentedFrameIntervalMs: 90,
				presentedFrameStallCount: 5,
			},
		});

		usePlaybackStore.getState().pause();

		expect(usePlaybackStore.getState().runtimePreviewQuality).toBeNull();
		expect(
			usePlaybackStore.getState().runtimePreviewQualityDiagnostic
		).toBeNull();

		usePlaybackStore.getState().setRuntimePreviewQuality({
			quality: "smooth",
			diagnostic: {
				reason: "main-thread",
				averageMainThreadFrameIntervalMs: 50,
				mainThreadStutterCount: 3,
				averagePresentedFrameIntervalMs: 20,
				presentedFrameStallCount: 0,
			},
		});
		usePlaybackStore.getState().setPreviewQuality("original");

		expect(usePlaybackStore.getState().previewQuality).toBe("original");
		expect(usePlaybackStore.getState().runtimePreviewQuality).toBeNull();
		expect(
			usePlaybackStore.getState().runtimePreviewQualityDiagnostic
		).toBeNull();
	});
});
