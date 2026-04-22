/**
 * Tests for moyin-media-handler: FAL and GMI image/video branches.
 *
 * We test the private helpers via the `__test` export rather than the
 * IPC-registered handlers themselves, so we can inject fake fetch +
 * callModelApi implementations without spinning up Electron.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDecryptedApiKeys: vi.fn(),
	callModelApi: vi.fn(),
	fetch: vi.fn(),
}));

vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: mocks.getDecryptedApiKeys,
}));

vi.mock("../native-pipeline/infra/api-caller.js", () => ({
	callModelApi: mocks.callModelApi,
}));

vi.mock("electron", () => ({
	ipcMain: { handle: vi.fn() },
}));

vi.mock("electron-log", () => ({
	default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}));

const { __test } = await import("../moyin-media-handler.js");

describe("moyin-media-handler: FAL image path", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = mocks.fetch as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("posts to flux-pro v1.1-ultra with a FAL Bearer Key header", async () => {
		mocks.fetch.mockResolvedValue(
			new Response(
				JSON.stringify({ images: [{ url: "https://fal.cdn/out.png" }] }),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		);

		const url = await __test.generateFalImage("fal-key", {
			provider: "fal",
			prompt: "a mountain",
		});

		expect(url).toBe("https://fal.cdn/out.png");
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		const [calledUrl, init] = mocks.fetch.mock.calls[0];
		expect(calledUrl).toBe("https://fal.run/fal-ai/flux-pro/v1.1-ultra");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Key fal-key");
		const body = JSON.parse(init.body as string) as { prompt: string };
		expect(body.prompt).toBe("a mountain");
	});

	it("surfaces the provider error detail when FAL returns a non-2xx", async () => {
		mocks.fetch.mockResolvedValue(
			new Response(JSON.stringify({ detail: "moderation blocked" }), {
				status: 422,
				headers: { "Content-Type": "application/json" },
			})
		);

		await expect(
			__test.generateFalImage("fal-key", {
				provider: "fal",
				prompt: "x",
			})
		).rejects.toThrow(/moderation blocked/);
	});
});

describe("moyin-media-handler: GMI image path", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("routes through callModelApi with provider=gmi and the default seedream model", async () => {
		mocks.callModelApi.mockResolvedValue({
			success: true,
			outputUrl: "https://gmi.cdn/out.png",
			duration: 1,
		});

		const url = await __test.generateGmiImage({
			provider: "gmi",
			prompt: "a lake",
		});

		expect(url).toBe("https://gmi.cdn/out.png");
		expect(mocks.callModelApi).toHaveBeenCalledTimes(1);
		const call = mocks.callModelApi.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.endpoint).toBe("seedream-4.0");
		expect(call.payload.prompt).toBe("a lake");
		expect(call.payload.aspect_ratio).toBe("16:9");
	});

	it("honors a caller-supplied model alias on the GMI image path", async () => {
		mocks.callModelApi.mockResolvedValue({
			success: true,
			outputUrl: "https://gmi.cdn/gem.png",
			duration: 1,
		});

		await __test.generateGmiImage({
			provider: "gmi",
			prompt: "p",
			model: "gemini-3-pro-image-preview",
		});

		const call = mocks.callModelApi.mock.calls[0][0];
		expect(call.endpoint).toBe("gemini-3-pro-image-preview");
	});

	it("throws when callModelApi reports a failure", async () => {
		mocks.callModelApi.mockResolvedValue({
			success: false,
			error: "insufficient credits",
			duration: 0,
		});

		await expect(
			__test.generateGmiImage({ provider: "gmi", prompt: "p" })
		).rejects.toThrow(/insufficient credits/);
	});
});

describe("moyin-media-handler: video paths", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = mocks.fetch as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("FAL video posts to wan v2.1/image-to-video with image_url and prompt", async () => {
		mocks.fetch.mockResolvedValue(
			new Response(
				JSON.stringify({ video: { url: "https://fal.cdn/out.mp4" } }),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		);

		const url = await __test.generateFalVideo("fal-key", {
			provider: "fal",
			imageUrl: "https://cdn/in.png",
			prompt: "slow pan",
		});

		expect(url).toBe("https://fal.cdn/out.mp4");
		const [calledUrl, init] = mocks.fetch.mock.calls[0];
		expect(calledUrl).toBe("https://fal.run/fal-ai/wan/v2.1/image-to-video");
		const body = JSON.parse(init.body as string) as {
			image_url: string;
			prompt: string;
		};
		expect(body.image_url).toBe("https://cdn/in.png");
		expect(body.prompt).toBe("slow pan");
	});

	it("GMI video routes through callModelApi with veo-3.1-lite by default", async () => {
		mocks.callModelApi.mockResolvedValue({
			success: true,
			outputUrl: "https://gmi.cdn/out.mp4",
			duration: 1,
		});

		const url = await __test.generateGmiVideo({
			provider: "gmi",
			imageUrl: "https://cdn/in.png",
			prompt: "slow pan",
		});

		expect(url).toBe("https://gmi.cdn/out.mp4");
		const call = mocks.callModelApi.mock.calls[0][0];
		expect(call.provider).toBe("gmi");
		expect(call.endpoint).toBe("veo-3.1-lite-generate-001");
		expect(call.payload.image_url).toBe("https://cdn/in.png");
	});
});

describe("moyin-media-handler: aspectFromSize", () => {
	it("maps landscape to 16:9", () => {
		expect(__test.aspectFromSize({ width: 1920, height: 1080 })).toBe("16:9");
	});
	it("maps portrait to 9:16", () => {
		expect(__test.aspectFromSize({ width: 1080, height: 1920 })).toBe("9:16");
	});
	it("maps square to 1:1", () => {
		expect(__test.aspectFromSize({ width: 1024, height: 1024 })).toBe("1:1");
	});
	it("defaults to 16:9 for unusual near-landscape ratios", () => {
		expect(__test.aspectFromSize({ width: 1440, height: 1080 })).toBe("16:9");
	});
});
