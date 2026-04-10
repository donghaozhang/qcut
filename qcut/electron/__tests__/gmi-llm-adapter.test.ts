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

// Capture callModelApi calls — sync OpenAI-compatible response
const mockCallModelApi = vi.fn().mockResolvedValue({
	success: true,
	data: {
		choices: [{ message: { content: "Hello from GMI!" } }],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
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

	it("resolves glm-5.1 alias to gmi/zai-org/GLM-5.1-FP8", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "glm-5.1",
		});

		expect(mockCallModelApi).toHaveBeenCalledTimes(1);
		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("gmi-llm");
		expect(opts.endpoint).toBe("chat/completions");
		expect(opts.payload.model).toBe("zai-org/GLM-5.1-FP8");
	});

	it("resolves gemini-3.1-pro to gmi/google/gemini-3.1-pro-preview", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "gemini-3.1-pro",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("gmi-llm");
		expect(opts.payload.model).toBe("google/gemini-3.1-pro-preview");
	});

	it("resolves gpt-5.4 to gmi/openai/gpt-5.4", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "gpt-5.4",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.provider).toBe("gmi-llm");
		expect(opts.payload.model).toBe("openai/gpt-5.4");
	});

	it("uses max_completion_tokens for GPT-5.x models", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "gpt-5.4",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.payload.max_completion_tokens).toBeDefined();
		expect(opts.payload.max_tokens).toBeUndefined();
	});

	it("uses max_tokens for non-GPT-5.x GMI models", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "glm-5.1",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.payload.max_tokens).toBeDefined();
		expect(opts.payload.max_completion_tokens).toBeUndefined();
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

	it("uses sync mode (async: false) for GMI LLM", async () => {
		const adapter = new LLMAdapter();
		await adapter.initialize();
		await adapter.chat([{ role: "user", content: "hi" }], {
			model: "glm-5.1",
		});

		const opts = mockCallModelApi.mock.calls[0][0];
		expect(opts.async).toBe(false);
	});

	it("extracts content from sync response", async () => {
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

		expect(mockCallModelApi).not.toHaveBeenCalled();
		expect(response.content).toBeTruthy();
	});
});
