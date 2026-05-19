import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("../../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => {
	globalThis.fetch = mockFetch as unknown as typeof fetch;
	vi.clearAllMocks();
	process.env.IMAROUTER_API_KEY = "test-imarouter-key";
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env.IMAROUTER_API_KEY = "";
});

import {
	callModelApi,
	envApiKeyProvider,
	setApiKeyProvider,
} from "../api-caller.js";

describe("callModelApi with IMA Router provider", () => {
	beforeEach(() => {
		setApiKeyProvider(envApiKeyProvider);
	});

	it("submits to /v1/videos and polls until completion", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ task_id: "task_abc123" }),
			text: () => Promise.resolve(""),
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					status: "completed",
					progress: 100,
					results: [{ url: "https://imarouter.example/v.mp4" }],
				}),
		});

		const result = await callModelApi({
			endpoint: "v1/videos",
			payload: {
				model: "seedance-2.0",
				duration: 5,
				prompt: "A sunset",
				metadata: { resolution: "1080p", aspect_ratio: "16:9" },
			},
			provider: "imarouter",
		});

		expect(result.success).toBe(true);
		expect(result.outputUrl).toBe("https://imarouter.example/v.mp4");

		const submitCall = mockFetch.mock.calls[0];
		expect(submitCall[0]).toBe("https://api.imarouter.com/v1/videos");
		expect(submitCall[1].headers.Authorization).toBe(
			"Bearer test-imarouter-key"
		);
		// IMA Router takes the payload verbatim (no GMI-style { model, payload } wrap).
		const submitBody = JSON.parse(submitCall[1].body);
		expect(submitBody.model).toBe("seedance-2.0");
		expect(submitBody.prompt).toBe("A sunset");
		expect(submitBody.metadata.resolution).toBe("1080p");
	});

	it("submits to /v1/images/generations and polls image status until success", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({ code: "success", data: { task_id: "img_task_1" } }),
			text: () => Promise.resolve(""),
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					code: "success",
					data: {
						task_id: "img_task_1",
						status: "succeeded",
						format: "png",
						url: "https://imarouter.example/image.png",
						amount_usd: 0.042,
					},
				}),
		});

		const result = await callModelApi({
			endpoint: "v1/images/generations",
			payload: {
				model: "gpt-image-2",
				prompt: "A matte black cube",
				size: "1024x1024",
				quality: "medium",
				output_format: "png",
			},
			provider: "imarouter",
		});

		expect(result.success).toBe(true);
		expect(result.outputUrl).toBe("https://imarouter.example/image.png");

		const submitCall = mockFetch.mock.calls[0];
		expect(submitCall[0]).toBe(
			"https://api.imarouter.com/v1/images/generations"
		);
		expect(JSON.parse(submitCall[1].body)).toEqual({
			model: "gpt-image-2",
			prompt: "A matte black cube",
			size: "1024x1024",
			quality: "medium",
			output_format: "png",
		});
		const pollCall = mockFetch.mock.calls[1];
		expect(pollCall[0]).toBe(
			"https://api.imarouter.com/v1/images/generations/img_task_1"
		);
	});

	it("surfaces failed image tasks", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ task_id: "img_fail" }),
			text: () => Promise.resolve(""),
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					data: {
						status: "failed",
						error: { message: "image prompt rejected" },
					},
				}),
		});

		const result = await callModelApi({
			endpoint: "v1/images/generations",
			payload: { model: "gpt-image-2", prompt: "test" },
			provider: "imarouter",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("image prompt rejected");
	});

	it("surfaces a 4xx submit error", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			text: () =>
				Promise.resolve(
					JSON.stringify({ code: "unsupported_resolution_for_fast_variant" })
				),
		});

		const result = await callModelApi({
			endpoint: "v1/videos",
			payload: { model: "seedance-2.0-fast" },
			provider: "imarouter",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("IMA Router submit error 400");
		// `redactErrorPreview` keeps the structured code so operators can act on it.
		expect(result.error).toContain("unsupported_resolution_for_fast_variant");
	});

	it("returns error when submit returns no task id", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ message: "queue full" }),
			text: () => Promise.resolve(""),
		});

		const result = await callModelApi({
			endpoint: "v1/videos",
			payload: { model: "seedance-2.0" },
			provider: "imarouter",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("did not return a task id");
	});

	it("surfaces a failed task in the poll response", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ task_id: "task_fail" }),
			text: () => Promise.resolve(""),
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					status: "failed",
					error: { message: "model rejected portrait inline URL" },
				}),
		});

		const result = await callModelApi({
			endpoint: "v1/videos",
			payload: { model: "seedance-2.0" },
			provider: "imarouter",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("model rejected portrait inline URL");
	});

	it("returns error when no IMA Router API key is configured", async () => {
		process.env.IMAROUTER_API_KEY = "";

		const result = await callModelApi({
			endpoint: "v1/videos",
			payload: { model: "seedance-2.0" },
			provider: "imarouter",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("No API key");
	});
});
