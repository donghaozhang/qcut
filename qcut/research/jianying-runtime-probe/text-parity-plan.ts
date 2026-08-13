import { readFileSync } from "node:fs";
import path from "node:path";

import type { JianyingTextRuntimePackageKind } from "../../electron/jianying-text-runtime-contract";

export const TEXT_PARITY_PROGRESS_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const PACKAGE_HASH_PATTERN = /^[a-fA-F0-9]{32}$/;
const HEX_COLOR_PATTERN = /^#[a-fA-F0-9]{6}$/;
const PACKAGE_KINDS = new Set<JianyingTextRuntimePackageKind>([
	"InfoSticker",
	"ScriptInfoSticker",
	"TextStyle",
]);

export interface TextParityCanvas {
	width: number;
	height: number;
	backgroundColor: string;
}

export interface TextParityTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
}

export type TextParityReferenceOrigin =
	| "jianying-app-export"
	| "qcut-private-runtime-control";

export interface TextParityEntry {
	title: string;
	resourceId: string;
	packageHash: string;
	packageKind: JianyingTextRuntimePackageKind;
	referenceVideo: string;
	referenceOrigin: TextParityReferenceOrigin;
	referenceAppVersion?: string;
	content: string;
	fontAssetId?: string;
	fontSize: number;
	templateDuration: number;
	sourceStartSeconds: number;
	elementDurationSeconds: number;
	captureDurationSeconds: number;
	transform: TextParityTransform;
}

function requireReferenceOrigin({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): TextParityReferenceOrigin {
	if (
		value !== "jianying-app-export" &&
		value !== "qcut-private-runtime-control"
	) {
		throw new Error(
			`${label} must be jianying-app-export or qcut-private-runtime-control`
		);
	}
	return value;
}

export interface TextParityMatrix {
	frameRate: number;
	canvas: TextParityCanvas;
	entries: TextParityEntry[];
}

export interface TextParityFrameWindow {
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
	maximumLength = 4096,
}: {
	value: unknown;
	label: string;
	maximumLength?: number;
}): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maximumLength ||
		value.includes("\0")
	) {
		throw new Error(`${label} must be a bounded non-empty string`);
	}
	return value;
}

