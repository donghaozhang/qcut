import { describe, expect, it } from "vitest";
import {
	getExportFrameSampleTime,
	seekExportVideoFrame,
} from "../export-video-frame-seek";

interface MockVideoState {
	assignedTimes: number[];
	presentedTimes: number[];
	seekListenerWasReady: boolean;
}

function createMockVideo({
	currentTime = 0,
	dispatchSeeked = true,
	duration = 5,
	presentFrames = false,
	readyState = 4,
	resolveAssignedTime = ({ assignedTime }) => assignedTime,
	seeking = false,
	videoHeight = 720,
	videoWidth = 1280,
}: {
	currentTime?: number;
	dispatchSeeked?: boolean;
	duration?: number;
	presentFrames?: boolean;
	readyState?: number;
	resolveAssignedTime?: (options: { assignedTime: number }) => number;
	seeking?: boolean;
	videoHeight?: number;
	videoWidth?: number;
} = {}): { state: MockVideoState; video: HTMLVideoElement } {
	const eventTarget = new EventTarget();
	let resolvedCurrentTime = currentTime;
	let seekListenerCount = 0;
	const state: MockVideoState = {
		assignedTimes: [],
		presentedTimes: [],
		seekListenerWasReady: false,
	};
	const video = {
		addEventListener: (type: string, listener: EventListener) => {
			if (type === "seeked") seekListenerCount += 1;
			eventTarget.addEventListener(type, listener);
		},
		duration,
		get currentTime() {
			return resolvedCurrentTime;
		},
		set currentTime(value: number) {
			state.assignedTimes.push(value);
			state.seekListenerWasReady = seekListenerCount > 0;
			resolvedCurrentTime = resolveAssignedTime({ assignedTime: value });
			if (dispatchSeeked) eventTarget.dispatchEvent(new Event("seeked"));
		},
		readyState,
		requestVideoFrameCallback: presentFrames
			? (callback: VideoFrameRequestCallback) => {
					queueMicrotask(() => {
						state.presentedTimes.push(resolvedCurrentTime);
						callback(0, {
							mediaTime: resolvedCurrentTime,
						} as VideoFrameCallbackMetadata);
					});
					return state.presentedTimes.length + 1;
				}
			: undefined,
		removeEventListener: (type: string, listener: EventListener) => {
			if (type === "seeked") seekListenerCount -= 1;
			eventTarget.removeEventListener(type, listener);
		},
		seeking,
		videoHeight,
		videoWidth,
	} as unknown as HTMLVideoElement;
	return { state, video };
}

describe("seekExportVideoFrame", () => {
	it("samples the center of each output frame interval", () => {
		expect(
			getExportFrameSampleTime({ frameRate: 30, frameStartTime: 2 / 30 })
		).toBeCloseTo(2.5 / 30, 12);
	});

	it("rejects invalid frame sample inputs", () => {
		expect(() =>
			getExportFrameSampleTime({ frameRate: 0, frameStartTime: 0 })
		).toThrow("frame rate must be positive");
		expect(() =>
			getExportFrameSampleTime({ frameRate: 30, frameStartTime: -1 })
		).toThrow("start time must be finite and non-negative");
	});

	it("reuses an already decoded frame at the requested time", async () => {
		const { state, video } = createMockVideo({
			currentTime: 1,
			presentFrames: true,
		});

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video });

		expect(state.assignedTimes).toEqual([]);
		expect(state.presentedTimes).toEqual([]);
	});

	it("waits for frame presentation after seeking", async () => {
		const { state, video } = createMockVideo({ presentFrames: true });

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video });

		expect(state.assignedTimes).toEqual([1]);
		expect(state.presentedTimes).toEqual([1]);
	});

	it("accepts a decoder timestamp quantized within the output frame", async () => {
		const frameRate = 30;
		const frameStartTime = 0.5;
		const timeSeconds = getExportFrameSampleTime({
			frameRate,
			frameStartTime,
		});
		const { state, video } = createMockVideo({
			presentFrames: true,
			resolveAssignedTime: () => frameStartTime,
		});

		await seekExportVideoFrame({ frameRate, timeSeconds, video });

		expect(state.assignedTimes).toEqual([timeSeconds]);
		expect(state.presentedTimes).toEqual([frameStartTime]);
	});

	it("rejects a decoder timestamp outside the output frame", async () => {
		const frameRate = 30;
		const timeSeconds = 1;
		const { video } = createMockVideo({
			resolveAssignedTime: () => timeSeconds + 0.5 / frameRate + 0.001,
		});

		await expect(
			seekExportVideoFrame({ frameRate, timeSeconds, video })
		).rejects.toThrow("instead of 1s");
	});

	it("seeks when slow playback advances by less than half an output frame", async () => {
		const { state, video } = createMockVideo({ currentTime: 0 });

		await seekExportVideoFrame({
			frameRate: 30,
			timeSeconds: 1 / 120,
			video,
		});

		expect(state.assignedTimes).toEqual([1 / 120]);
	});

	it("does not reuse a target timestamp while a prior seek is pending", async () => {
		const { state, video } = createMockVideo({ currentTime: 1, seeking: true });

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video });

		expect(state.assignedTimes).toEqual([1]);
	});

	it("normalizes a seek beyond the media duration", async () => {
		const { state, video } = createMockVideo({ currentTime: 4, duration: 5 });

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 6, video });

		expect(state.assignedTimes).toEqual([5]);
		expect(video.currentTime).toBe(5);
	});

	it("installs the seek listener before assigning currentTime", async () => {
		const { state, video } = createMockVideo();

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video });

		expect(state).toMatchObject({
			assignedTimes: [1],
			seekListenerWasReady: true,
		});
	});

	it("accepts a structurally decoded frame without color heuristics", async () => {
		const { video } = createMockVideo();

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video });

		expect(video.currentTime).toBe(1);
	});

	it("rejects seek completion without decoded dimensions", async () => {
		const { video } = createMockVideo({ videoHeight: 0, videoWidth: 0 });

		await expect(
			seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video })
		).rejects.toThrow("without a decoded frame");
	});

	it("rejects invalid time and frame-rate inputs", async () => {
		const { video } = createMockVideo();

		await expect(
			seekExportVideoFrame({ frameRate: 30, timeSeconds: -1, video })
		).rejects.toThrow("finite and non-negative");
		await expect(
			seekExportVideoFrame({ frameRate: 0, timeSeconds: 1, video })
		).rejects.toThrow("frame rate must be positive");
	});
});
