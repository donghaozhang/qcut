import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock platform
const mockGetAuthToken = vi.fn();
vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		license: {
			getAuthToken: mockGetAuthToken,
		},
		apiKeys: undefined,
	}),
}));

// Mock error handler
vi.mock("@/lib/debug/error-handler", () => ({
	handleAIServiceError: vi.fn(),
}));

// Mock global fetch
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", mockFetch);
	mockFetch.mockReset();
	mockGetAuthToken.mockReset();
	// Clear env to ensure no local API key
	vi.stubEnv("VITE_FAL_API_KEY", "");
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

// Import after mocks
const { makeFalRequest, clearFalApiKeyCache } = await import("../fal-request");

describe("makeFalRequest proxy mode", () => {
	beforeEach(() => {
		clearFalApiKeyCache();
	});

	it("routes through license server proxy when no local API key", async () => {
		mockGetAuthToken.mockResolvedValue("session-token-123");
		mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

		await makeFalRequest("fal-ai/test-model", { prompt: "test" });

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toContain("/api/ai/proxy");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer session-token-123");

		const body = JSON.parse(init.body);
		expect(body.provider).toBe("fal");
		expect(body.endpoint).toBe("https://fal.run/fal-ai/test-model");
		expect(body.method).toBe("POST");
		expect(body.body).toEqual({ prompt: "test" });
	});

	it("uses queue base URL in queue mode", async () => {
		mockGetAuthToken.mockResolvedValue("session-token-123");
		mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

		await makeFalRequest(
			"fal-ai/test-model",
			{ prompt: "test" },
			{ queueMode: true }
		);

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.endpoint).toBe("https://queue.fal.run/fal-ai/test-model");
	});

	it("passes through full URLs without prefixing base", async () => {
		mockGetAuthToken.mockResolvedValue("token");
		mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

		await makeFalRequest("https://custom.fal.run/endpoint", { prompt: "test" });

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.endpoint).toBe("https://custom.fal.run/endpoint");
	});

	it("throws when no API key and no session token", async () => {
		mockGetAuthToken.mockResolvedValue("");

		await expect(
			makeFalRequest("fal-ai/test", { prompt: "test" })
		).rejects.toThrow("FAL API key not configured");
	});

	it("forwards abort signal to proxy request", async () => {
		mockGetAuthToken.mockResolvedValue("token");
		const controller = new AbortController();
		mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

		await makeFalRequest(
			"fal-ai/test",
			{ prompt: "test" },
			{ signal: controller.signal }
		);

		expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
	});
});

describe("getSessionToken error handling", () => {
	it("falls through to error when getAuthToken throws", async () => {
		clearFalApiKeyCache();
		mockGetAuthToken.mockRejectedValue(new Error("auth failed"));

		await expect(
			makeFalRequest("fal-ai/test", { prompt: "test" })
		).rejects.toThrow("FAL API key not configured");
	});
});
