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

describe("makeFalRequest proxyFirst mode", () => {
	beforeEach(() => {
		clearFalApiKeyCache();
		vi.stubEnv("VITE_FAL_API_KEY", "local-key-abc");
	});

	it("tries proxy first when proxyFirst=true AND session token exists", async () => {
		mockGetAuthToken.mockResolvedValue("session-xyz");
		mockFetch.mockResolvedValue(new Response('{"images":[]}', { status: 200 }));

		await makeFalRequest(
			"fal-ai/test",
			{ prompt: "t" },
			{ proxyFirst: true }
		);

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toContain("/api/ai/proxy");
		expect(init.headers.Authorization).toBe("Bearer session-xyz");
	});

	it("falls back to local key when proxy returns non-OK AND local key present", async () => {
		mockGetAuthToken.mockResolvedValue("session-xyz");
		mockFetch
			.mockResolvedValueOnce(new Response("", { status: 500 }))
			.mockResolvedValueOnce(new Response('{"images":[]}', { status: 200 }));

		await makeFalRequest(
			"fal-ai/test",
			{ prompt: "t" },
			{ proxyFirst: true }
		);

		expect(mockFetch).toHaveBeenCalledTimes(2);
		const [, proxyInit] = mockFetch.mock.calls[0];
		expect(proxyInit.headers.Authorization).toBe("Bearer session-xyz");
		const [directUrl, directInit] = mockFetch.mock.calls[1];
		expect(directUrl).toBe("https://fal.run/fal-ai/test");
		expect(directInit.headers.Authorization).toBe("Key local-key-abc");
	});

	it("returns proxy response on non-OK when no local key (no fallback available)", async () => {
		vi.stubEnv("VITE_FAL_API_KEY", "");
		mockGetAuthToken.mockResolvedValue("session-xyz");
		mockFetch.mockResolvedValue(new Response('{"detail":"x"}', { status: 500 }));

		const response = await makeFalRequest(
			"fal-ai/test",
			{ prompt: "t" },
			{ proxyFirst: true }
		);

		expect(response.status).toBe(500);
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it("uses direct local-key path when proxyFirst=false (default) with local key", async () => {
		mockGetAuthToken.mockResolvedValue("session-xyz");
		mockFetch.mockResolvedValue(new Response('{"images":[]}', { status: 200 }));

		await makeFalRequest("fal-ai/test", { prompt: "t" });

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://fal.run/fal-ai/test");
		expect(init.headers.Authorization).toBe("Key local-key-abc");
	});

	it("uses direct local-key path when proxyFirst=true but no session token", async () => {
		mockGetAuthToken.mockResolvedValue("");
		mockFetch.mockResolvedValue(new Response('{"images":[]}', { status: 200 }));

		await makeFalRequest(
			"fal-ai/test",
			{ prompt: "t" },
			{ proxyFirst: true }
		);

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://fal.run/fal-ai/test");
		expect(init.headers.Authorization).toBe("Key local-key-abc");
	});

	it("attaches credits to proxy body when modelKey is supplied", async () => {
		mockGetAuthToken.mockResolvedValue("session-xyz");
		mockFetch.mockResolvedValue(new Response('{"images":[]}', { status: 200 }));

		await makeFalRequest(
			"https://fal.run/openai/gpt-image-2",
			{ prompt: "t" },
			{ proxyFirst: true, modelKey: "gpt-image-2-fal" }
		);

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.credits?.modelKey).toBe("gpt-image-2-fal");
		expect(body.credits?.amount).toBeGreaterThan(0);
		expect(body.credits?.description).toContain("gpt-image-2-fal");
	});

	it("omits credits when modelKey is not supplied", async () => {
		mockGetAuthToken.mockResolvedValue("session-xyz");
		mockFetch.mockResolvedValue(new Response('{"images":[]}', { status: 200 }));

		await makeFalRequest(
			"fal-ai/test",
			{ prompt: "t" },
			{ proxyFirst: true }
		);

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.credits).toBeUndefined();
	});
});
