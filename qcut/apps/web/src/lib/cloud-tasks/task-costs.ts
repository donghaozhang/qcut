import type { AIPipelineGenerateOptions } from "@/types/electron";

function numericArg({
	args,
	key,
	fallback,
}: {
	args: AIPipelineGenerateOptions["args"];
	key: string;
	fallback: number;
}): number {
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function estimatePipelineTaskCostUsd({
	options,
}: {
	options: AIPipelineGenerateOptions;
}): number {
	const duration = Math.max(
		1,
		numericArg({ args: options.args, key: "duration", fallback: 5 })
	);
	const resolution = String(options.args.resolution ?? "720p");
	const resolutionMultiplier =
		resolution === "1080p" ? 1.6 : resolution === "4k" ? 3 : 1;
	if (options.command === "generate-speech") {
		const text = String(options.args.text ?? "");
		return Math.max(0.005, text.length * 0.00003);
	}
	if (options.command === "generate-avatar") {
		return duration * 0.09 * resolutionMultiplier;
	}
	if (options.command === "create-video") {
		return duration * 0.08 * resolutionMultiplier;
	}
	if (options.command === "generate-image") return 0.04 * resolutionMultiplier;
	return 0.02;
}

export function estimateSam3TaskCostUsd({
	duration,
}: {
	duration: number;
}): number {
	return Math.max(0.02, (Math.max(1, duration) / 60) * 0.12);
}

export function estimateAlignedAvatarCostUsd({
	text,
	duration,
}: {
	text: string;
	duration: number;
}): number {
	const speech = Math.max(0.005, text.length * 0.00003);
	return speech + Math.max(1, duration) * 0.09;
}
