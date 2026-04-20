/**
 * Credit cost resolution for AI operations.
 *
 * Policy: **1 credit ≈ US$0.01.** Credits are computed at runtime from
 * each model's registry `price` string so the renderer has a single
 * source of truth — adding a new model to the registry automatically
 * prices it; no parallel map to keep in sync.
 *
 * Range handling: worst-case (upper bound) to prevent under-billing on
 * premium tiers (1080p, pro, audio). See `credit-costs-parser.ts` for
 * the `$0.05-0.08/s → 0.08` policy.
 *
 * Overrides: a small `COST_OVERRIDES` map handles providers whose keys
 * live outside the main AI model registry (ElevenLabs TTS, transcription,
 * utility LLMs). Registry-driven models should NOT appear here.
 */

import { AI_MODELS } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	CREDIT_USD_MULTIPLIER,
	creditsFromParsedPrice,
	parsePriceString,
	type CreditComputeParams,
	type ParsedPrice,
	type PriceUnit,
} from "./credit-costs-parser";

export interface CreditCost {
	/** Credits consumed per unit (rate). */
	credits: number;
	/** Human-readable label for display. */
	label: string;
	/** Unit for display (e.g. "per image", "per second", "per 5s video"). */
	unit: string;
}

/**
 * Overrides for modelKeys that don't live in the AI_MODELS registry
 * (TTS, transcription, internal utility prompts). Values are credits
 * per unit, already at the 1-credit-≈-$0.01 scale.
 */
const COST_OVERRIDES: Record<
	string,
	{ unit: PriceUnit; amountPerUnitCredits: number; label: string }
> = {
	"elevenlabs-tts": {
		unit: "per-1k-chars",
		amountPerUnitCredits: 0.1, // $0.001/char → 0.1 credits per 1k chars
		label: "ElevenLabs TTS",
	},
	"elevenlabs-scribe": {
		// Per-minute; we approximate via a fixed price the caller bakes into
		// `characterCount` won't work, so expose it via per-second math:
		// $0.001/min → we keep this as a registry gap follow-up.
		unit: "fixed",
		amountPerUnitCredits: 10, // 10 credits per transcription job (placeholder)
		label: "ElevenLabs Scribe",
	},
	"openrouter-prompt": {
		unit: "fixed",
		amountPerUnitCredits: 10,
		label: "Prompt Generation",
	},
	"gemini-describe": {
		unit: "fixed",
		amountPerUnitCredits: 10,
		label: "Gemini Describe",
	},
	"gmi-glm-5.1": {
		unit: "fixed",
		amountPerUnitCredits: 10,
		label: "GLM 5.1",
	},
	"gmi-gemini-3.1-pro": {
		unit: "fixed",
		amountPerUnitCredits: 20,
		label: "Gemini 3.1 Pro",
	},
	"gmi-gpt-5.4": {
		unit: "fixed",
		amountPerUnitCredits: 30,
		label: "GPT-5.4",
	},
};

function unitLabel(unit: PriceUnit): string {
	switch (unit) {
		case "per-second":
			return "per second";
		case "per-1k-chars":
			return "per 1k characters";
		case "per-megapixel":
			return "per megapixel";
		case "fixed":
			return "per operation";
	}
}

function lookupRegistryPrice(modelKey: string): ParsedPrice | null {
	const entry = AI_MODELS.find((m) => m.id === modelKey);
	if (!entry) return null;
	return parsePriceString(entry.price);
}

/**
 * Estimate credit cost for an AI operation.
 *
 * Resolution order:
 *   1. `COST_OVERRIDES[modelKey]` — TTS/transcription/utility LLMs.
 *   2. `AI_MODELS[modelKey].price` parsed and scaled by
 *      {@link CREDIT_USD_MULTIPLIER}.
 *   3. Fallback: `1` credit when the model is unknown or its price is
 *      "TBD"/unparseable. Safe default — tests and unknown models still
 *      go through rather than throwing.
 */
export function estimateCreditCost(
	modelKey: string,
	params?: CreditComputeParams
): number {
	const override = COST_OVERRIDES[modelKey];
	if (override) {
		return computeFromOverride(override, params);
	}
	const parsed = lookupRegistryPrice(modelKey);
	if (!parsed) return 1;
	const credits = creditsFromParsedPrice(parsed, params);
	if (credits == null) return 1;
	return credits;
}

function computeFromOverride(
	override: (typeof COST_OVERRIDES)[string],
	params?: CreditComputeParams
): number {
	const { unit, amountPerUnitCredits } = override;
	switch (unit) {
		case "fixed":
			return Math.max(1, Math.round(amountPerUnitCredits));
		case "per-second":
			if (!params?.durationSeconds) return 1;
			return Math.max(
				1,
				Math.round(amountPerUnitCredits * params.durationSeconds)
			);
		case "per-1k-chars":
			if (!params?.characterCount) return 1;
			return Math.max(
				1,
				Math.round((amountPerUnitCredits * params.characterCount) / 1000)
			);
		case "per-megapixel":
			if (!params?.megapixels) return 1;
			return Math.max(
				1,
				Math.round(amountPerUnitCredits * params.megapixels)
			);
	}
}

/**
 * Return a displayable cost entry for a model. Used by UI surfaces that
 * want to show "~N credits per video" tooltips before the user hits
 * Generate.
 */
export function getCreditCostInfo(modelKey: string): CreditCost | null {
	const override = COST_OVERRIDES[modelKey];
	if (override) {
		return {
			credits: override.amountPerUnitCredits,
			label: override.label,
			unit: unitLabel(override.unit),
		};
	}
	const entry = AI_MODELS.find((m) => m.id === modelKey);
	if (!entry) return null;
	const parsed = parsePriceString(entry.price);
	if (!parsed) return null;
	return {
		credits: parsed.amountUsd * CREDIT_USD_MULTIPLIER,
		label: entry.name,
		unit: unitLabel(parsed.unit),
	};
}

export { CREDIT_USD_MULTIPLIER } from "./credit-costs-parser";
