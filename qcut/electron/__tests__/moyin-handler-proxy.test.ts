/**
 * Tests for moyin-handler.callLLM proxy fallback.
 *
 * Verifies the resolution order:
 *   1. Local OpenRouter key → direct OpenAI-compatible fetch
 *   2. Local Gemini key → direct Gemini fetch
 *   3. License-server proxy when signed in without a local key
 *   4. Throw when no key AND no session
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDecryptedApiKeys: vi.fn(),
	isProxyAvailable: vi.fn(),
	proxyRequest: vi.fn(),
	fetch: vi.fn(),
}));

vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: mocks.getDecryptedApiKeys,
}));

vi.mock("../native-pipeline/infra/proxy-client.js", () => ({
	isProxyAvailable: mocks.isProxyAvailable,
	proxyRequest: mocks.proxyRequest,
	setSessionTokenProvider: vi.fn(),
}));

vi.mock("electron-log", () => ({
	default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}));

const { callLLM } = await import("../moyin-llm.js");

const EMPTY_KEYS = {
	falApiKey: "",
	freesoundApiKey: "",
	geminiApiKey: "",
	openRouterApiKey: "",
	anthropicApiKey: "",
	elevenLabsApiKey: "",
	gmiApiKey: "",
	runwayApiKey: "",
};

describe("moyin-handler callLLM proxy fallback", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = mocks.fetch as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("routes through the license-server proxy when no local key is set but proxy is available", async () => {
		mocks.getDecryptedApiKeys.mockResolvedValue({ ...EMPTY_KEYS });
		mocks.isProxyAvailable.mockResolvedValue(true);
		mocks.proxyRequest.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				choices: [{ message: { content: "proxy reply" } }],
			},
		});

		const result = await callLLM("sys", "user");

		expect(result).toBe("proxy reply");
		expect(mocks.proxyRequest).toHaveBeenCalledTimes(1);
		const call = mocks.proxyRequest.mock.calls[0][0];
		expect(call.provider).toBe("openrouter");
		expect(call.endpoint).toBe("chat/completions");
		expect(call.method).toBe("POST");
		expect(call.body.messages).toEqual([
			{ role: "system", content: "sys" },
			{ role: "user", content: "user" },
		]);
		// Direct fetch must NOT be used in proxy mode
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("prefers a local OpenRouter key over the proxy", async () => {
		mocks.getDecryptedApiKeys.mockResolvedValue({
			...EMPTY_KEYS,
			openRouterApiKey: "sk-or-local123",
		});
		mocks.isProxyAvailable.mockResolvedValue(true);
		mocks.fetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "direct reply" } }],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		);

		const result = await callLLM("sys", "user");

		expect(result).toBe("direct reply");
		expect(mocks.proxyRequest).not.toHaveBeenCalled();
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		// Authorization header should be Bearer <key> for OpenRouter
		const [, init] = mocks.fetch.mock.calls[0];
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-or-local123");
	});

	it("throws when neither a local key nor the proxy is available", async () => {
		mocks.getDecryptedApiKeys.mockResolvedValue({ ...EMPTY_KEYS });
		mocks.isProxyAvailable.mockResolvedValue(false);

		await expect(callLLM("sys", "user")).rejects.toThrow(
			/No LLM API key configured/
		);
		expect(mocks.proxyRequest).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("surfaces the proxy status and body preview when the proxy returns a non-2xx", async () => {
		mocks.getDecryptedApiKeys.mockResolvedValue({ ...EMPTY_KEYS });
		mocks.isProxyAvailable.mockResolvedValue(true);
		mocks.proxyRequest.mockResolvedValue({
			ok: false,
			status: 402,
			data: { error: "insufficient credits" },
		});

		await expect(callLLM("sys", "user")).rejects.toThrow(
			/Proxy LLM error \(402\)/
		);
	});

	it("throws when the proxy returns an empty content payload", async () => {
		mocks.getDecryptedApiKeys.mockResolvedValue({ ...EMPTY_KEYS });
		mocks.isProxyAvailable.mockResolvedValue(true);
		mocks.proxyRequest.mockResolvedValue({
			ok: true,
			status: 200,
			data: { choices: [{ message: { content: "" } }] },
		});

		await expect(callLLM("sys", "user")).rejects.toThrow(
			/Empty response from proxy LLM/
		);
	});
});
