import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	prefersReducedMotion,
	useTextAnimationPreview,
} from "../use-text-animation-preview";

describe("useTextAnimationPreview", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("detects the reduced-motion preference", () => {
		vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

		expect(prefersReducedMotion()).toBe(true);
	});

	it("does not schedule automatic motion when reduced motion is enabled", () => {
		const requestAnimationFrame = vi.fn();
		vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
		vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

		const { result } = renderHook(() =>
			useTextAnimationPreview({ active: true, duration: 1 })
		);

		expect(result.current).toBe(0.55);
		expect(requestAnimationFrame).not.toHaveBeenCalled();
	});

	it("advances one preview clock and cancels it on unmount", () => {
		const callbacks: FrameRequestCallback[] = [];
		const requestAnimationFrame = vi
			.fn()
			.mockImplementation((callback: FrameRequestCallback) => {
				callbacks.push(callback);
				return callbacks.length;
			});
		const cancelAnimationFrame = vi.fn();
		vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
		vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
		vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));

		const { result, unmount } = renderHook(() =>
			useTextAnimationPreview({ active: true, duration: 1 })
		);
		expect(callbacks).toHaveLength(1);

		act(() => callbacks.shift()?.(100));
		act(() => callbacks.shift()?.(600));
		expect(result.current).toBeCloseTo(0.5);

		unmount();
		expect(cancelAnimationFrame).toHaveBeenCalled();
	});
});
