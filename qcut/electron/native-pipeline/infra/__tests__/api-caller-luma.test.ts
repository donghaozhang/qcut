import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;
const originalInitialWait = process.env.QCUT_LUMA_INITIAL_WAIT_MS;
const originalLumaKey = process.env.LUMA_AGENTS_API_KEY;

vi.mock("../../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => {
	globalThis.fetch = mockFetch as unknown as typeof fetch;
	vi.clearAllMocks();
	process.env.LUMA_AGENTS_API_KEY = "test-luma-key";
	process.env.QCUT_LUMA_INITIAL_WAIT_MS = "0";
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalLumaKey === undefined) {
		delete process.env.LUMA_AGENTS_API_KEY;
	} else {
		process.env.LUMA_AGENTS_API_KEY = originalLumaKey;
	}
	if (originalInitialWait === undefined) {
		delete process.env.QCUT_LUMA_INITIAL_WAIT_MS;
	} else {
		process.env.QCUT_LUMA_INITIAL_WAIT_MS = originalInitialWait;
	}
});

import {
	callModelApi,
	envApiKeyProvider,
	setApiKeyProvider,
} from "../api-caller.js";

describe("callModelApi with Luma provider", () => {
	beforeEach(() => {
		setApiKeyProvider(envApiKeyProvider);
	});

	it("submits to Luma generations and polls until completion", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: "gen_luma_123",
					state: "queued",
				}),
			text: () => Promise.resolve(""),
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: "gen_luma_123",
					state: "completed",
					output: [{ url: "https://luma.example/video.mp4" }],
				}),
		});

		const result = await callModelApi({
			endpoint: "generations",
			payload: {
				model: "ray-3.2",
				type: "video",
				prompt: "A misty greenhouse",
				video: { resolution: "720p", duration: "5s" },
			},
			provider: "luma",
		});

		expect(result.success).toBe(true);
		expect(result.outputUrl).toBe("https://luma.example/video.mp4");

		const submitCall = mockFetch.mock.calls[0];
		expect(submitCall[0]).toBe("https://agents.lumalabs.ai/v1/generations");
		expect(submitCall[1].headers.Authorization).toBe("Bearer test-luma-key");
		expect(JSON.parse(submitCall[1].body)).toMatchObject({
			model: "ray-3.2",
			type: "video",
			prompt: "A misty greenhouse",
		});

		const pollCall = mockFetch.mock.calls[1];
		expect(pollCall[0]).toBe(
			"https://agents.lumalabs.ai/v1/generations/gen_luma_123"
		);
		expect(pollCall[1].method).toBe("GET");
	});

	it("surfaces async Luma failures with failure code", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ id: "gen_fail", state: "queued" }),
			text: () => Promise.resolve(""),
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id: "gen_fail",
					state: "failed",
					failure_reason: "Prompt was moderated",
					failure_code: "content_moderated",
				}),
		});

		const result = await callModelApi({
			endpoint: "generations",
			payload: { model: "ray-3.2", type: "video", prompt: "test" },
			provider: "luma",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("Prompt was moderated");
		expect(result.error).toContain("content_moderated");
	});

	it("requires a local Luma API key", async () => {
		process.env.LUMA_AGENTS_API_KEY = "";

		const result = await callModelApi({
			endpoint: "generations",
			payload: { model: "ray-3.2", type: "video", prompt: "test" },
			provider: "luma",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("No API key configured");
		expect(mockFetch).not.toHaveBeenCalled();
	});
});
