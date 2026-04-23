/**
 * Tests for renderer-side moyin shot generation helpers.
 *
 * Verifies that the helpers delegate to the main-process media IPC
 * (`platform().moyin.generateImage` / `generateVideo`) and pass through
 * the provider + prompt correctly.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
	generateImage: vi.fn(),
	generateVideo: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		moyin: {
			generateImage: mocks.generateImage,
			generateVideo: mocks.generateVideo,
		},
	}),
}));

const {
	generateShotImage,
	generateShotImageRequest,
	generateShotVideoRequest,
	generateFalImage,
} = await import("../moyin-shot-generation");

describe("generateShotImage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards prompt + provider to the IPC and returns the URL", async () => {
		mocks.generateImage.mockResolvedValue({
			success: true,
			url: "https://cdn/out.png",
		});

		const url = await generateShotImage("a mountain", "gmi");

		expect(url).toBe("https://cdn/out.png");
		expect(mocks.generateImage).toHaveBeenCalledTimes(1);
		const call = mocks.generateImage.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.prompt).toBe("a mountain");
		expect(call.size).toEqual({ width: 1920, height: 1080 });
	});

	it("defaults to the FAL provider when none is supplied", async () => {
		mocks.generateImage.mockResolvedValue({
			success: true,
			url: "https://cdn/fal.png",
		});

		await generateShotImageRequest("x");

		const call = mocks.generateImage.mock.calls[0][0];
		expect(call.provider).toBe("fal");
	});

	it("surfaces IPC errors to the caller", async () => {
		mocks.generateImage.mockResolvedValue({
			success: false,
			error: "No FAL API key",
		});

		await expect(generateShotImage("x")).rejects.toThrow(/No FAL API key/);
	});

	it("generateFalImage legacy wrapper forces the FAL provider", async () => {
		mocks.generateImage.mockResolvedValue({
			success: true,
			url: "https://cdn/fal.png",
		});

		await generateFalImage("x", { width: 1280, height: 720 });

		const call = mocks.generateImage.mock.calls[0][0];
		expect(call.provider).toBe("fal");
		expect(call.size).toEqual({ width: 1280, height: 720 });
	});
});

describe("generateShotVideoRequest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards imageUrl + prompt + provider to the video IPC", async () => {
		mocks.generateVideo.mockResolvedValue({
			success: true,
			url: "https://cdn/out.mp4",
		});

		const url = await generateShotVideoRequest(
			"https://cdn/in.png",
			"slow pan",
			"gmi"
		);

		expect(url).toBe("https://cdn/out.mp4");
		const call = mocks.generateVideo.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.imageUrl).toBe("https://cdn/in.png");
		expect(call.prompt).toBe("slow pan");
	});

	it("surfaces IPC video errors", async () => {
		mocks.generateVideo.mockResolvedValue({
			success: false,
			error: "quota exceeded",
		});

		await expect(
			generateShotVideoRequest("https://cdn/in.png", "p")
		).rejects.toThrow(/quota exceeded/);
	});
});
