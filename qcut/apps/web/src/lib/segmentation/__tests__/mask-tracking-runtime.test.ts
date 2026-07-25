import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cancelActiveMaskTracking,
	clearActiveMaskTrackingRuntimes,
	registerActiveMaskTrackingRuntime,
	resumeActiveMaskTracking,
} from "../mask-tracking-runtime";

describe("mask tracking runtime", () => {
	beforeEach(() => {
		clearActiveMaskTrackingRuntimes();
	});

	it("routes cancel and resume actions to the active element mask runtime", () => {
		const cancel = vi.fn();
		const resume = vi.fn();
		const unregister = registerActiveMaskTrackingRuntime({
			runtime: {
				elementId: "clip-1",
				maskId: "mask-1",
				source: "sam3",
				direction: "both",
				cancel,
				resume,
			},
		});

		expect(
			cancelActiveMaskTracking({ elementId: "clip-1", maskId: "other" })
		).toBe(false);
		expect(
			cancelActiveMaskTracking({ elementId: "clip-1", maskId: "mask-1" })
		).toBe(true);
		expect(cancel).toHaveBeenCalledTimes(1);

		expect(
			resumeActiveMaskTracking({ elementId: "clip-1", maskId: "mask-1" })
		).toBe(true);
		expect(resume).toHaveBeenCalledTimes(1);

		unregister();
		expect(
			cancelActiveMaskTracking({ elementId: "clip-1", maskId: "mask-1" })
		).toBe(false);
	});

	it("does not unregister a newer runtime for the same mask", () => {
		const firstCancel = vi.fn();
		const secondCancel = vi.fn();
		const unregisterFirst = registerActiveMaskTrackingRuntime({
			runtime: {
				elementId: "clip-1",
				maskId: "mask-1",
				source: "sam3",
				direction: "forward",
				cancel: firstCancel,
			},
		});
		registerActiveMaskTrackingRuntime({
			runtime: {
				elementId: "clip-1",
				maskId: "mask-1",
				source: "mediapipe",
				direction: "backward",
				cancel: secondCancel,
			},
		});

		unregisterFirst();
		expect(
			cancelActiveMaskTracking({ elementId: "clip-1", maskId: "mask-1" })
		).toBe(true);
		expect(firstCancel).not.toHaveBeenCalled();
		expect(secondCancel).toHaveBeenCalledTimes(1);
	});
});
