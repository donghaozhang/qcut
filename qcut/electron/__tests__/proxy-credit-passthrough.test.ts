import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the api-key-handler so callModelApi can import
vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({
		falApiKey: "",
		geminiApiKey: "",
		openRouterApiKey: "",
	}),
}));

// Mock proxy-client to capture what gets passed
const mockCallModelApiViaProxy = vi.fn().mockResolvedValue({
	success: true,
	data: {},
	duration: 1,
});

vi.mock("../native-pipeline/infra/proxy-client.js", async (importOriginal) => {
	const original = (await importOriginal()) as Record<string, unknown>;
	return {
		...original,
		isProxyAvailable: vi.fn().mockResolvedValue(true),
		callModelApiViaProxy: mockCallModelApiViaProxy,
	};
});

const { callModelApi } = await import("../native-pipeline/infra/api-caller.js");

describe("proxy credit pass-through", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Ensure no local API keys so proxy mode is used
		delete process.env.FAL_KEY;
		delete process.env.FAL_API_KEY;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("passes credits when modelKey is provided", async () => {
		await callModelApi({
			endpoint: "fal-ai/ltx-video/v2",
			modelKey: "some_model_key",
			payload: { prompt: "test" },
			provider: "fal",
		});

		expect(mockCallModelApiViaProxy).toHaveBeenCalledTimes(1);
		const [options] = mockCallModelApiViaProxy.mock.calls[0];
		expect(options.credits).toBeDefined();
		expect(options.credits.amount).toBeGreaterThan(0);
		expect(options.credits.modelKey).toBe("some_model_key");
		expect(options.credits.description).toContain("generation");
	});

	it("does not pass credits when modelKey is omitted", async () => {
		await callModelApi({
			endpoint: "fal-ai/ltx-video/v2",
			payload: { prompt: "test" },
			provider: "fal",
		});

		expect(mockCallModelApiViaProxy).toHaveBeenCalledTimes(1);
		const [options] = mockCallModelApiViaProxy.mock.calls[0];
		expect(options.credits).toBeUndefined();
	});
});
