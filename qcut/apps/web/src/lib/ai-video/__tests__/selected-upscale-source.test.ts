import { describe, expect, it, vi } from "vitest";
import {
	requestSelectedVideoUpscale,
	subscribeToSelectedVideoUpscale,
} from "../selected-upscale-source";

describe("selected video upscale requests", () => {
	it("delivers a source queued before the upscale panel mounts", () => {
		const file = new File([], "queued.mp4", { type: "video/mp4" });
		const onSource = vi.fn();
		requestSelectedVideoUpscale({ file });

		const unsubscribe = subscribeToSelectedVideoUpscale({ onSource });
		expect(onSource).toHaveBeenCalledWith({ file });
		unsubscribe();
	});

	it("delivers a source to an already-mounted upscale panel", () => {
		const file = new File([], "selected.mp4", { type: "video/mp4" });
		const onSource = vi.fn();
		const unsubscribe = subscribeToSelectedVideoUpscale({ onSource });

		requestSelectedVideoUpscale({ file });
		expect(onSource).toHaveBeenCalledWith({ file });
		unsubscribe();
	});
});
