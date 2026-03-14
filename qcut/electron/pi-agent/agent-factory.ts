/**
 * Agent factory — creates Pi Agent instances with the right provider,
 * tools, and context compression.
 *
 * @module electron/pi-agent/agent-factory
 */

import { Agent, type AgentOptions } from "@mariozechner/pi-agent-core";
import { getModel, registerBuiltInApiProviders, type KnownProvider } from "@mariozechner/pi-ai";
import { PI_AGENT_SYSTEM_PROMPT } from "./system-prompt.js";
import { createPiAgentTools } from "./tool-registry.js";
import { compressEditingContext } from "./context-compression.js";

let builtinsRegistered = false;

/** Provider + model configuration. */
export interface PiAgentSettings {
	provider: string; // "anthropic" | "openai" | "google" etc.
	model: string; // Model ID within provider
	apiKey?: string; // Optional — resolved from env/storage if absent
}

/** Available provider/model pairs. */
export const AVAILABLE_MODELS: { provider: string; models: string[] }[] = [
	{
		provider: "anthropic",
		models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
	},
	{
		provider: "openai",
		models: ["gpt-4o", "gpt-4o-mini"],
	},
	{
		provider: "google",
		models: ["gemini-2.5-pro", "gemini-2.5-flash"],
	},
	{
		provider: "openrouter",
		models: ["minimax/minimax-2.5", "moonshot/kimi-2.5", "google/gemini-3-flash"],
	},
];

/**
 * Create a new Pi Agent instance.
 */
export function createPiAgent(
	settings: PiAgentSettings,
	apiKey?: string
): Agent {
	if (!builtinsRegistered) {
		registerBuiltInApiProviders();
		builtinsRegistered = true;
	}

	const model = getModel(
		settings.provider as KnownProvider,
		settings.model as any
	);

	const tools = createPiAgentTools();

	const opts: AgentOptions = {
		initialState: {
			systemPrompt: PI_AGENT_SYSTEM_PROMPT,
			model,
			tools,
			thinkingLevel: "off",
		},
		transformContext: compressEditingContext,
		getApiKey: apiKey
			? () => apiKey
			: (provider: string) => resolveApiKey(provider),
	};

	return new Agent(opts);
}

/**
 * Resolve API key from environment variables.
 */
function resolveApiKey(provider: string): string | undefined {
	const keyMap: Record<string, string[]> = {
		anthropic: ["ANTHROPIC_API_KEY"],
		openai: ["OPENAI_API_KEY"],
		google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
		openrouter: ["OPENROUTER_API_KEY"],
	};

	const envVars = keyMap[provider] ?? [];
	for (const envVar of envVars) {
		const val = process.env[envVar];
		if (val) return val;
	}
	return undefined;
}
