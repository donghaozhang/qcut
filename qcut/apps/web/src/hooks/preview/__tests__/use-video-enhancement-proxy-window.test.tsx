import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { useVideoEnhancementProxyWindow } from "../use-video-enhancement-proxy";

function makeMediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "media-1",
		name: "clip",
		type: "media",
		mediaId: "item-1",
		startTime: 0,
		duration: 60,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function dispatchPlaybackUpdate(time: number): void {
	window.dispatchEvent(
		new CustomEvent("playback-update", { detail: { time } })
	);
}

describe("useVideoEnhancementProxyWindow", () => {
	it("returns an empty window without an element", () => {
		const { result } = renderHook(() =>
			useVideoEnhancementProxyWindow({
				element: null,
				currentTime: 5,
				isPlaying: false,
			})
		);
		expect(result.current).toEqual({ sourceStart: 0, sourceDuration: 0 });
	});

	it("derives the window from the rendered time while paused", () => {
		const element = makeMediaElement();
		const { result, rerender } = renderHook(
			({ currentTime }: { currentTime: number }) =>
				useVideoEnhancementProxyWindow({
					element,
					currentTime,
					isPlaying: false,
				}),
			{ initialProps: { currentTime: 0 } }
		);
		expect(result.current.sourceStart).toBe(0);
		expect(result.current.sourceDuration).toBeGreaterThan(0);

		// Seeking far ahead moves to a later stride-aligned chunk.
		rerender({ currentTime: 25 });
		expect(result.current.sourceStart).toBeGreaterThan(0);
	});

	it("advances the chunk from playback-update events, not renders", () => {
		const element = makeMediaElement();
		const { result } = renderHook(() =>
			useVideoEnhancementProxyWindow({
				element,
				currentTime: 0,
				isPlaying: true,
			})
		);
		const initialWindow = result.current;

		// Within the same chunk the state object stays identity-stable.
		act(() => {
			dispatchPlaybackUpdate(1);
			dispatchPlaybackUpdate(5);
		});
		expect(result.current).toBe(initialWindow);

		// Crossing the stride boundary advances the chunk.
		act(() => {
			dispatchPlaybackUpdate(30);
		});
		expect(result.current).not.toBe(initialWindow);
		expect(result.current.sourceStart).toBeGreaterThan(
			initialWindow.sourceStart
		);
	});

	it("does not listen for playback events while paused", () => {
		const element = makeMediaElement();
		const { result } = renderHook(() =>
			useVideoEnhancementProxyWindow({
				element,
				currentTime: 0,
				isPlaying: false,
			})
		);
		const initialWindow = result.current;
		act(() => {
			dispatchPlaybackUpdate(30);
		});
		expect(result.current).toBe(initialWindow);
	});
});
