import { getFalApiKeyAsync } from "@/lib/ai-video/core/fal-request";
import { estimateCreditCost } from "@/lib/credit-costs";
import { useLicenseStore } from "@/stores/license-store";

const MODEL_TO_COST_KEY: Record<string, string> = {
	ltxv2_fast_t2v: "ltxv2-fast-1080p",
	ltx23_pro_t2v: "ltx23-pro-1080p",
	ltx23_fast_t2v: "ltx23-fast-1080p",
	ltx23_fast_i2v: "ltx23-fast-1080p",
	kling_v26_pro_t2v: "kling-v2.6-pro",
	wan_26_t2v: "wan-v2.6-1080p",
	veo31_text_to_video: "veo-3",
	veo31_fast_text_to_video: "veo-3-fast",
	kling_v2_1_i2v: "kling-v2.1-i2v",
	kling_avatar_v2_standard: "kling-avatar-v2-std",
	kling_avatar_v2_pro: "kling-avatar-v2-pro",
	sync_lipsync_react1: "omnihuman-v1.5",
	bytedance_video_upscaler: "bytedance-upscaler",
	flashvsr_video_upscaler: "flashvsr",
};

interface CreditGuardInput {
	modelId: string;
	durationSeconds?: number;
	description: string;
}

interface CreditGuardResult {
	allowed: boolean;
	requiredCredits: number;
	reason?: string;
}

function resolveModelKey({ modelId }: { modelId: string }): string {
	return MODEL_TO_COST_KEY[modelId] ?? modelId;
}

function normalizeRequiredCredits({ credits }: { credits: number }): number {
	if (!Number.isFinite(credits) || credits <= 0) {
		return 1;
	}
	return Number(credits.toFixed(1));
}

/**
 * Enforces credit deduction for non-BYOK generation.
 * BYOK users are allowed through without deduction.
 */
export async function enforceCreditRequirement({
	modelId,
	durationSeconds,
	description,
}: CreditGuardInput): Promise<CreditGuardResult> {
	try {
		if (typeof window === "undefined") {
			return { allowed: true, requiredCredits: 0 };
		}

		const licenseApi = window.electronAPI?.license;
		if (!licenseApi) {
			return { allowed: true, requiredCredits: 0 };
		}

		const falApiKey = await getFalApiKeyAsync();
		if (typeof falApiKey === "string" && falApiKey.length > 0) {
			return { allowed: true, requiredCredits: 0 };
		}

		const modelKey = resolveModelKey({ modelId });
		const estimatedCredits = normalizeRequiredCredits({
			credits: estimateCreditCost(modelKey, { durationSeconds }),
		});
		const store = useLicenseStore.getState();
		if (!store.license) {
			await store.checkLicense();
		}

		const refreshedStore = useLicenseStore.getState();
		if (!refreshedStore.hasCredits(estimatedCredits)) {
			return {
				allowed: false,
				requiredCredits: estimatedCredits,
				reason: `Not enough credits. This operation requires ${estimatedCredits} credits.`,
			};
		}

		const deducted = await refreshedStore.deductCredits(
			estimatedCredits,
			modelKey,
			description
		);
		if (!deducted) {
			return {
				allowed: false,
				requiredCredits: estimatedCredits,
				reason: "Unable to deduct credits for this operation.",
			};
		}

		return { allowed: true, requiredCredits: estimatedCredits };
	} catch (error) {
		return {
			allowed: false,
			requiredCredits: 0,
			reason:
				error instanceof Error ? error.message : "Credit validation failed.",
		};
	}
}
