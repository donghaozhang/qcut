import type {
	JianyingFilterImplementation,
	JianyingFilterLabFilterSummary,
} from "@/types/electron";

export const JIANYING_FILTER_IMPLEMENTATION_LABELS: Record<
	JianyingFilterImplementation,
	string
> = {
	"single-lut": "单 LUT",
	"dual-lut": "双 LUT",
	shader: "Shader",
	"face-ai": "人脸 AI",
	unknown: "待识别",
};

export const VERIFICATION_LABELS = {
	unverified: "未验证",
	close: "接近",
	verified: "已验证",
} as const;

/**
 * Tooltip text for a verification badge. Only measured metrics appear, so an
 * unmeasured card reads as its bare status rather than implying a comparison
 * that never ran.
 */
export function verificationDetails({
	filter,
}: {
	filter: JianyingFilterLabFilterSummary;
}) {
	const { verification } = filter;
	const metrics = [
		verification.rgbRmse === undefined
			? undefined
			: `RGB RMSE ${verification.rgbRmse}`,
		verification.psnr === undefined ? undefined : `PSNR ${verification.psnr}`,
		verification.ssim === undefined ? undefined : `SSIM ${verification.ssim}`,
		verification.deltaE === undefined
			? undefined
			: `DeltaE ${verification.deltaE}`,
		verification.maskEdgeMae === undefined
			? undefined
			: `Mask edge ${verification.maskEdgeMae}`,
		verification.temporalMotionDelta === undefined
			? undefined
			: `Temporal ${verification.temporalMotionDelta}`,
	].filter((value): value is string => Boolean(value));
	return metrics.length > 0
		? `${VERIFICATION_LABELS[verification.status]} · ${metrics.join(" · ")}`
		: VERIFICATION_LABELS[verification.status];
}

export function cacheLabel({
	filter,
}: {
	filter: JianyingFilterLabFilterSummary;
}) {
	if (filter.available) return "可用";
	if (filter.cacheStatus === "cached") return "已缓存";
	if (filter.cacheStatus === "partial") return "缓存不完整";
	return "未缓存";
}
