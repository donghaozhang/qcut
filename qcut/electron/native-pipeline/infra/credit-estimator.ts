/**
 * Credit cost estimator for proxy-mode API calls.
 *
 * Uses the cost-calculator (USD pricing from model registry) and converts
 * to credits at 1 credit ≈ $0.10.
 *
 * @module electron/native-pipeline/infra/credit-estimator
 */

import { estimateCost } from "./cost-calculator.js";

const USD_PER_CREDIT = 0.1;
const DEFAULT_CREDITS = 1;

/**
 * Estimate the credit cost for an AI model call.
 * Returns { amount, modelKey, description } ready for the proxy credits field.
 *
 * Falls back to a safe default (1 credit) if the model is not in the registry.
 */
export function estimateProxyCredits(
	modelKey: string,
	params?: Record<string, unknown>
): { amount: number; modelKey: string; description: string } {
	try {
		const cost = estimateCost(modelKey, params ?? {});
		const credits = Math.max(
			0.1,
			Math.round((cost.totalCost / USD_PER_CREDIT) * 10) / 10
		);

		return {
			amount: credits,
			modelKey,
			description: `${cost.model} generation`,
		};
	} catch {
		// Model not in registry — use safe default
		return {
			amount: DEFAULT_CREDITS,
			modelKey,
			description: `${modelKey} generation`,
		};
	}
}
