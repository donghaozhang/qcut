/**
 * stamp-image CLI handler
 *
 * Composites a logo watermark and/or centered model label onto an image
 * using @napi-rs/canvas. No editor dependency — pure image post-processing.
 *
 * Layout:
 *   - Corner badge: QCut logo + "QCut" text (configurable position)
 *   - Center label: model name / custom text (large, prominent)
 *
 * @module electron/native-pipeline/cli/cli-handlers-stamp
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./cli-types.js";

/** Default logo path (QCut logo-v4) */
const DEFAULT_LOGO_PATH = path.resolve(
	import.meta.dirname,
	"../../../apps/web/public/assets/logo-v4.png"
);

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface StampConfig {
	inputPath: string;
	outputPath: string;
	logoPath: string | null;
	text: string | null;
	position: Position;
	logoScale: number;
	opacity: number;
	padding: number;
}

function resolveConfig(options: CLIRunOptions): StampConfig | CLIResult {
	const inputPath = options.input;
	if (!inputPath || !fs.existsSync(inputPath)) {
		return {
			success: false,
			error: `Missing or invalid --input: ${inputPath ?? "(none)"}`,
		};
	}

	const ext = path.extname(inputPath);
	const defaultOutput = inputPath.replace(ext, `_stamped${ext}`);
	const outputPath = options.outputDir
		? path.join(options.outputDir, path.basename(defaultOutput))
		: defaultOutput;

	const position = (options.data as Position) || "bottom-right";
	const validPositions: Position[] = [
		"top-left",
		"top-right",
		"bottom-left",
		"bottom-right",
	];
	if (!validPositions.includes(position)) {
		return {
			success: false,
			error: `Invalid --position: ${position}. Valid: ${validPositions.join(", ")}`,
		};
	}

	// --logo: explicit path, "none" to skip, or default
	let logoPath: string | null = DEFAULT_LOGO_PATH;
	if (options.imageUrl === "none") {
		logoPath = null;
	} else if (options.imageUrl) {
		logoPath = options.imageUrl;
		if (!fs.existsSync(logoPath)) {
			return { success: false, error: `Logo file not found: ${logoPath}` };
		}
	}

	return {
		inputPath,
		outputPath,
		logoPath,
		text: options.text || null,
		position,
		logoScale: Number(options.duration) || 0.12,
		opacity: 0.9,
		padding: 24,
	};
}

