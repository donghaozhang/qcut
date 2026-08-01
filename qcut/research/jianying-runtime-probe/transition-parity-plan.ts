import { readFileSync } from "node:fs";
import path from "node:path";

export const PARITY_PROGRESS_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

export interface VideoSize {
	width: number;
	height: number;
}

export interface TransitionParityEntry {
	title: string;
	resourceId: string;
	metadataMd5: string;
	packagePath: string;
	referenceVideo: string;
	durationSeconds: number;
	packageFamily: string;
	formula: string;
	holdExactEndpoints: boolean;
}

export interface TransitionParityMatrix {
	inputA: string;
	inputB: string;
	frameRate: number;
	cutFrame: number;
	renderSize: VideoSize | null;
	entries: TransitionParityEntry[];
}

export interface TransitionFrameWindow {
	transitionFrames: number;
	startFrame: number;
	endFrameInclusive: number;
	endFrameExclusive: number;
	samples: Array<{ progress: number; frameIndex: number; key: string }>;
}

function requireObject({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requireString({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${label} must be a non-empty string`);
	}
	return value;
}

function optionalString({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}

function optionalBoolean({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): boolean {
	if (value === undefined) return false;
	if (typeof value === "boolean") return value;
	throw new Error(`${label} must be a boolean`);
}

function requirePositiveNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive number`);
	}
	return value;
}

function requireEvenVideoDimension({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value <= 0 ||
		value > 16_384 ||
		value % 2 !== 0
	) {
		throw new Error(`${label} must be an even integer between 2 and 16384`);
	}
	return value;
}

function optionalVideoSize({ value }: { value: unknown }): VideoSize | null {
	if (value === undefined) return null;
	const dimensions = requireObject({ value, label: "matrix.renderSize" });
	return {
		width: requireEvenVideoDimension({
			value: dimensions.width,
			label: "matrix.renderSize.width",
		}),
		height: requireEvenVideoDimension({
			value: dimensions.height,
			label: "matrix.renderSize.height",
		}),
	};
}

function resolveFromConfig({
	configDirectory,
	value,
	label,
}: {
	configDirectory: string;
	value: unknown;
	label: string;
}): string {
	return path.resolve(configDirectory, requireString({ value, label }));
}

function parseEntry({
	value,
	index,
	configDirectory,
}: {
	value: unknown;
	index: number;
	configDirectory: string;
}): TransitionParityEntry {
	const entry = requireObject({ value, label: `entries[${index}]` });
	const label = `entries[${index}]`;
	return {
		title: requireString({ value: entry.title, label: `${label}.title` }),
		resourceId: requireString({
			value: entry.resourceId,
			label: `${label}.resourceId`,
		}),
		metadataMd5: requireString({
			value: entry.metadataMd5,
			label: `${label}.metadataMd5`,
		}),
		packagePath: resolveFromConfig({
			configDirectory,
			value: entry.packagePath,
			label: `${label}.packagePath`,
		}),
		referenceVideo: resolveFromConfig({
			configDirectory,
			value: entry.referenceVideo,
			label: `${label}.referenceVideo`,
		}),
		durationSeconds: requirePositiveNumber({
			value: entry.durationSeconds,
			label: `${label}.durationSeconds`,
		}),
		packageFamily: optionalString({ value: entry.packageFamily }),
		formula: optionalString({ value: entry.formula }),
		holdExactEndpoints: optionalBoolean({
			value: entry.holdExactEndpoints,
			label: `${label}.holdExactEndpoints`,
		}),
	};
}

export function engineProgressForTransitionFrame({
	frameIndex,
	transitionFrames,
}: {
	frameIndex: number;
	transitionFrames: number;
}): number {
	if (!Number.isInteger(transitionFrames) || transitionFrames < 2) {
		throw new Error("transitionFrames must be an integer of at least two");
	}
	if (
		!Number.isInteger(frameIndex) ||
		frameIndex < 0 ||
		frameIndex >= transitionFrames
	) {
		throw new Error("frameIndex must belong to the transition window");
	}
	return frameIndex / (2 * Math.floor(transitionFrames / 2));
}

export function readTransitionParityMatrix({
	matrixPath,
}: {
	matrixPath: string;
}): TransitionParityMatrix {
	const resolvedPath = path.resolve(matrixPath);
	const configDirectory = path.dirname(resolvedPath);
	const parsed: unknown = JSON.parse(readFileSync(resolvedPath, "utf8"));
	const matrix = requireObject({ value: parsed, label: "matrix" });
	if (!Array.isArray(matrix.entries) || matrix.entries.length === 0) {
		throw new Error("matrix.entries must contain at least one transition");
	}
	const frameRate = requirePositiveNumber({
		value: matrix.frameRate,
		label: "matrix.frameRate",
	});
	if (frameRate > 240) throw new Error("matrix.frameRate must not exceed 240");
	if (
		typeof matrix.cutFrame !== "number" ||
		!Number.isInteger(matrix.cutFrame) ||
		matrix.cutFrame < 0
	) {
		throw new Error("matrix.cutFrame must be a non-negative integer");
	}
	const entries = matrix.entries.map((value, index) =>
		parseEntry({ value, index, configDirectory })
	);
	const identities = new Set<string>();
	for (const entry of entries) {
		const identity = `${entry.resourceId}:${entry.metadataMd5}`;
		if (identities.has(identity)) {
			throw new Error(`Duplicate transition identity: ${identity}`);
		}
		identities.add(identity);
	}
	return {
		inputA: resolveFromConfig({
			configDirectory,
			value: matrix.inputA,
			label: "matrix.inputA",
		}),
		inputB: resolveFromConfig({
			configDirectory,
			value: matrix.inputB,
			label: "matrix.inputB",
		}),
		frameRate,
		cutFrame: matrix.cutFrame,
		renderSize: optionalVideoSize({ value: matrix.renderSize }),
		entries,
	};
}

function progressKey({ progress }: { progress: number }): string {
	return `p${String(Math.round(progress * 100)).padStart(3, "0")}`;
}

export function buildTransitionFrameWindow({
	frameRate,
	durationSeconds,
	cutFrame,
}: {
	frameRate: number;
	durationSeconds: number;
	cutFrame: number;
}): TransitionFrameWindow {
	const transitionFrames = Math.round(frameRate * durationSeconds);
	if (transitionFrames < 2) {
		throw new Error("A parity transition must contain at least two frames");
	}
	const startFrame = cutFrame - Math.floor(transitionFrames / 2);
	if (startFrame < 0) {
		throw new Error("The centered transition begins before frame zero");
	}
	return {
		transitionFrames,
		startFrame,
		endFrameInclusive: startFrame + transitionFrames - 1,
		endFrameExclusive: startFrame + transitionFrames,
		samples: PARITY_PROGRESS_STOPS.map((progress) => ({
			progress,
			frameIndex: startFrame + Math.round(progress * (transitionFrames - 1)),
			key: progressKey({ progress }),
		})),
	};
}

export function classifyParityResult({
	fiveStopWorstRmse,
	fullIntervalRmse,
	highConfidenceRmse,
}: {
	fiveStopWorstRmse: number;
	fullIntervalRmse: number;
	highConfidenceRmse: number;
}): "pass" | "near" | "fail" {
	const worstRmse = Math.max(fiveStopWorstRmse, fullIntervalRmse);
	if (worstRmse <= highConfidenceRmse) return "pass";
	if (worstRmse <= highConfidenceRmse * 2) return "near";
	return "fail";
}
