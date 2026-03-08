/**
 * LLM Adapter for ViMax agents.
 *
 * Uses OpenRouter API for unified access to multiple LLM providers.
 * Falls back to mock responses when API key is not configured.
 *
 * Ported from: vimax/adapters/llm_adapter.py
 */

import {
	BaseAdapter,
	type AdapterConfig,
	createAdapterConfig,
} from "./base-adapter.js";
import { callModelApi, type ApiCallResult } from "../../infra/api-caller.js";

export interface LLMAdapterConfig extends AdapterConfig {
	temperature: number;
	max_tokens: number;
	use_native_structured_output: boolean;
}

export function createLLMAdapterConfig(
	partial?: Partial<LLMAdapterConfig>
): LLMAdapterConfig {
	return {
		...createAdapterConfig({
			provider: "openrouter",
			model: "google/gemini-3-flash-preview",
		}),
		temperature: 0.7,
		max_tokens: 8192,
		use_native_structured_output: true,
		...partial,
	};
}

export interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface LLMResponse {
	content: string;
	model: string;
	usage: Record<string, number>;
	cost: number;
}

/** Common model aliases resolved to OpenRouter model IDs. */
const MODEL_ALIASES: Record<string, string> = {
	"gemini-3-flash": "google/gemini-3-flash-preview",
	"gemini-2.5-flash": "google/gemini-2.5-flash",
	"kimi-k2.5": "moonshotai/kimi-k2.5",
	kimi: "moonshotai/kimi-k2.5",
	"claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
	"claude-3-opus": "anthropic/claude-3-opus",
	"gpt-4": "openai/gpt-4-turbo",
	"gpt-4o": "openai/gpt-4o",
	"gemini-pro": "google/gemini-pro",
};

/** Approximate costs per 1K tokens (input, output). */
const COST_TABLE: Record<string, [number, number]> = {
	"google/gemini-3-flash-preview": [0.000_1, 0.000_4],
	"google/gemini-2.5-flash": [0.000_15, 0.000_6],
	"moonshotai/kimi-k2.5": [0.0005, 0.0028],
	"anthropic/claude-3.5-sonnet": [0.003, 0.015],
	"anthropic/claude-3-opus": [0.015, 0.075],
	"openai/gpt-4-turbo": [0.01, 0.03],
	"openai/gpt-4o": [0.005, 0.015],
	"google/gemini-pro": [0.000_25, 0.0005],
};

export class LLMAdapter extends BaseAdapter<Message[], LLMResponse> {
	declare config: LLMAdapterConfig;
	private _hasApiKey = false;

	constructor(config?: Partial<LLMAdapterConfig>) {
		super(createLLMAdapterConfig(config));
	}

	async initialize(): Promise<boolean> {
		const apiKey = process.env.OPENROUTER_API_KEY ?? "";
		this._hasApiKey = apiKey.length > 0;
		if (!this._hasApiKey) {
			console.warn("[vimax.llm] OPENROUTER_API_KEY not set — using mock mode");
		}
		return true;
	}

	async execute(messages: Message[]): Promise<LLMResponse> {
		return this.chat(messages);
	}

	/**
	 * Send chat messages to LLM.
	 *
	 * Falls back to mock responses when API key is not configured.
	 */
	async chat(
		messages: Message[],
		options?: {
			model?: string;
			temperature?: number;
			max_tokens?: number;
			extra_body?: Record<string, unknown>;
		}
	): Promise<LLMResponse> {
		await this.ensureInitialized();

		const model = this._resolveModel(options?.model ?? this.config.model);
		const temperature = options?.temperature ?? this.config.temperature;
		const max_tokens = options?.max_tokens ?? this.config.max_tokens;

		if (!this._hasApiKey) {
			return this._mockChat(messages, model);
		}

		const payload: Record<string, unknown> = {
			model,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			temperature,
			max_tokens,
		};

		// Merge extra_body (e.g. response_format for structured output)
		if (options?.extra_body) {
			Object.assign(payload, options.extra_body);
		}

		const result: ApiCallResult = await callModelApi({
			endpoint: "chat/completions",
			payload,
			provider: "openrouter",
			async: false,
			timeoutMs: this.config.timeout * 1000,
		});

		if (!result.success || !result.data) {
			throw new Error(`LLM call failed: ${result.error ?? "unknown error"}`);
		}

		const data = result.data as Record<string, unknown>;
		const choices = data.choices as Array<Record<string, unknown>>;
		const firstChoice = choices?.[0];
		const message = firstChoice?.message as Record<string, unknown>;
		const content = (message?.content as string) ?? "";

		const usage = data.usage as Record<string, number> | undefined;
		const usageObj: Record<string, number> = {
			prompt_tokens: usage?.prompt_tokens ?? 0,
			completion_tokens: usage?.completion_tokens ?? 0,
			total_tokens: usage?.total_tokens ?? 0,
		};

		return {
			content,
			model,
			usage: usageObj,
			cost: this._estimateCost(model, usageObj),
		};
	}

