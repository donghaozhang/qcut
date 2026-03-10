/**
 * LLM Adapter for moyin script modules.
 *
 * Provides a unified `callFeatureAPI` function that routes LLM calls
 * through QCut's moyin IPC handler (`moyin:call-llm`).
 *
 * This replaces moyin-creator's `@/lib/ai/feature-router` import.
 */

import { platform } from "@qcut/platform-core";

export interface LLMCallOptions {
	temperature?: number;
	maxTokens?: number;
}

/**
 * Send prompts to the configured Moyin LLM and return the generated text.
 *
 * @param _feature - Feature identifier (e.g., 'script_analysis'); reserved for future routing and currently unused
 * @param systemPrompt - System-level instruction that frames the model's behavior
 * @param userPrompt - User-facing prompt to be completed or answered by the model
 * @param options - Optional LLM call parameters: `temperature` to control randomness and `maxTokens` to limit output length
 * @returns The response text returned by the LLM
 * @throws If no Moyin LLM API is available (prompts cannot be sent)
 * @throws If the LLM call fails or returns no text
 */
export async function callFeatureAPI(
	_feature: string,
	systemPrompt: string,
	userPrompt: string,
	options?: LLMCallOptions
): Promise<string> {
	const api = platform().moyin;
	if (!api?.callLLM) {
		throw new Error(
			"LLM not available. Please configure an API key in Settings."
		);
	}

	const result = await api.callLLM({
		systemPrompt,
		userPrompt,
		temperature: options?.temperature,
		maxTokens: options?.maxTokens,
	});

	if (!result.success || !result.text) {
		throw new Error(result.error || "LLM call failed");
	}

	return result.text;
}