function optionalString({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string | undefined {
	if (value === undefined) return undefined;
	return requireString({ value, label, maximumLength: 256 });
}

function requireFiniteNumber({
	value,
	label,
	minimum,
	maximum,
}: {
	value: unknown;
	label: string;
	minimum: number;
	maximum: number;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < minimum ||
		value > maximum
	) {
		throw new Error(`${label} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

function requireEvenDimension({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	const dimension = requireFiniteNumber({
		value,
		label,
		minimum: 2,
		maximum: 16_384,
	});
	if (!Number.isInteger(dimension) || dimension % 2 !== 0) {
		throw new Error(`${label} must be an even integer`);
	}
	return dimension;
}

function requirePathSegment({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	const segment = requireString({ value, label, maximumLength: 160 });
	if (
		!SAFE_PATH_SEGMENT_PATTERN.test(segment) ||
		segment === "." ||
		segment === ".."
	) {
		throw new Error(`${label} must be a safe path segment`);
	}
	return segment;
}

function requirePackageHash({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	const hash = requireString({ value, label, maximumLength: 32 });
	if (!PACKAGE_HASH_PATTERN.test(hash)) {
		throw new Error(`${label} must be a 32-character hexadecimal digest`);
	}
	return hash.toLowerCase();
}

function requirePackageKind({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): JianyingTextRuntimePackageKind {
	if (
		typeof value !== "string" ||
		!PACKAGE_KINDS.has(value as JianyingTextRuntimePackageKind)
	) {
		throw new Error(
			`${label} must be TextStyle, InfoSticker, or ScriptInfoSticker`
		);
	}
	return value as JianyingTextRuntimePackageKind;
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
	return path.resolve(
		configDirectory,
		requireString({ value, label, maximumLength: 4096 })
	);
}

function parseCanvas({ value }: { value: unknown }): TextParityCanvas {
	const canvas = requireObject({ value, label: "matrix.canvas" });
	const backgroundColor =
		canvas.backgroundColor === undefined
			? "#000000"
			: requireString({
					value: canvas.backgroundColor,
					label: "matrix.canvas.backgroundColor",
					maximumLength: 7,
				});
	if (!HEX_COLOR_PATTERN.test(backgroundColor)) {
		throw new Error(
			"matrix.canvas.backgroundColor must use the #RRGGBB format"
		);
	}
	return {
		width: requireEvenDimension({
			value: canvas.width,
			label: "matrix.canvas.width",
		}),
		height: requireEvenDimension({
			value: canvas.height,
			label: "matrix.canvas.height",
		}),
		backgroundColor: backgroundColor.toLowerCase(),
	};
}

function parseTransform({
	value,
	canvas,
	label,
}: {
	value: unknown;
	canvas: TextParityCanvas;
	label: string;
}): TextParityTransform {
	if (value === undefined) {
		return {
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			rotation: 0,
			opacity: 1,
		};
	}
	const transform = requireObject({ value, label });
	return {
		x: requireFiniteNumber({
			value: transform.x,
			label: `${label}.x`,
			minimum: -65_536,
			maximum: 65_536,
		}),
		y: requireFiniteNumber({
			value: transform.y,
			label: `${label}.y`,
			minimum: -65_536,
			maximum: 65_536,
		}),
		width: requireFiniteNumber({
			value: transform.width,
			label: `${label}.width`,
			minimum: 1,
			maximum: 4096,
		}),
		height: requireFiniteNumber({
			value: transform.height,
			label: `${label}.height`,
			minimum: 1,
			maximum: 4096,
		}),
		rotation: requireFiniteNumber({
			value: transform.rotation,
			label: `${label}.rotation`,
			minimum: -36_000,
			maximum: 36_000,
		}),
		opacity: requireFiniteNumber({
			value: transform.opacity,
			label: `${label}.opacity`,
			minimum: 0,
			maximum: 1,
		}),
	};
}

function parseEntry({
	value,
	index,
	configDirectory,
	canvas,
	frameRate,
}: {
	value: unknown;
	index: number;
	configDirectory: string;
	canvas: TextParityCanvas;
	frameRate: number;
}): TextParityEntry {
	const entry = requireObject({ value, label: `entries[${index}]` });
	const label = `entries[${index}]`;
	const sourceStartSeconds =
		entry.sourceStartSeconds === undefined
			? 0
			: requireFiniteNumber({
					value: entry.sourceStartSeconds,
					label: `${label}.sourceStartSeconds`,
					minimum: 0,
					maximum: 86_400,
				});
	const elementDurationSeconds = requireFiniteNumber({
		value: entry.elementDurationSeconds,
		label: `${label}.elementDurationSeconds`,
		minimum: 1 / frameRate,
		maximum: 86_400,
	});
	if (sourceStartSeconds >= elementDurationSeconds) {
		throw new Error(
			`${label}.sourceStartSeconds must be earlier than elementDurationSeconds`
		);
	}
	const captureDurationSeconds =
		entry.captureDurationSeconds === undefined
			? elementDurationSeconds - sourceStartSeconds
			: requireFiniteNumber({
					value: entry.captureDurationSeconds,
					label: `${label}.captureDurationSeconds`,
					minimum: 1 / frameRate,
					maximum: 86_400,
				});
	const frameCount = Math.round(captureDurationSeconds * frameRate);
	if (frameCount < TEXT_PARITY_PROGRESS_STOPS.length || frameCount > 18_000) {
		throw new Error(`${label} must capture between 5 and 18000 frames`);
	}
	const finalSourceTime = sourceStartSeconds + (frameCount - 1) / frameRate;
	if (finalSourceTime > elementDurationSeconds + 1 / frameRate / 1000) {
		throw new Error(`${label} capture exceeds the text element duration`);
	}
	const content = requireString({
		value: entry.content,
		label: `${label}.content`,
	});
	if (content.trim().length === 0 || Array.from(content).length > 4096) {
		throw new Error(`${label}.content must contain 1-4096 code points`);
	}
	const referenceOrigin = requireReferenceOrigin({
		value: entry.referenceOrigin,
		label: `${label}.referenceOrigin`,
	});
	const referenceAppVersion = optionalString({
		value: entry.referenceAppVersion,
		label: `${label}.referenceAppVersion`,
	});
	if (referenceOrigin === "jianying-app-export" && !referenceAppVersion) {
		throw new Error(
			`${label}.referenceAppVersion is required for a Jianying App export`
		);
	}
	if (
		referenceOrigin === "qcut-private-runtime-control" &&
		referenceAppVersion
	) {
		throw new Error(
			`${label}.referenceAppVersion is not valid for a QCut control`
		);
	}
	return {
		title: requireString({
			value: entry.title,
			label: `${label}.title`,
			maximumLength: 256,
		}),
		resourceId: requirePathSegment({
			value: entry.resourceId,
			label: `${label}.resourceId`,
		}),
		packageHash: requirePackageHash({
			value: entry.packageHash,
			label: `${label}.packageHash`,
		}),
		packageKind: requirePackageKind({
			value: entry.packageKind,
			label: `${label}.packageKind`,
		}),
		referenceVideo: resolveFromConfig({
			configDirectory,
			value: entry.referenceVideo,
			label: `${label}.referenceVideo`,
		}),
		referenceOrigin,
		...(referenceAppVersion ? { referenceAppVersion } : {}),
		content,
		fontAssetId: optionalString({
			value: entry.fontAssetId,
			label: `${label}.fontAssetId`,
		}),
		fontSize: requireFiniteNumber({
			value: entry.fontSize,
			label: `${label}.fontSize`,
			minimum: 1,
			maximum: 1000,
		}),
		templateDuration: requireFiniteNumber({
			value: entry.templateDuration,
			label: `${label}.templateDuration`,
			minimum: 1 / 240,
			maximum: 86_400,
		}),
		sourceStartSeconds,
		elementDurationSeconds,
		captureDurationSeconds,
		transform: parseTransform({
			value: entry.transform,
			canvas,
			label: `${label}.transform`,
		}),
	};
}

export function readTextParityMatrix({
	matrixPath,
}: {
	matrixPath: string;
}): TextParityMatrix {
	const resolvedPath = path.resolve(matrixPath);
	const configDirectory = path.dirname(resolvedPath);
	const parsed: unknown = JSON.parse(readFileSync(resolvedPath, "utf8"));
	const matrix = requireObject({ value: parsed, label: "matrix" });
	const frameRate = requireFiniteNumber({
		value: matrix.frameRate,
		label: "matrix.frameRate",
		minimum: 1,
		maximum: 240,
	});
	const canvas = parseCanvas({ value: matrix.canvas });
	if (!Array.isArray(matrix.entries) || matrix.entries.length === 0) {
		throw new Error("matrix.entries must contain at least one text case");
	}
	const entries: TextParityEntry[] = [];
	for (const [index, value] of matrix.entries.entries()) {
		entries.push(
			parseEntry({
				value,
				index,
				configDirectory,
				canvas,
				frameRate,
			})
		);
	}
	const identities = new Set<string>();
	for (const entry of entries) {
		const identity = `${entry.resourceId}:${entry.packageHash}`;
		if (identities.has(identity)) {
			throw new Error(`Duplicate text parity identity: ${identity}`);
		}
		identities.add(identity);
	}
	return { frameRate, canvas, entries };
}

function progressKey({ progress }: { progress: number }): string {
	return `p${String(Math.round(progress * 100)).padStart(3, "0")}`;
}

export function buildTextParityFrameWindow({
	entry,
	frameRate,
}: {
	entry: TextParityEntry;
	frameRate: number;
}): TextParityFrameWindow {
	const frameCount = Math.round(entry.captureDurationSeconds * frameRate);
	return {
		transitionFrames: frameCount,
		startFrame: 0,
		endFrameInclusive: frameCount - 1,
		endFrameExclusive: frameCount,
		samples: TEXT_PARITY_PROGRESS_STOPS.map((progress) => ({
			progress,
			frameIndex: Math.round(progress * (frameCount - 1)),
			key: progressKey({ progress }),
		})),
	};
}