	/**
	 * Chat with structured JSON output.
	 *
	 * Uses OpenRouter's response_format API for guaranteed valid JSON,
	 * then parses the response against the provided schema validator.
	 */
	async chatWithStructuredOutput<T>(
		messages: Message[],
		schemaName: string,
		jsonSchema: Record<string, unknown>,
		validator: (data: unknown) => T,
		options?: { temperature?: number }
	): Promise<T> {
		const extra_body: Record<string, unknown> = this.config
			.use_native_structured_output
			? {
					response_format: {
						type: "json_schema",
						json_schema: {
							name: schemaName,
							strict: true,
							schema: jsonSchema,
						},
					},
					provider: { require_parameters: true },
				}
			: {};

		// If not using native, inject schema into system prompt
		const messagesToSend = [...messages];
		if (!this.config.use_native_structured_output) {
			const schemaInstruction = `\nYou must respond with valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}\n\nRespond ONLY with the JSON, no other text.\n`;
			if (messagesToSend.length > 0 && messagesToSend[0].role === "system") {
				messagesToSend[0] = {
					role: "system",
					content: messagesToSend[0].content + "\n\n" + schemaInstruction,
				};
			} else {
				messagesToSend.unshift({ role: "system", content: schemaInstruction });
			}
		}

		const response = await this.chat(messagesToSend, {
			temperature: options?.temperature,
			extra_body,
		});

		return this._parseJsonResponse(response.content, validator);
	}

	/** Simple text generation. */
	async generateText(prompt: string, systemPrompt?: string): Promise<string> {
		const messages: Message[] = [];
		if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
		messages.push({ role: "user", content: prompt });
		const response = await this.chat(messages);
		return response.content;
	}

	// -- Private helpers --

	private _resolveModel(model: string): string {
		return MODEL_ALIASES[model] ?? model;
	}

	private _estimateCost(model: string, usage: Record<string, number>): number {
		const costs = COST_TABLE[model];
		if (!costs) return 0;
		const [inputCost, outputCost] = costs;
		const prompt = usage.prompt_tokens ?? 0;
		const completion = usage.completion_tokens ?? 0;
		return (prompt * inputCost + completion * outputCost) / 1000;
	}

	private _mockChat(messages: Message[], model: string): LLMResponse {
		const userMessages = messages.filter((m) => m.role === "user");
		const lastMessage = userMessages[userMessages.length - 1]?.content ?? "";

		let mockContent: string;

		if (
			lastMessage.toLowerCase().includes("screenplay") ||
			lastMessage.includes('"scenes"')
		) {
			mockContent = JSON.stringify({
				title: "Mock Screenplay",
				logline: "A mock screenplay for testing purposes.",
				scenes: [
					{
						scene_id: "scene_001",
						title: "Opening Scene",
						location: "Mountain summit at dawn",
						time: "Dawn",
						shots: [
							{
								shot_id: "shot_001",
								shot_type: "wide",
								description: "Panoramic view of misty mountains",
								camera_movement: "pan",
								duration_seconds: 5,
								image_prompt:
									"Panoramic view of misty mountains at dawn, golden light, cinematic",
								video_prompt:
									"Camera slowly pans across mountain range, mist rising",
							},
							{
								shot_id: "shot_002",
								shot_type: "medium",
								description: "Silhouette figure against sunrise",
								camera_movement: "static",
								duration_seconds: 4,
								image_prompt:
									"Silhouette of person against golden sunrise, mountains background",
								video_prompt: "Figure stands still, wind moves their clothing",
							},
						],
					},
				],
			});
		} else if (
			lastMessage.toLowerCase().includes("character") &&
			(lastMessage.toLowerCase().includes("extract") ||
				lastMessage.toLowerCase().includes("find"))
		) {
			mockContent = JSON.stringify({
				characters: [
					{
						name: "John",
						description: "A brave adventurer with kind eyes",
						role: "protagonist",
						appearance: "tall, dark hair, leather jacket",
					},
					{
						name: "Mary",
						description: "A wise guide with ancient knowledge",
						role: "supporting",
						appearance: "silver hair, long robes, gentle smile",
					},
				],
			});
		} else {
			mockContent = `Mock LLM response for: ${lastMessage.slice(0, 100)}...`;
		}

		return {
			content: mockContent,
			model,
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
			cost: 0,
		};
	}

	/**
	 * Parse JSON from LLM response, handling common quirks:
	 * 1. Direct parse
	 * 2. Markdown code fence extraction
	 * 3. Outermost braces extraction with trailing comma fix
	 */
	private _parseJsonResponse<T>(
		content: string,
		validator: (data: unknown) => T
	): T {
		const trimmed = content.trim();

		const tryParse = (jsonStr: string): T | null => {
			const fixed = jsonStr.replace(/,\s*([}\]])/g, "$1");
			try {
				const data = JSON.parse(fixed);
				return validator(data);
			} catch {
				return null;
			}
		};

		// Step 1: Direct parse
		const direct = tryParse(trimmed);
		if (direct !== null) return direct;

		// Step 2: Markdown code fence
		const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (fenceMatch) {
			const fenced = tryParse(fenceMatch[1]);
			if (fenced !== null) return fenced;
		}

		// Step 3: Outermost braces
		const braceMatch = trimmed.match(/\{[\s\S]*\}/);
		if (braceMatch) {
			const braced = tryParse(braceMatch[0]);
			if (braced !== null) return braced;
		}

		throw new Error(
			`LLM response was not valid JSON: ${trimmed.slice(0, 200)}`
		);
	}
}

/**
 * Convenience function for quick LLM chat without creating an adapter.
 * Creates a temporary adapter and sends a chat request.
 */
export async function chat(
	messages: Message[],
	options?: {
		model?: string;
		temperature?: number;
		max_tokens?: number;
	}
): Promise<LLMResponse> {
	const adapter = new LLMAdapter({ model: options?.model });
	return adapter.chat(messages, options);
}

/**
 * Convenience function for quick text generation without creating an adapter.
 * Creates a temporary adapter and generates text from a prompt.
 */
export async function generate(
	prompt: string,
	options?: {
		model?: string;
		systemPrompt?: string;
	}
): Promise<string> {
	const adapter = new LLMAdapter({ model: options?.model });
	return adapter.generateText(prompt, options?.systemPrompt);
}
