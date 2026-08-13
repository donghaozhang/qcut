import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { measureFilterLabMasks } from "../../electron/native-pipeline/filters/filter-lab-image-metrics.js";

interface NativeMaskFrame {
	width: number;
	height: number;
	bytes: Uint8Array;
}

interface UiMaskGroupDefinition {
	algorithmGraphSha256: string;
	label: string;
	maskPath: string;
}

interface UiMaskManifestDefinition {
	schemaVersion: 1;
	sourceSha256: string;
	width: number;
	height: number;
	frameCount: number;
	measurementStartFrame: number;
	groups: UiMaskGroupDefinition[];
}

export interface UiMaskManifest extends UiMaskManifestDefinition {
	manifestPath: string;
}

export interface UiMaskReference {
	algorithmGraphSha256: string;
	label: string;
	maskPath: string;
	maskSha256: string;
	width: number;
	height: number;
	measurementStartFrame: number;
	frames: Uint8Array[];
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

function canonicalizeJson({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalizeJson({ value: entry }));
	}
	if (!(value && typeof value === "object")) return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, canonicalizeJson({ value: entry })])
	);
}

export function algorithmGraphSha256({ graph }: { graph: unknown }) {
	return sha256({
		bytes: Buffer.from(JSON.stringify(canonicalizeJson({ value: graph }))),
	});
}

function assertPositiveInteger({
	value,
	label,
}: {
	value: unknown;
	label: string;
}) {
	if (
		!(typeof value === "number" && Number.isSafeInteger(value) && value > 0)
	) {
		throw new Error(`${label} must be a positive integer`);
	}
	return value;
}

function parseGroup({ value }: { value: unknown }): UiMaskGroupDefinition {
	if (!(value && typeof value === "object")) {
		throw new Error("UI mask group must be an object");
	}
	const group = value as Record<string, unknown>;
	for (const field of ["algorithmGraphSha256", "label", "maskPath"] as const) {
		if (!(typeof group[field] === "string" && group[field].length > 0)) {
			throw new Error(`UI mask group ${field} must be a non-empty string`);
		}
	}
	return {
		algorithmGraphSha256: group.algorithmGraphSha256 as string,
		label: group.label as string,
		maskPath: group.maskPath as string,
	};
}

export async function loadUiMaskManifest({
	manifestPath,
	sourceSha256,
	frameCount,
	width,
	height,
}: {
	manifestPath: string;
	sourceSha256: string;
	frameCount: number;
	width: number;
	height: number;
}): Promise<UiMaskManifest> {
	const value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
	if (!(value && typeof value === "object")) {
		throw new Error("UI mask manifest must be an object");
	}
	const manifest = value as Record<string, unknown>;
	if (manifest.schemaVersion !== 1) {
		throw new Error("Unsupported UI mask manifest schema");
	}
	if (manifest.sourceSha256 !== sourceSha256) {
		throw new Error("UI mask manifest belongs to a different source video");
	}
	if (
		assertPositiveInteger({
			value: manifest.width,
			label: "manifest width",
		}) !== width ||
		assertPositiveInteger({
			value: manifest.height,
			label: "manifest height",
		}) !== height ||
		assertPositiveInteger({
			value: manifest.frameCount,
			label: "manifest frame count",
		}) !== frameCount
	) {
		throw new Error("UI mask manifest dimensions do not match decoded video");
	}
	if (
		!(
			typeof manifest.measurementStartFrame === "number" &&
			Number.isSafeInteger(manifest.measurementStartFrame) &&
			manifest.measurementStartFrame >= 0 &&
			manifest.measurementStartFrame < frameCount
		)
	) {
		throw new Error("UI mask measurement start frame is invalid");
	}
	if (!(Array.isArray(manifest.groups) && manifest.groups.length > 0)) {
		throw new Error("UI mask manifest must define at least one graph group");
	}
	const groups = manifest.groups.map((group) => parseGroup({ value: group }));
	if (
		new Set(groups.map((group) => group.algorithmGraphSha256)).size !==
		groups.length
	) {
		throw new Error("UI mask manifest has duplicate graph groups");
	}
	return {
		schemaVersion: 1,
		sourceSha256,
		width,
		height,
		frameCount,
		measurementStartFrame: manifest.measurementStartFrame,
		groups,
		manifestPath,
	};
}

export async function loadUiMaskReference({
	manifest,
	packagePath,
}: {
	manifest: UiMaskManifest;
	packagePath: string;
}): Promise<UiMaskReference> {
	const graph = JSON.parse(
		await readFile(resolve(packagePath, "algorithmConfig.json"), "utf8")
	) as unknown;
	const graphSha256 = algorithmGraphSha256({ graph });
	const group = manifest.groups.find(
		(candidate) => candidate.algorithmGraphSha256 === graphSha256
	);
	if (!group) {
		throw new Error(`No UI mask evidence for algorithm graph ${graphSha256}`);
	}
	const maskPath = resolve(dirname(manifest.manifestPath), group.maskPath);
	const bytes = new Uint8Array(await readFile(maskPath));
	const bytesPerFrame = manifest.width * manifest.height;
	if (bytes.length !== bytesPerFrame * manifest.frameCount) {
		throw new Error(`${maskPath} has the wrong UI mask sequence size`);
	}
	return {
		algorithmGraphSha256: graphSha256,
		label: group.label,
		maskPath,
		maskSha256: sha256({ bytes }),
		width: manifest.width,
		height: manifest.height,
		measurementStartFrame: manifest.measurementStartFrame,
		frames: Array.from({ length: manifest.frameCount }, (_, index) =>
			bytes.slice(index * bytesPerFrame, (index + 1) * bytesPerFrame)
		),
	};
}

