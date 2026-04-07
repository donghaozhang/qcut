import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

// Mock the key manager and electron imports
vi.mock("../../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({ gmiApiKey: "" }),
}));

// We need to import after mocks are set up
// The api-caller uses process.env for keys in CLI mode
beforeEach(() => {
	globalThis.fetch = mockFetch as unknown as typeof fetch;
	vi.clearAllMocks();
	process.env.GMI_API_KEY = "test-gmi-key";
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete process.env.GMI_API_KEY;
});

// Import the module under test — uses envApiKeyProvider path
import {
	callModelApi,
	setApiKeyProvider,
	envApiKeyProvider,
} from "../api-caller.js";

describe("callModelApi with GMI provider", () => {
	beforeEach(() => {
		// Use env-only key provider (CLI mode)
		setApiKeyProvider(envApiKeyProvider);
	});

	it("submits to GMI and polls until success", async () => {
		// Mock submit response
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ request_id: "gmi-req-123" }),
			text: () => Promise.resolve(""),
		});

		// Mock poll response — success on first poll
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					request_id: "gmi-req-123",
					status: "success",
					outcome: {
						video_url: "https://gmi.cloud/video/output.mp4",
						thumbnail_image_url: "https://gmi.cloud/video/thumb.jpg",
					},
				}),
		});

		const result = await callModelApi({
			endpoint: "veo-3.1-lite-generate-001",
			payload: { prompt: "A sunset over the ocean" },
			provider: "gmi",
		});

		expect(result.success).toBe(true);
		expect(result.outputUrl).toBe("https://gmi.cloud/video/output.mp4");

		// Verify submit call
		const submitCall = mockFetch.mock.calls[0];
		expect(submitCall[0]).toContain("/requests");
		const submitBody = JSON.parse(submitCall[1].body);
		expect(submitBody.model).toBe("veo-3.1-lite-generate-001");
		expect(submitBody.payload.prompt).toBe("A sunset over the ocean");
		expect(submitCall[1].headers.Authorization).toBe("Bearer test-gmi-key");
	});

	it("returns error when GMI submit fails", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: () => Promise.resolve("Unauthorized"),
		});

		const result = await callModelApi({
			endpoint: "veo-3.1-lite-generate-001",
			payload: { prompt: "test" },
			provider: "gmi",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("GMI API error 401");
	});

	it("returns error when GMI submit returns no ID", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({}),
			text: () => Promise.resolve(""),
		});

		const result = await callModelApi({
			endpoint: "skyreels-v4-text-to-video",
			payload: { prompt: "test" },
			provider: "gmi",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("request ID");
	});

	it("returns error when GMI poll reports failure", async () => {
		// Submit success
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ request_id: "gmi-req-456" }),
			text: () => Promise.resolve(""),
		});

		// Poll returns failed
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					request_id: "gmi-req-456",
					status: "failed",
					error: "Model overloaded",
				}),
		});

		const result = await callModelApi({
			endpoint: "skyreels-v4-text-to-video",
			payload: { prompt: "test" },
			provider: "gmi",
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("Model overloaded");
	});

	it("returns error when GMI poll reports cancelled", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ request_id: "gmi-req-789" }),
			text: () => Promise.resolve(""),
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					request_id: "gmi-req-789",
					status: "cancelled",
				}),
		});

		const result = await callModelApi({
			endpoint: "kling-v3-text-to-video",
			payload: { prompt: "test" },
			provider: "gmi",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("cancelled");
	});

	it("calls onProgress during GMI polling", async () => {
		vi.useFakeTimers();
		const onProgress = vi.fn();

		// Submit
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ request_id: "gmi-req-prog" }),
			text: () => Promise.resolve(""),
		});

		// Poll 1: processing
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({ request_id: "gmi-req-prog", status: "processing" }),
		});

		// Poll 2: success
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					request_id: "gmi-req-prog",
					status: "success",
					outcome: { video_url: "https://gmi.cloud/out.mp4" },
				}),
		});

		const resultPromise = callModelApi({
			endpoint: "veo-3.1-lite-generate-001",
			payload: { prompt: "test" },
			provider: "gmi",
			onProgress,
		});

		// Advance past poll sleep intervals
		await vi.advanceTimersByTimeAsync(15000);

		const result = await resultPromise;

		expect(result.success).toBe(true);
		expect(onProgress).toHaveBeenCalled();
		// Last call should be 100% completion
		const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
		expect(lastCall[0]).toBe(100);

		vi.useRealTimers();
	});

	it("returns error when no GMI API key is configured", async () => {
		delete process.env.GMI_API_KEY;

		const result = await callModelApi({
			endpoint: "veo-3.1-lite-generate-001",
			payload: { prompt: "test" },
			provider: "gmi",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("No API key");
	});

	it("wraps endpoint as model ID in GMI submit payload", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ request_id: "gmi-req-wrap" }),
			text: () => Promise.resolve(""),
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					request_id: "gmi-req-wrap",
					status: "success",
					outcome: { video_url: "https://gmi.cloud/v.mp4" },
				}),
		});

		await callModelApi({
			endpoint: "kling-v3-omni",
			payload: { prompt: "test", mode: "pro", duration: "5" },
			provider: "gmi",
		});

		const submitBody = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(submitBody).toEqual({
			model: "kling-v3-omni",
			payload: { prompt: "test", mode: "pro", duration: "5" },
		});
	});
});
