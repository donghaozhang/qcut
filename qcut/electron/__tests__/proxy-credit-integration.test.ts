/**
 * Integration test: verifies the full credit flow from callModelApi → proxy → server.
 *
 * Mocks fetch to capture the actual HTTP request body sent to the proxy,
 * verifying that credits are included with the correct amount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Register models
import { registerTextToVideoModels } from "../native-pipeline/registry-data/text-to-video.js";
registerTextToVideoModels();

// Mock api-key-handler: return empty keys so proxy mode activates
vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({
		falApiKey: "",
		geminiApiKey: "",
		openRouterApiKey: "",
	}),
}));

// Mock session token provider
vi.mock("../native-pipeline/infra/proxy-client.js", async (importOriginal) => {
	const original = (await importOriginal()) as Record<string, unknown>;
	return {
		...original,
		getSessionToken: vi.fn().mockResolvedValue("test-session-token"),
		isProxyAvailable: vi.fn().mockResolvedValue(true),
	};
});

const { callModelApi } = await import("../native-pipeline/infra/api-caller.js");

describe("proxy credit integration", () => {
	const originalFetch = globalThis.fetch;
	let capturedBody: Record<string, unknown> | null = null;

	beforeEach(() => {
		capturedBody = null;
		delete process.env.FAL_KEY;
		delete process.env.FAL_API_KEY;

		// Intercept fetch to capture the request body sent to the proxy
		globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			if (urlStr.includes("/api/ai/proxy")) {
				capturedBody = JSON.parse(init?.body as string);
				return new Response(
					JSON.stringify({ video: { url: "https://example.com/output.mp4" } }),
					{ status: 200, headers: { "Content-Type": "application/json" } }
				);
			}
			return new Response("Not found", { status: 404 });
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("sends credits in the proxy request body for veo3 model", async () => {
		const result = await callModelApi({
			endpoint: "fal-ai/veo3",
			modelKey: "veo3",
			payload: { prompt: "a cat walking", duration: "8s" },
			provider: "fal",
			async: false,
		});

		expect(result.success).toBe(true);
		expect(capturedBody).not.toBeNull();
		expect(capturedBody!.credits).toBeDefined();

		const credits = capturedBody!.credits as {
			amount: number;
			modelKey: string;
			description: string;
		};
		expect(credits.modelKey).toBe("veo3");
		expect(credits.amount).toBeGreaterThan(0);
		expect(credits.description).toContain("generation");

		// veo3 at 8s with audio: 8 * $0.75 = $6.00 → 60 credits
		expect(credits.amount).toBe(60);
	});

	it("sends credits for hailuo_pro (per-video model)", async () => {
		await callModelApi({
			endpoint: "fal-ai/minimax/hailuo-02/pro/text-to-video",
			modelKey: "hailuo_pro",
			payload: { prompt: "test" },
			provider: "fal",
			async: false,
		});

		expect(capturedBody).not.toBeNull();
		const credits = capturedBody!.credits as {
			amount: number;
			modelKey: string;
		};
		expect(credits.modelKey).toBe("hailuo_pro");
		// hailuo_pro: $0.08 per video → 0.8 credits → rounds to 0.8
		expect(credits.amount).toBeGreaterThanOrEqual(0.1);
	});

	it("does NOT send credits when modelKey is omitted", async () => {
		await callModelApi({
			endpoint: "fal-ai/veo3",
			payload: { prompt: "test" },
			provider: "fal",
			async: false,
		});

		expect(capturedBody).not.toBeNull();
		expect(capturedBody!.credits).toBeUndefined();
	});
});
