import { open, readFile } from "node:fs/promises";
import path from "node:path";
import type { JianyingTextRuntimeRenderStrategy } from "../jianying-text-runtime-contract.js";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

export const JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION = 16;
const FRAME_VALIDATION_CONCURRENCY = 32;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface JianyingTextCachedRenderManifest {
	schemaVersion: typeof JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION;
	cacheKey: string;
	frameCount: number;
	fps: number;
	strategy: JianyingTextRuntimeRenderStrategy;
	templateDuration: number;
}

interface ExpectedCachedRender {
	frameCount: number;
	fps: number;
	templateDuration: number;
	width: number;
	height: number;
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function renderStrategy({
	value,
}: {
	value: unknown;
}): JianyingTextRuntimeRenderStrategy | null {
	return value === "host-text" ||
		value === "runtime-parameters" ||
		value === "preload-copy"
		? value
		: null;
}

function parseManifest({
	value,
	cacheKey,
	expected,
}: {
	value: unknown;
	cacheKey: string;
	expected: ExpectedCachedRender;
}): JianyingTextCachedRenderManifest | null {
	const manifest = asRecord({ value });
	const strategy = renderStrategy({ value: manifest?.strategy });
	if (
		!manifest ||
		manifest.schemaVersion !== JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION ||
		manifest.cacheKey !== cacheKey ||
		manifest.frameCount !== expected.frameCount ||
		manifest.fps !== expected.fps ||
		manifest.templateDuration !== expected.templateDuration ||
		!strategy
	) {
		return null;
	}
	return {
		schemaVersion: JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION,
		cacheKey,
		frameCount: expected.frameCount,
		fps: expected.fps,
		strategy,
		templateDuration: expected.templateDuration,
	};
}

export function jianyingTextFramePath({
	directory,
	index,
}: {
	directory: string;
	index: number;
}) {
	return path.join(directory, `frame-${String(index).padStart(6, "0")}.png`);
}

export function jianyingTextFramePattern({ directory }: { directory: string }) {
	return path.join(directory, "frame-%06d.png");
}

async function isExpectedPngFrame({
	filePath,
	width,
	height,
}: {
	filePath: string;
	width: number;
	height: number;
}) {
	const file = await open(filePath, "r");
	try {
		const header = Buffer.alloc(24);
		const [metadata, readResult] = await Promise.all([
			file.stat(),
			file.read(header, 0, header.length, 0),
		]);
		return (
			metadata.isFile() &&
			metadata.size >= header.length &&
			readResult.bytesRead === header.length &&
			header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
			header.toString("ascii", 12, 16) === "IHDR" &&
			header.readUInt32BE(16) === width &&
			header.readUInt32BE(20) === height
		);
	} finally {
		await file.close();
	}
}

export async function readJianyingTextCachedRender({
	directory,
	cacheKey,
	expected,
}: {
	directory: string;
	cacheKey: string;
	expected: ExpectedCachedRender;
}): Promise<JianyingTextCachedRenderManifest | null> {
	try {
		const manifest = parseManifest({
			value: JSON.parse(
				await readFile(path.join(directory, "manifest.json"), "utf8")
			),
			cacheKey,
			expected,
		});
		if (!manifest) return null;
		const frameIndices = Array.from(
			{ length: manifest.frameCount },
			(_, index) => index
		);
		const validFrames = await mapWithConcurrency({
			items: frameIndices,
			limit: FRAME_VALIDATION_CONCURRENCY,
			task: ({ item: index }) =>
				isExpectedPngFrame({
					filePath: jianyingTextFramePath({ directory, index }),
					width: expected.width,
					height: expected.height,
				}),
		});
		return validFrames.every(Boolean) ? manifest : null;
	} catch {
		return null;
	}
}
