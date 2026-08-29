import { describe, expect, it } from "vitest";
import { seekExportVideoFrame } from "../export-video-frame-seek";

interface MockVideoState {
	assignedTimes: number[];
	seekListenerWasReady: boolean;
}

function createMockVideo({
	currentTime = 0,
	dispatchSeeked = true,
	readyState = 4,
	seeking = false,
	videoHeight = 720,
	videoWidth = 1280,
}: {
	currentTime?: number;
	dispatchSeeked?: boolean;
	readyState?: number;
	seeking?: boolean;
	videoHeight?: number;
	videoWidth?: number;
} = {}): { state: MockVideoState; video: HTMLVideoElement } {
	const eventTarget = new EventTarget();
	let resolvedCurrentTime = currentTime;
	let seekListenerCount = 0;
	const state: MockVideoState = {
		assignedTimes: [],
		seekListenerWasReady: false,
	};
	const video = {
		addEventListener: (type: string, listener: EventListener) => {
			if (type === "seeked") seekListenerCount += 1;
			eventTarget.addEventListener(type, listener);
		},
		duration: 5,
		get currentTime() {
			return resolvedCurrentTime;
		},
		set currentTime(value: number) {
			state.assignedTimes.push(value);
			state.seekListenerWasReady = seekListenerCount > 0;
			resolvedCurrentTime = value;
			if (dispatchSeeked) eventTarget.dispatchEvent(new Event("seeked"));
		},
		readyState,
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
	it("reuses an already decoded frame at the requested time", async () => {
		const { state, video } = createMockVideo({ currentTime: 1 });

		await seekExportVideoFrame({ frameRate: 30, timeSeconds: 1, video });

		expect(state.assignedTimes).toEqual([]);
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
