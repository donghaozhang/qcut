import { describe, expect, it } from "vitest";
import {
	resolvePersonCutoutRoutingMode,
	selectPersonCutoutRoute,
} from "../jianying-person-cutout/model-router.js";

describe("person cutout model routing", () => {
	it("keeps the user-facing person cutout on portrait GRU by default", () => {
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: false,
			})
		).toBe("portrait-gru");
	});

	it("allows an explicit advanced model route", () => {
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: false,
				requestedRoute: "video-object",
			})
		).toBe("video-object");
	});

	it("uses face-based routing only when the experiment is enabled", () => {
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: true,
			})
		).toBe("auto");
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: true,
				requestedRoute: "portrait-gru",
			})
		).toBe("portrait-gru");
	});

	it("keeps portrait GRU when at least half of sampled frames have a face", () => {
		expect(
			selectPersonCutoutRoute({
				facePositiveSampleCount: 2,
				personPositiveSampleCount: 2,
				personValidSampleCount: 3,
				validSampleCount: 3,
				videoObjectAvailable: true,
			})
		).toBe("portrait-gru");
		expect(
			selectPersonCutoutRoute({
				facePositiveSampleCount: 2,
				personPositiveSampleCount: 2,
				personValidSampleCount: 4,
				validSampleCount: 4,
				videoObjectAvailable: true,
			})
		).toBe("portrait-gru");
	});

	it("does not treat missing faces as proof that a person is absent", () => {
		expect(
			selectPersonCutoutRoute({
				facePositiveSampleCount: 0,
				personPositiveSampleCount: 0,
				personValidSampleCount: 0,
				validSampleCount: 3,
				videoObjectAvailable: true,
			})
		).toBe("portrait-gru");
	});

	it("uses video-object only after an independent non-person classification", () => {
		expect(
			selectPersonCutoutRoute({
				facePositiveSampleCount: 0,
				personPositiveSampleCount: 0,
				personValidSampleCount: 3,
				validSampleCount: 3,
				videoObjectAvailable: true,
			})
		).toBe("video-object");
	});

	it("fails closed to GRU when sampling or video-object is unavailable", () => {
		expect(
			selectPersonCutoutRoute({
				facePositiveSampleCount: 0,
				personPositiveSampleCount: 0,
				personValidSampleCount: 0,
				validSampleCount: 0,
				videoObjectAvailable: true,
			})
		).toBe("portrait-gru");
		expect(
			selectPersonCutoutRoute({
				facePositiveSampleCount: 0,
				personPositiveSampleCount: 0,
				personValidSampleCount: 3,
				validSampleCount: 3,
				videoObjectAvailable: false,
			})
		).toBe("portrait-gru");
	});
});