export function resizeMaskHalfPixel({
	mask,
	width,
	height,
	flipVertical = false,
}: {
	mask: NativeMaskFrame;
	width: number;
	height: number;
	flipVertical?: boolean;
}) {
	if (mask.bytes.length !== mask.width * mask.height) {
		throw new Error("Native mask has the wrong pixel count");
	}
	const output = new Uint8Array(width * height);
	for (let y = 0; y < height; y += 1) {
		const sourceY = (y + 0.5) * (mask.height / height) - 0.5;
		const yFloor = Math.floor(sourceY);
		const yWeight = sourceY - yFloor;
		const y0 = Math.max(0, Math.min(mask.height - 1, yFloor));
		const y1 = Math.max(0, Math.min(mask.height - 1, yFloor + 1));
		const sampleY0 = flipVertical ? mask.height - y0 - 1 : y0;
		const sampleY1 = flipVertical ? mask.height - y1 - 1 : y1;
		for (let x = 0; x < width; x += 1) {
			const sourceX = (x + 0.5) * (mask.width / width) - 0.5;
			const xFloor = Math.floor(sourceX);
			const xWeight = sourceX - xFloor;
			const x0 = Math.max(0, Math.min(mask.width - 1, xFloor));
			const x1 = Math.max(0, Math.min(mask.width - 1, xFloor + 1));
			const top =
				mask.bytes[sampleY0 * mask.width + x0] * (1 - xWeight) +
				mask.bytes[sampleY0 * mask.width + x1] * xWeight;
			const bottom =
				mask.bytes[sampleY1 * mask.width + x0] * (1 - xWeight) +
				mask.bytes[sampleY1 * mask.width + x1] * xWeight;
			output[y * width + x] = Math.round(
				top * (1 - yWeight) + bottom * yWeight
			);
		}
	}
	return output;
}

function summarizeMetrics({
	reference,
	candidate,
	width,
	height,
}: {
	reference: Uint8Array[];
	candidate: Uint8Array[];
	width: number;
	height: number;
}) {
	const perFrame = reference.map((pixels, index) =>
		measureFilterLabMasks({
			reference: { width, height, pixels },
			candidate: { width, height, pixels: candidate[index] },
		})
	);
	const mean = ({ values }: { values: number[] }) =>
		values.reduce((sum, value) => sum + value, 0) / values.length;
	return {
		maskIou: mean({ values: perFrame.map((metrics) => metrics.maskIou) }),
		maskMae: mean({ values: perFrame.map((metrics) => metrics.maskMae) }),
		maskEdgeMae: mean({
			values: perFrame.map((metrics) => metrics.maskEdgeMae),
		}),
		maskEdgeMaeMax: Math.max(...perFrame.map((metrics) => metrics.maskEdgeMae)),
		perFrame,
	};
}

export async function compareUiMaskSequence({
	nativeMasks,
	reference,
	candidatePath,
}: {
	nativeMasks: NativeMaskFrame[];
	reference: UiMaskReference;
	candidatePath: string;
}) {
	if (nativeMasks.length !== reference.frames.length) {
		throw new Error("Native and UI mask sequences have different frame counts");
	}
	const normal = nativeMasks.map((mask) =>
		resizeMaskHalfPixel({
			mask,
			width: reference.width,
			height: reference.height,
		})
	);
	const verticalFlip = nativeMasks.map((mask) =>
		resizeMaskHalfPixel({
			mask,
			width: reference.width,
			height: reference.height,
			flipVertical: true,
		})
	);
	const normalMetrics = summarizeMetrics({
		reference: reference.frames.slice(reference.measurementStartFrame),
		candidate: normal.slice(reference.measurementStartFrame),
		width: reference.width,
		height: reference.height,
	});
	const verticalFlipMetrics = summarizeMetrics({
		reference: reference.frames.slice(reference.measurementStartFrame),
		candidate: verticalFlip.slice(reference.measurementStartFrame),
		width: reference.width,
		height: reference.height,
	});
	const useVerticalFlip = verticalFlipMetrics.maskMae < normalMetrics.maskMae;
	const selectedFrames = useVerticalFlip ? verticalFlip : normal;
	const selectedMetrics = useVerticalFlip ? verticalFlipMetrics : normalMetrics;
	await writeFile(candidatePath, Buffer.concat(selectedFrames));
	return {
		...selectedMetrics,
		orientation: useVerticalFlip
			? ("vertical-flip" as const)
			: ("normal" as const),
		candidatePath,
		candidateSha256: sha256({ bytes: Buffer.concat(selectedFrames) }),
		orientationComparison: {
			normal: normalMetrics,
			verticalFlip: verticalFlipMetrics,
		},
	};
}
