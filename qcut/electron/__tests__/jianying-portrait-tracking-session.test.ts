import { describe, expect, it } from "vitest";
import {
	canMapPortraitDetection,
	isPortraitTrackingDiscontinuity,
} from "../jianying-portrait-adjustment-runtime/tracking-session";

describe("portrait tracking session continuity", () => {
	it("keeps first, repeated, and adjacent video frames in one tracker session", () => {
		expect(
			isPortraitTrackingDiscontinuity({
				previousTimestampSeconds: null,
				requestedTimestampSeconds: 12,
			})
		).toBe(false);
		expect(
			isPortraitTrackingDiscontinuity({
				previousTimestampSeconds: 12,
				requestedTimestampSeconds: 12,
			})
		).toBe(false);
		expect(
			isPortraitTrackingDiscontinuity({
				previousTimestampSeconds: 12,
				requestedTimestampSeconds: 12.5,
			})
		).toBe(false);
	});

	it("invalidates mappings on backwards and large forwards seeks", () => {
		expect(
			isPortraitTrackingDiscontinuity({
				previousTimestampSeconds: 12,
				requestedTimestampSeconds: 11,
			})
		).toBe(true);
		expect(
			isPortraitTrackingDiscontinuity({
				previousTimestampSeconds: 12,
				requestedTimestampSeconds: 13.001,
			})
		).toBe(true);
	});

	it("accepts renderer pixel differences only for the same source frame", () => {
		expect(
			canMapPortraitDetection({
				requestedFaceCount: 1,
				detectionSourceKey: "preview:clip-1",
				requestSourceKey: "preview:clip-1",
				detectionFrameNumber: 24,
				requestFrameNumber: 24,
				detectionFrameHash: "480x239",
				requestFrameHash: "480x240",
			})
		).toBe(true);
		expect(
			canMapPortraitDetection({
				requestedFaceCount: 1,
				detectionSourceKey: "preview:clip-1",
				requestSourceKey: "preview:clip-1",
				detectionFrameNumber: 24,
				requestFrameNumber: 25,
				detectionFrameHash: "same-pixels",
				requestFrameHash: "same-pixels",
			})
		).toBe(false);
	});

	it("rejects a different source and falls back to exact frame identity", () => {
		expect(
			canMapPortraitDetection({
				requestedFaceCount: 1,
				detectionSourceKey: "preview:clip-1",
				requestSourceKey: "preview:clip-2",
				detectionFrameHash: "same-frame",
				requestFrameHash: "same-frame",
			})
		).toBe(false);
		expect(
			canMapPortraitDetection({
				requestedFaceCount: 1,
				detectionFrameHash: "same-frame",
				requestFrameHash: "same-frame",
			})
		).toBe(true);
	});
});
