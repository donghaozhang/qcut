import { describe, expect, it } from "vitest";
import {
	VIDEO_OBJECT_ALPHA_QUALITY_FAILURE,
	VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE,
	VideoObjectRuntimeCircuitBreaker,
} from "../jianying-person-cutout/video-object-circuit-breaker.js";

describe("video-object runtime circuit breaker", () => {
	it("opens only for the calibrated Alpha quality failure", () => {
		const circuitBreaker = new VideoObjectRuntimeCircuitBreaker();
		expect(
			circuitBreaker.reject({
				capabilitySha256: "capability-a",
				error: new Error(
					`${VIDEO_OBJECT_ALPHA_QUALITY_FAILURE}: ${VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE}; fall back to portrait GRU`
				),
			})
		).toBe(true);
		expect(circuitBreaker.isOpen({ capabilitySha256: "capability-a" })).toBe(
			true
		);
		expect(circuitBreaker.isOpen({ capabilitySha256: "capability-b" })).toBe(
			false
		);
	});

	it("keeps transient and unrelated failures retryable", () => {
		const circuitBreaker = new VideoObjectRuntimeCircuitBreaker();
		for (const error of [
			new Error("encoder failed"),
			new Error("video-object process was cancelled"),
			new Error(`${VIDEO_OBJECT_ALPHA_QUALITY_FAILURE}: invalid Alpha`),
			new Error(VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE),
			"not an Error",
		]) {
			expect(
				circuitBreaker.reject({
					capabilitySha256: "capability-a",
					error,
				})
			).toBe(false);
		}
		expect(circuitBreaker.isOpen({ capabilitySha256: "capability-a" })).toBe(
			false
		);
	});
});
