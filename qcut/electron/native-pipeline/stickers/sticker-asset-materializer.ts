import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { downloadIconifyStickerSvg } from "./iconify-sticker-client.js";
import type { StickerOverlayItem } from "./sticker-overlay-plan.js";

interface ImageLike {
	width: number;
	height: number;
}

interface CanvasLike {
	getContext: (type: "2d") => {
		drawImage: (
			image: unknown,
			dx: number,
			dy: number,
			width: number,
			height: number
		) => void;
	};
	toBuffer: (mimeType: "image/png") => Buffer;
}

interface CanvasLibrary {
	createCanvas: (width: number, height: number) => CanvasLike;
	loadImage: (source: Buffer | string) => Promise<ImageLike>;
}

export interface MaterializedSticker {
	item: StickerOverlayItem;
	path: string;
}

function safeFileStem({ value }: { value: string }): string {
	const stem = value
		.toLocaleLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return stem || "sticker";
}

async function loadCanvas(): Promise<CanvasLibrary> {
	try {
		const moduleName = "@napi-rs/canvas";
		return (await import(moduleName)) as unknown as CanvasLibrary;
	} catch {
		throw new Error("@napi-rs/canvas is required to rasterize SVG stickers");
	}
}

function assertSafeSvg({ svg }: { svg: string }): void {
	if (!/<svg[\s>]/i.test(svg) || !/<\/svg>/i.test(svg)) {
		throw new Error("Sticker source is not a valid SVG document");
	}
	if (Buffer.byteLength(svg, "utf8") > 2 * 1024 * 1024) {
		throw new Error("Sticker SVG exceeds the 2 MB safety limit");
	}
	if (
		/<script[\s>]|javascript:|<!entity|<!doctype|<foreignObject[\s>]|<image[\s>]|@import|url\s*\(\s*['"]?(?:https?:|data:|\/\/)|(?:href|xlink:href)\s*=\s*['"](?:https?:|data:|\/\/)/i.test(
			svg
		)
	) {
		throw new Error(
			"Sticker SVG contains executable or external entity content"
		);
	}
}

async function rasterizeSvg({
	svg,
	outputPath,
	size,
}: {
	svg: string;
	outputPath: string;
	size: number;
}): Promise<void> {
	assertSafeSvg({ svg });
	const canvasLibrary = await loadCanvas();
	const image = await canvasLibrary.loadImage(Buffer.from(svg, "utf8"));
	const sourceWidth = Math.max(1, image.width);
	const sourceHeight = Math.max(1, image.height);
	const scale = size / Math.max(sourceWidth, sourceHeight);
	const width = Math.max(1, Math.round(sourceWidth * scale));
	const height = Math.max(1, Math.round(sourceHeight * scale));
	const canvas = canvasLibrary.createCanvas(width, height);
	canvas.getContext("2d").drawImage(image, 0, 0, width, height);
	writeFileSync(outputPath, canvas.toBuffer("image/png"));
}

export async function materializeSticker({
	item,
	outputDirectory,
	index,
	planDirectory,
	signal,
}: {
	item: StickerOverlayItem;
	outputDirectory: string;
	index: number;
	planDirectory: string;
	signal?: AbortSignal;
}): Promise<MaterializedSticker> {
	mkdirSync(outputDirectory, { recursive: true });
	const requestedSize = Math.max(item.width, item.height ?? item.width, 512);
	const identity = item.stickerId ?? item.source ?? `sticker-${index + 1}`;
	const outputPath = resolve(
		outputDirectory,
		`${String(index + 1).padStart(2, "0")}-${safeFileStem({ value: identity })}.png`
	);

	if (item.stickerId) {
		const svg = await downloadIconifyStickerSvg({
			stickerId: item.stickerId,
			size: requestedSize,
			signal,
		});
		await rasterizeSvg({ svg, outputPath, size: requestedSize });
		return { item, path: outputPath };
	}

	const sourcePath = resolve(planDirectory, item.source ?? "");
	if (!existsSync(sourcePath)) {
		throw new Error(`Sticker source not found: ${sourcePath}`);
	}
	if (extname(sourcePath).toLocaleLowerCase() === ".svg") {
		const svg = readFileSync(sourcePath, "utf8");
		await rasterizeSvg({ svg, outputPath, size: requestedSize });
		return { item, path: outputPath };
	}
	const extension = extname(sourcePath).toLocaleLowerCase();
	if (!new Set([".png", ".jpg", ".jpeg", ".webp"]).has(extension)) {
		throw new Error(
			`Unsupported sticker image "${basename(sourcePath)}". Use PNG, JPG, WebP, or SVG.`
		);
	}
	return { item, path: sourcePath };
}
