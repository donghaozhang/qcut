import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the api-key-handler module before importing
vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({
		falApiKey: "test-fal-key",
		geminiApiKey: "test-gemini-key",
		openRouterApiKey: "test-openrouter-key",
	}),
}));

// We need to dynamically import after mocking
const { callModelApi, getAdaptivePollInterval } = await import(
	"../native-pipeline/infra/api-caller.js"
);

function clearEnv(key: string) {
	delete process.env[key];
}

describe("api-caller", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("callModelApi", () => {
		it("returns error when no API key configured", async () => {
			// Override the mock for this test
			const { getDecryptedApiKeys } = await import("../api-key-handler.js");
			(getDecryptedApiKeys as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				falApiKey: "",
				geminiApiKey: "",
				openRouterApiKey: "",
			});

			// Clear env vars for this test
			const origFal = process.env.FAL_KEY;
			const origFalApi = process.env.FAL_API_KEY;
			clearEnv("FAL_KEY");
			clearEnv("FAL_API_KEY");

			const result = await callModelApi({
				endpoint: "fal-ai/test",
				payload: { prompt: "test" },
				provider: "fal",
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("No API key configured");

			// Restore
			if (origFal) process.env.FAL_KEY = origFal;
			if (origFalApi) process.env.FAL_API_KEY = origFalApi;
		});

		it("handles FAL queue-based flow", async () => {
			const mockQueueResponse = { request_id: "req-123", status: "IN_QUEUE" };
			const mockStatusResponse = { status: "COMPLETED" };
			const mockResultResponse = {
				video: { url: "https://cdn.fal.ai/output.mp4" },
			};

			let callCount = 0;
			globalThis.fetch = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockQueueResponse),
						text: () => Promise.resolve(JSON.stringify(mockQueueResponse)),
					});
				}
				if (callCount === 2) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockStatusResponse),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(mockResultResponse),
				});
			});

			process.env.FAL_KEY = "test-key";

			const result = await callModelApi({
				endpoint: "fal-ai/kling-video/v2/master/text-to-video",
				payload: { prompt: "A cat" },
				provider: "fal",
			});

			expect(result.success).toBe(true);
			expect(result.outputUrl).toBe("https://cdn.fal.ai/output.mp4");

			clearEnv("FAL_KEY");
		});

		it("handles non-FAL synchronous response", async () => {
			const mockResponse = {
				choices: [{ message: { content: "A beautiful scene" } }],
			};

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				// readJsonResponseWithHeartbeat logs content-length/type, so the
				// mock needs a headers lookup like a real Response. Headers (not
				// Map) matches a real Response: case-insensitive .get().
				headers: new Headers([["content-type", "application/json"]]),
				json: () => Promise.resolve(mockResponse),
				text: () => Promise.resolve(JSON.stringify(mockResponse)),
			});

			process.env.OPENROUTER_API_KEY = "test-key";

			const result = await callModelApi({
				endpoint: "chat/completions",
				payload: { messages: [] },
				provider: "openrouter",
			});

			expect(result.success).toBe(true);
			expect(result.data).toEqual(mockResponse);

			clearEnv("OPENROUTER_API_KEY");
		});

		it("handles API errors", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				text: () => Promise.resolve("Bad Request"),
			});

			process.env.FAL_KEY = "test-key";

			const result = await callModelApi({
				endpoint: "fal-ai/test",
				payload: {},
				provider: "fal",
				retries: 0,
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("400");

			clearEnv("FAL_KEY");
		});

		it("supports cancellation via AbortSignal", async () => {
			const controller = new AbortController();
			controller.abort();

			globalThis.fetch = vi.fn().mockRejectedValue(new Error("aborted"));

			process.env.FAL_KEY = "test-key";

			const result = await callModelApi({
				endpoint: "fal-ai/test",
				payload: {},
				provider: "fal",
				signal: controller.signal,
				retries: 0,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Cancelled");

			clearEnv("FAL_KEY");
		});

		it("is a callable function", () => {
			expect(callModelApi).toBeDefined();
			expect(typeof callModelApi).toBe("function");
		});
	});

	describe("getAdaptivePollInterval", () => {
		it("returns 500ms for first 10 seconds", () => {
			expect(getAdaptivePollInterval(0)).toBe(500);
			expect(getAdaptivePollInterval(5_000)).toBe(500);
			expect(getAdaptivePollInterval(9_999)).toBe(500);
		});

		it("returns 2000ms between 10-30 seconds", () => {
			expect(getAdaptivePollInterval(10_000)).toBe(2_000);
			expect(getAdaptivePollInterval(20_000)).toBe(2_000);
			expect(getAdaptivePollInterval(29_999)).toBe(2_000);
		});

		it("returns 4000ms after 30 seconds", () => {
			expect(getAdaptivePollInterval(30_000)).toBe(4_000);
			expect(getAdaptivePollInterval(60_000)).toBe(4_000);
			expect(getAdaptivePollInterval(120_000)).toBe(4_000);
		});
	});
});
