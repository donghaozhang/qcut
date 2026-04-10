import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock api-key-handler before import
vi.mock("../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({
		falApiKey: "",
		geminiApiKey: "",
		openRouterApiKey: "",
		gmiApiKey: "",
	}),
}));

// Capture callModelApi calls
const mockCallModelApi = vi.fn().mockResolvedValue({
	success: true,
	data: {
		status: "success",
		outcome: {
			choices: [{ message: { content: "Hello from GMI!" } }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		},
	},
	duration: 1,
});

vi.mock("../native-pipeline/infra/api-caller.js", async (importOriginal) => {
	const original = (await importOriginal()) as Record<string, unknown>;
	return {
		...original,
		callModelApi: mockCallModelApi,
	};
});

const { LLMAdapter } = await import(
	"../native-pipeline/vimax/adapters/llm-adapter.js"
);

describe("LLM Adapter — GMI LLM models", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.GMI_API_KEY = "test-gmi-key";
	});

	afterEach(() => {
		delete process.env.GMI_API_KEY;
		vi.restoreAllMocks();
	});

	it("resolves glm-5.1 alias to gmi/glm-5-1-fp8", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "glm-5.1",
		});

		expect(mockCallModelApi).toHaveBeenCalledTimes(1);
		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("gmi-llm");
		expect(opts.endpoint).toBe("glm-5-1-fp8");
	});

	it("resolves gemini-3.1-pro alias to gmi/gemini-3-1-pro-preview", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "gemini-3.1-pro",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("gmi-llm");
		expect(opts.endpoint).toBe("gemini-3-1-pro-preview");
	});

	it("resolves gpt-5.4 alias to gmi/gpt-5-4", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "gpt-5.4",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("gmi-llm");
		expect(opts.endpoint).toBe("gpt-5-4");
	});

	it("routes non-GMI models to openrouter", async () => {
		process.env.OPENROUTER_API_KEY = "test-or-key";
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "gemini-3-flash",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("openrouter");
		expect(opts.endpoint).toBe("chat/completions");
		delete process.env.OPENROUTER_API_KEY;
	});

	it("sends messages in payload (not in model wrapper) for GMI", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat(
			[
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "hello" },
			],
			{ model: "glm-5.1" }
		);

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.payload.messages).toEqual([
			{ role: "system", content: "You are helpful" },
			{ role: "user", content: "hello" },
		]);
		// GMI model name should NOT be in payload (it's the endpoint)
		expect(opts.payload.model).toBeUndefined();
	});

	it("extracts content from GMI queue outcome", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		const response = await adapter.chat([{ role: "user", content: "hello" }], {
			model: "glm-5.1",
		});

		expect(response.content).toBe("Hello from GMI!");
		expect(response.usage.total_tokens).toBe(15);
	});

	it("falls back to mock when GMI key is not set", async () => {
		delete process.env.GMI_API_KEY;
		const adapter = new LLMAdapter();
		await adapter.initialize();
		const response = await adapter.chat([{ role: "user", content: "hello" }], {
			model: "glm-5.1",
		});

		// Mock mode — callModelApi should NOT be called
		expect(mockCallModelApi).not.toHaveBeenCalled();
		expect(response.content).toBeTruthy();
	});
});
