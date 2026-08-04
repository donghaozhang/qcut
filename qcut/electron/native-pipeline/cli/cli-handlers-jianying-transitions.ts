import path from "node:path";
import {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	resolveJianyingTransition,
} from "../../jianying-transition-catalog.js";
import { renderJianyingTransition } from "../../jianying-transition/render.js";
import { inspectJianyingTransitionRuntime } from "../../jianying-transition/runtime-discovery.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

export function handleTransitionList(): CLIResult {
	return {
		success: true,
		data: {
			backend: "jianying-local",
			groups: JIANYING_TRANSITION_GROUPS,
			transitions: JIANYING_TRANSITIONS,
		},
	};
}

export async function handleTransitionDoctor(): Promise<CLIResult> {
	const inspection = await inspectJianyingTransitionRuntime();
	return {
		success: inspection.status.state === "ready",
		data: inspection.status,
		...(inspection.status.state === "ready"
			? {}
			: { error: inspection.status.message }),
	};
}

function parseOptionalPositiveNumber({
	value,
	label,
}: {
	value: number | string | undefined;
	label: string;
}): number | undefined {
	if (value === undefined) return undefined;
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number.`);
	}
	return parsed;
}

function requireOption({
	value,
	flag,
}: {
	value: string | undefined;
	flag: string;
}): string {
	const trimmed = value?.trim();
	if (!trimmed) throw new Error(`${flag} is required.`);
	return trimmed;
}

export async function handleTransitionRender(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const presetValue = requireOption({
		value: options.preset,
		flag: "--preset",
	});
	const transition = resolveJianyingTransition({ value: presetValue });
	if (!transition) {
		throw new Error(`Unknown Transition Lab preset: ${presetValue}`);
	}
	const inputA = path.resolve(
		requireOption({ value: options.inputA, flag: "--input-a" })
	);
	const inputB = path.resolve(
		requireOption({ value: options.inputB, flag: "--input-b" })
	);
	const outputPath = path.resolve(
		options.output ??
			path.join(
				options.outputDir,
				`${path.parse(inputA).name}-${transition.id}.mp4`
			)
	);
	const result = await renderJianyingTransition({
		request: {
			presetId: transition.id,
			inputA,
			inputB,
			outputPath,
			duration: parseOptionalPositiveNumber({
				value: options.duration,
				label: "--duration",
			}),
			fps: parseOptionalPositiveNumber({ value: options.fps, label: "--fps" }),
			width: parseOptionalPositiveNumber({
				value: options.width,
				label: "--width",
			}),
			height: parseOptionalPositiveNumber({
				value: options.height,
				label: "--height",
			}),
			overwrite: options.force,
		},
		onProgress: (progress) => onProgress(progress),
	});
	return {
		success: true,
		outputPath: result.outputPath,
		duration: result.duration,
		data: result,
	};
}
