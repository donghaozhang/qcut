import * as fs from "node:fs/promises";
import * as path from "node:path";

interface CanvasModule {
	createCanvas: (width: number, height: number) => CanvasLike;
	loadImage: (source: string) => Promise<CanvasImageSource>;
}

interface CanvasLike {
	getContext: (type: "2d") => CanvasContext;
	toBuffer: (mimeType: string) => Buffer;
}

interface CanvasContext {
	drawImage: (
		image: CanvasImageSource,
		sx: number,
		sy: number,
		sWidth: number,
		sHeight: number,
		dx: number,
		dy: number,
		dWidth: number,
		dHeight: number
	) => void;
}

interface CanvasImageSource {
	width: number;
	height: number;
}

export interface CropImageToAspectRatioResult {
	changed: boolean;
	width?: number;
	height?: number;
	error?: string;
}

const RATIO_PATTERN = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
const EPSILON = 0.001;

function parseAspectRatio({
	aspectRatio,
}: {
	aspectRatio?: string;
}): number | null {
	if (!aspectRatio) return null;
	const match = aspectRatio.trim().match(RATIO_PATTERN);
	if (!match) return null;

	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!(width > 0) || !(height > 0)) return null;
	return width / height;
}

async function loadCanvasModule(): Promise<CanvasModule | null> {
	try {
		const moduleName = "@napi-rs/canvas";
		const canvas = (await import(moduleName)) as CanvasModule;
		return canvas;
	} catch {
		return null;
	}
}

function getCropBox({
	width,
	height,
	targetRatio,
}: {
	width: number;
	height: number;
	targetRatio: number;
}) {
	const currentRatio = width / height;
	if (Math.abs(currentRatio - targetRatio) <= EPSILON) {
		return null;
	}

	if (currentRatio > targetRatio) {
		const cropWidth = Math.max(1, Math.round(height * targetRatio));
		return {
			left: Math.max(0, Math.floor((width - cropWidth) / 2)),
			top: 0,
			width: cropWidth,
			height,
		};
	}

	const cropHeight = Math.max(1, Math.round(width / targetRatio));
	return {
		left: 0,
		top: Math.max(0, Math.floor((height - cropHeight) / 2)),
		width,
		height: cropHeight,
	};
}

function getMimeType({ filePath }: { filePath: string }): string {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".webp") return "image/webp";
	return "image/png";
}

export async function cropImageToAspectRatio({
	filePath,
	aspectRatio,
}: {
	filePath?: string;
	aspectRatio?: string;
}): Promise<CropImageToAspectRatioResult> {
	const targetRatio = parseAspectRatio({ aspectRatio });
	if (!filePath || !targetRatio) {
		return { changed: false };
	}

	const canvasModule = await loadCanvasModule();
	if (!canvasModule) {
		return { changed: false, error: "@napi-rs/canvas is not available" };
	}

	try {
		const image = await canvasModule.loadImage(filePath);
		const width = image.width;
		const height = image.height;
		if (width <= 0 || height <= 0) {
			return { changed: false, error: "image dimensions unavailable" };
		}

		const cropBox = getCropBox({ width, height, targetRatio });
		if (!cropBox) {
			return { changed: false, width, height };
		}

		const ext = path.extname(filePath) || ".png";
		const tempPath = `${filePath}.qcut-ratio${ext}`;
		const canvas = canvasModule.createCanvas(cropBox.width, cropBox.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(
			image,
			cropBox.left,
			cropBox.top,
			cropBox.width,
			cropBox.height,
			0,
			0,
			cropBox.width,
			cropBox.height
		);
		await fs.writeFile(tempPath, canvas.toBuffer(getMimeType({ filePath })));
		await fs.rename(tempPath, filePath);
		return {
			changed: true,
			width: cropBox.width,
			height: cropBox.height,
		};
	} catch (error) {
		return {
			changed: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
