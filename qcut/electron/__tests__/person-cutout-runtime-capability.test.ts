import { describe, expect, it, vi } from "vitest";
import {
	executeTemattingWithFallback,
	NATIVE_METAL_LIBRARY_SHA256,
	selectTemattingBlendImplementation,
} from "../jianying-person-cutout/runtime-capability.js";
import {
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_BLEND,
} from "../jianying-person-cutout/tematting-blend.js";

describe("person cutout native Metal capability", () => {
	it("selects native Metal only for the verified arm64 runtime", () => {
		expect(
			selectTemattingBlendImplementation({
				arch: "arm64",
				disabled: false,
				librarySha256: NATIVE_METAL_LIBRARY_SHA256,
				platform: "darwin",
			})
		).toBe(TEMATTING_NATIVE_METAL_BLEND);
		for (const candidate of [
			{ arch: "x64", disabled: false, hash: NATIVE_METAL_LIBRARY_SHA256 },
			{ arch: "arm64", disabled: true, hash: NATIVE_METAL_LIBRARY_SHA256 },
			{ arch: "arm64", disabled: false, hash: "unknown" },
		]) {
			expect(
				selectTemattingBlendImplementation({
					arch: candidate.arch,
					disabled: candidate.disabled,
					librarySha256: candidate.hash,
					platform: "darwin",
				})
			).toBe(TEMATTING_COMPATIBLE_BLEND);
		}
	});

	it("retries the complete compatible path after a native failure", async () => {
		const execute = vi.fn(async (implementation) => {
			if (implementation === TEMATTING_NATIVE_METAL_BLEND) {
				throw new Error("unsupported ABI");
			}
		});
		const onFallback = vi.fn();

		await expect(
			executeTemattingWithFallback({
				execute,
				onFallback,
				preferred: TEMATTING_NATIVE_METAL_BLEND,
			})
		).resolves.toBe(TEMATTING_COMPATIBLE_BLEND);
		expect(
			execute.mock.calls.map(([implementation]) => implementation)
		).toEqual([TEMATTING_NATIVE_METAL_BLEND, TEMATTING_COMPATIBLE_BLEND]);
		expect(onFallback).toHaveBeenCalledOnce();
	});

	it("does not hide a compatible-path failure", async () => {
		const failure = new Error("model failed");
		const execute = vi.fn().mockRejectedValue(failure);
		await expect(
			executeTemattingWithFallback({
				execute,
				preferred: TEMATTING_COMPATIBLE_BLEND,
			})
		).rejects.toBe(failure);
		expect(execute).toHaveBeenCalledOnce();
	});

	it("does not retry a cancelled native render", async () => {
		const cancelled = new Error("cancelled");
		cancelled.name = "AbortError";
		const execute = vi.fn().mockRejectedValue(cancelled);

		await expect(
			executeTemattingWithFallback({
				execute,
				preferred: TEMATTING_NATIVE_METAL_BLEND,
			})
		).rejects.toBe(cancelled);
		expect(execute).toHaveBeenCalledOnce();
	});
});
