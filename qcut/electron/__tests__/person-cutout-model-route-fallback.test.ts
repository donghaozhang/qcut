import { describe, expect, it, vi } from "vitest";
import { executePersonCutoutRouteWithFallback } from "../jianying-person-cutout/model-route-fallback.js";

const portraitRuntime = { modelRoute: "portrait-gru" as const };
const videoObjectRuntime = { modelRoute: "video-object" as const };

describe("person cutout model-route fallback", () => {
	it("keeps a successful selected route", async () => {
		const execute = vi.fn().mockResolvedValue("object-alpha");
		await expect(
			executePersonCutoutRouteWithFallback({
				execute,
				portraitRuntime,
				selectedRuntime: videoObjectRuntime,
			})
		).resolves.toEqual({
			didFallback: false,
			result: "object-alpha",
			runtime: videoObjectRuntime,
		});
		expect(execute).toHaveBeenCalledOnce();
	});

	it("retries an uncalibrated advanced route with portrait GRU", async () => {
		const failure = new Error("host Metal context is unavailable");
		const execute = vi
			.fn()
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce("portrait-alpha");
		const onFallback = vi.fn();
		await expect(
			executePersonCutoutRouteWithFallback({
				execute,
				onFallback,
				portraitRuntime,
				selectedRuntime: videoObjectRuntime,
			})
		).resolves.toEqual({
			didFallback: true,
			result: "portrait-alpha",
			runtime: portraitRuntime,
		});
		expect(execute).toHaveBeenNthCalledWith(1, videoObjectRuntime);
		expect(execute).toHaveBeenNthCalledWith(2, portraitRuntime);
		expect(onFallback).toHaveBeenCalledWith(failure);
	});

	it("does not hide a portrait GRU failure", async () => {
		const failure = new Error("GRU failed");
		const execute = vi.fn().mockRejectedValue(failure);
		await expect(
			executePersonCutoutRouteWithFallback({
				execute,
				portraitRuntime,
				selectedRuntime: portraitRuntime,
			})
		).rejects.toBe(failure);
		expect(execute).toHaveBeenCalledOnce();
	});

	it("does not retry cancellation", async () => {
		const cancelled = new Error("cancelled");
		cancelled.name = "AbortError";
		const execute = vi.fn().mockRejectedValue(cancelled);
		await expect(
			executePersonCutoutRouteWithFallback({
				execute,
				portraitRuntime,
				selectedRuntime: videoObjectRuntime,
			})
		).rejects.toBe(cancelled);
		expect(execute).toHaveBeenCalledOnce();
	});
});
