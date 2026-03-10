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
 * Call an LLM via the moyin IPC handler.
 *
 * @param _feature - Feature name (e.g. 'script_analysis'). Reserved for future routing.
 * @param systemPrompt - System prompt
 * @param userPrompt - User prompt
 * @param options - Temperature, maxTokens
 * @returns LLM response text
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
