/**
 * Pins the server-first priority in callModelApi:
 *
 *   1. When the user is logged in (proxy available), the license-server
 *      proxy is tried FIRST — even if a local provider key is present.
 *   2. If the proxy call fails AND a local key is present, we fall back
 *      to direct provider mode.
 *   3. If the proxy call fails and there is NO local key, the proxy
 *      error is returned to the caller (no fallback).
 *   4. If the user is not logged in (proxy unavailable) and a local key
 *      is present, the request goes direct — preserves the pre-inversion
 *      behavior for BYOK users without a session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({
		falApiKey: "local-fal-key",
		geminiApiKey: "",
		openRouterApiKey: "",
	}),
}));

const mockCallModelApiViaProxy = vi.fn();
const mockIsProxyAvailable = vi.fn();

vi.mock("../native-pipeline/infra/proxy-client.js", async (importOriginal) => {
	const original = (await importOriginal()) as Record<string, unknown>;
	return {
		...original,
		isProxyAvailable: mockIsProxyAvailable,
		callModelApiViaProxy: mockCallModelApiViaProxy,
	};
});

const { callModelApi } = await import("../native-pipeline/infra/api-caller.js");

describe("callModelApi — server-first priority", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.FAL_KEY = "local-fal-key";
	});

	afterEach(() => {
		vi.restoreAllMocks();
		globalThis.fetch = originalFetch;
		delete process.env.FAL_KEY;
	});

	it("prefers the proxy when logged in, even with a local FAL_KEY present", async () => {
		mockIsProxyAvailable.mockResolvedValue(true);
		mockCallModelApiViaProxy.mockResolvedValue({
			success: true,
			data: { via: "proxy" },
			duration: 1,
		});

		const result = await callModelApi({
			endpoint: "fal-ai/gpt-image-2",
			modelKey: "gpt_image_2",
			payload: { prompt: "test" },
			provider: "fal",
		});

		expect(mockCallModelApiViaProxy).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
		expect((result.data as { via: string }).via).toBe("proxy");
	});

	it("falls back to the local key when the proxy fails and a key is present", async () => {
		mockIsProxyAvailable.mockResolvedValue(true);
		mockCallModelApiViaProxy.mockResolvedValue({
			success: false,
			error: "proxy unreachable",
			duration: 0,
		});

		// Stub fetch so the direct-mode FAL path returns a completed job.
		globalThis.fetch = vi.fn(async () =>
			Response.json({ status: "COMPLETED", images: [{ url: "https://x" }] })
		) as typeof fetch;

		const result = await callModelApi({
			endpoint: "fal-ai/gpt-image-2",
			modelKey: "gpt_image_2",
			payload: { prompt: "test" },
			provider: "fal",
			async: false,
		});

		expect(mockCallModelApiViaProxy).toHaveBeenCalledTimes(1);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
	});

	it("returns the proxy error without fallback when no local key is present", async () => {
		delete process.env.FAL_KEY;
		const { getDecryptedApiKeys } = await import("../api-key-handler.js");
		(getDecryptedApiKeys as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			falApiKey: "",
			geminiApiKey: "",
			openRouterApiKey: "",
		});
		mockIsProxyAvailable.mockResolvedValue(true);
		mockCallModelApiViaProxy.mockResolvedValue({
			success: false,
			error: "insufficient credits",
			duration: 0,
		});

		const result = await callModelApi({
			endpoint: "fal-ai/gpt-image-2",
			modelKey: "gpt_image_2",
			payload: { prompt: "test" },
			provider: "fal",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("insufficient credits");
	});

	it("uses the local key directly when not logged in (proxy unavailable)", async () => {
		mockIsProxyAvailable.mockResolvedValue(false);
		globalThis.fetch = vi.fn(async () =>
			Response.json({ status: "COMPLETED", images: [{ url: "https://x" }] })
		) as typeof fetch;

		const result = await callModelApi({
			endpoint: "fal-ai/gpt-image-2",
			modelKey: "gpt_image_2",
			payload: { prompt: "test" },
			provider: "fal",
			async: false,
		});

		expect(mockCallModelApiViaProxy).not.toHaveBeenCalled();
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
	});
});
