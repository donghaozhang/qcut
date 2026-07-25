import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("routes cancel and resume actions to the active element mask runtime", async () => {
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
			await cancelActiveMaskTracking({ elementId: "clip-1", maskId: "other" })
		).toBe(false);
		expect(
			await cancelActiveMaskTracking({
				elementId: "clip-1",
				maskId: "mask-1",
			})
		).toBe(true);
		expect(cancel).toHaveBeenCalledTimes(1);

		expect(
			await resumeActiveMaskTracking({
				elementId: "clip-1",
				maskId: "mask-1",
			})
		).toBe(true);
		expect(resume).toHaveBeenCalledTimes(1);

		unregister();
		expect(
			await cancelActiveMaskTracking({
				elementId: "clip-1",
				maskId: "mask-1",
			})
		).toBe(false);
	});

	it("does not unregister a newer runtime for the same mask", async () => {
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
			await cancelActiveMaskTracking({
				elementId: "clip-1",
				maskId: "mask-1",
			})
		).toBe(true);
		expect(firstCancel).not.toHaveBeenCalled();
		expect(secondCancel).toHaveBeenCalledTimes(1);
	});

	it("reports synchronous and asynchronous runtime action failures", async () => {
		const cancelError = new Error("cancel failed");
		const resumeError = new Error("resume failed");
		const report = vi.spyOn(console, "error").mockImplementation(() => {});
		registerActiveMaskTrackingRuntime({
			runtime: {
				elementId: "clip-1",
				maskId: "mask-1",
				source: "sam3",
				direction: "both",
				cancel: () => {
					throw cancelError;
				},
				resume: () => Promise.reject(resumeError),
			},
		});

		expect(
			await cancelActiveMaskTracking({
				elementId: "clip-1",
				maskId: "mask-1",
			})
		).toBe(false);
		expect(
			await resumeActiveMaskTracking({
				elementId: "clip-1",
				maskId: "mask-1",
			})
		).toBe(false);

		expect(report).toHaveBeenNthCalledWith(
			1,
			"Failed to cancel mask tracking",
			cancelError
		);
		expect(report).toHaveBeenNthCalledWith(
			2,
			"Failed to resume mask tracking",
			resumeError
		);
	});
});