export async function handleStampImage(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const configOrError = resolveConfig(options);
	if ("error" in configOrError) return configOrError as CLIResult;
	const config = configOrError as StampConfig;

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Loading @napi-rs/canvas...",
	});

	// Dynamic import
	let canvasLib: {
		createCanvas: (w: number, h: number) => unknown;
		loadImage: (src: string | Buffer) => Promise<unknown>;
	};
	try {
		const moduleName = "@napi-rs/canvas";
		canvasLib = (await import(moduleName)) as typeof canvasLib;
	} catch {
		return {
			success: false,
			error:
				"@napi-rs/canvas not available. Install with: bun add @napi-rs/canvas",
		};
	}

	const startTime = Date.now();

	// Load source image
	onProgress({ stage: "processing", percent: 20, message: "Loading image..." });
	const sourceImage = (await canvasLib.loadImage(
		config.inputPath
	)) as ImageLike;
	const { width: imgW, height: imgH } = sourceImage;

	// Create canvas at source dimensions
	const canvas = canvasLib.createCanvas(imgW, imgH) as CanvasLike;
	const ctx = canvas.getContext("2d");
	ctx.drawImage(sourceImage as unknown as CanvasImageSource, 0, 0);

	onProgress({
		stage: "processing",
		percent: 50,
		message: "Compositing stamp...",
	});

	// ── 1. Corner badge: Logo + "QCut" ──────────────────────────────
	if (config.logoPath) {
		const logoImage = (await canvasLib.loadImage(config.logoPath)) as ImageLike;
		const logoAspect = logoImage.width / logoImage.height;
		const logoH = Math.round(imgH * config.logoScale);
		const logoW = Math.round(logoH * logoAspect);
		const pad = config.padding;

		// Measure "QCut" text
		const qcutFontSize = Math.max(12, Math.round(logoH * 0.45));
		ctx.font = `700 ${qcutFontSize}px sans-serif`;
		const qcutTextW = Math.ceil(ctx.measureText("QCut").width);

		const gap = 6;
		const badgeW = logoW + gap + qcutTextW;
		const badgeH = logoH;

		// Position the badge
		let bx: number;
		let by: number;
		switch (config.position) {
			case "top-left":
				bx = pad;
				by = pad;
				break;
			case "top-right":
				bx = imgW - badgeW - pad;
				by = pad;
				break;
			case "bottom-left":
				bx = pad;
				by = imgH - badgeH - pad;
				break;
			case "bottom-right":
			default:
				bx = imgW - badgeW - pad;
				by = imgH - badgeH - pad;
				break;
		}

		// Semi-transparent pill background
		const pillPad = 8;
		ctx.globalAlpha = 0.55;
		ctx.fillStyle = "#000000";
		roundRect(
			ctx,
			bx - pillPad,
			by - pillPad,
			badgeW + pillPad * 2,
			badgeH + pillPad * 2,
			10
		);
		ctx.fill();

		// Draw logo
		ctx.globalAlpha = config.opacity;
		ctx.drawImage(
			logoImage as unknown as CanvasImageSource,
			bx,
			by,
			logoW,
			logoH
		);

		// Draw "QCut" text
		ctx.globalAlpha = 1;
		ctx.fillStyle = "#FFFFFF";
		ctx.font = `700 ${qcutFontSize}px sans-serif`;
		ctx.textBaseline = "middle";
		ctx.fillText("QCut", bx + logoW + gap, by + badgeH / 2 + 1);
	}

	// ── 2. Center label: model name / custom text ───────────────────
	if (config.text) {
		const centerFontSize = Math.max(36, Math.round(imgH * 0.16));
		ctx.font = `700 ${centerFontSize}px sans-serif`;
		const textMetrics = ctx.measureText(config.text);
		const tw = Math.ceil(textMetrics.width);
		const th = centerFontSize;

		const cx = (imgW - tw) / 2;
		const cy = imgH * 0.15;

		// Semi-transparent pill behind text
		const px = 14;
		const py = 8;
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = "#000000";
		roundRect(ctx, cx - px, cy - th / 2 - py, tw + px * 2, th + py * 2, 12);
		ctx.fill();

		// Draw text
		ctx.globalAlpha = 1;
		ctx.fillStyle = "#FFFFFF";
		ctx.font = `700 ${centerFontSize}px sans-serif`;
		ctx.textBaseline = "middle";
		ctx.fillText(config.text, cx, cy);
	}

	ctx.globalAlpha = 1;

	onProgress({ stage: "processing", percent: 80, message: "Encoding..." });

	// Encode output
	const mime = config.outputPath.endsWith(".jpg") ? "image/jpeg" : "image/png";
	const buffer = canvas.toBuffer(mime);

	// Ensure output directory exists
	const outDir = path.dirname(config.outputPath);
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	fs.writeFileSync(config.outputPath, buffer);

	onProgress({ stage: "complete", percent: 100, message: "Done" });

	return {
		success: true,
		outputPath: config.outputPath,
		outputPaths: [config.outputPath],
		duration: (Date.now() - startTime) / 1000,
	};
}

// ── Canvas type helpers ─────────────────────────────────────────────

type CanvasImageSource = unknown;

interface ImageLike {
	width: number;
	height: number;
}

interface CanvasLike {
	getContext: (type: string) => CanvasCtx;
	toBuffer: (mime: string) => Buffer;
}

interface CanvasCtx {
	drawImage(img: CanvasImageSource, ...args: number[]): void;
	fillRect(x: number, y: number, w: number, h: number): void;
	fillText(text: string, x: number, y: number): void;
	measureText(text: string): { width: number };
	beginPath(): void;
	moveTo(x: number, y: number): void;
	arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
	closePath(): void;
	fill(): void;
	globalAlpha: number;
	fillStyle: string;
	font: string;
	textBaseline: string;
}

function roundRect(
	ctx: CanvasCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
