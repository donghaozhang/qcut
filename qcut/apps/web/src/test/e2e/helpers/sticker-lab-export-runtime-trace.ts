import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	evaluateStickerRuntime,
	type DirectGifRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import { expect, type TestInfo } from "@playwright/test";
import type { Page } from "playwright";

export interface StickerExportRuntimeDraw {
	alphaPixelRatio: number;
	expectedRuntimeFrameIndex?: number;
	outputFrameIndex?: number;
	outputTimeSeconds?: number;
	pixelHash: string;
	sourceHeight: number;
	sourceKind: string;
	sourceWidth: number;
}

interface StickerExportRuntimeTrace {
	draws: StickerExportRuntimeDraw[];
}

interface StickerExportRuntimeTraceWindow extends Window {
	__stickerExportRuntimeTrace?: StickerExportRuntimeTrace;
}

export async function installStickerExportRuntimeTrace({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		const traceWindow = window as StickerExportRuntimeTraceWindow;
		const draws: StickerExportRuntimeDraw[] = [];
		traceWindow.__stickerExportRuntimeTrace = { draws };
		const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
		const sampleCanvas = document.createElement("canvas");
		sampleCanvas.width = 64;
		sampleCanvas.height = 64;
		const sampleContext = sampleCanvas.getContext("2d", {
			willReadFrequently: true,
		});
		if (!sampleContext) {
			throw new Error("Unable to create Sticker Lab export trace canvas");
		}

		CanvasRenderingContext2D.prototype.drawImage = function (...args) {
			const source = args[0] as CanvasImageSource;
			const sourceKind = source.constructor.name;
			const candidate = source as CanvasImageSource & {
				displayHeight?: number;
				displayWidth?: number;
				height?: number;
				width?: number;
			};
			const resolvedSourceWidth =
				candidate.displayWidth ?? candidate.width ?? 0;
			const resolvedSourceHeight =
				candidate.displayHeight ?? candidate.height ?? 0;
			const targetCanvas = this.canvas;
			const isRuntimeDraw =
				targetCanvas instanceof HTMLCanvasElement &&
				targetCanvas.classList.contains("export-canvas") &&
				(sourceKind === "VideoFrame" || sourceKind === "HTMLCanvasElement");
			if (isRuntimeDraw) {
				sampleContext.clearRect(0, 0, 64, 64);
				Reflect.apply(originalDrawImage, sampleContext, [source, 0, 0, 64, 64]);
				const pixels = sampleContext.getImageData(0, 0, 64, 64).data;
				let alphaPixels = 0;
				let hash = 2_166_136_261;
				for (let offset = 0; offset < pixels.length; offset += 4) {
					if ((pixels[offset + 3] ?? 0) > 0) alphaPixels += 1;
					for (let channel = 0; channel < 4; channel += 1) {
						hash ^= pixels[offset + channel] ?? 0;
						hash = Math.imul(hash, 16_777_619);
					}
				}
				draws.push({
					alphaPixelRatio: alphaPixels / (64 * 64),
					pixelHash: (hash >>> 0).toString(16).padStart(8, "0"),
					sourceHeight: resolvedSourceHeight,
					sourceKind,
					sourceWidth: resolvedSourceWidth,
				});
			}
			return Reflect.apply(originalDrawImage, this, args);
		};
	});
}

export async function readStickerExportRuntimeTrace({
	descriptor,
	evidencePath,
	expectedFrameCount,
	expectedSourceHeight,
	expectedSourceWidth,
	frameRate,
	page,
	testInfo,
	timelineDurationSeconds,
}: {
	descriptor: DirectGifRuntimeDescriptor;
	evidencePath: string;
	expectedFrameCount: number;
	expectedSourceHeight: number;
	expectedSourceWidth: number;
	frameRate: number;
	page: Page;
	testInfo: TestInfo;
	timelineDurationSeconds: number;
}): Promise<StickerExportRuntimeTrace> {
	const capturedTrace = await page.evaluate(() => {
		const value = (window as StickerExportRuntimeTraceWindow)
			.__stickerExportRuntimeTrace;
		if (!value) throw new Error("Sticker Lab export trace was not installed");
		return value;
	});
	const trace: StickerExportRuntimeTrace = {
		draws: capturedTrace.draws.map((draw, outputFrameIndex) => {
			const outputTimeSeconds = outputFrameIndex / frameRate;
			const runtimeState = evaluateStickerRuntime({
				descriptor,
				timeline: {
					sourceOffsetSeconds: 0,
					timelineDurationSeconds,
					timelineStartSeconds: 0,
				},
				timelineTimeSeconds: outputTimeSeconds,
			});
			expect(runtimeState.active).toBe(true);
			if (!(runtimeState.active && runtimeState.kind === "direct-gif")) {
				throw new Error("Expected an active direct GIF export runtime state");
			}
			return {
				...draw,
				expectedRuntimeFrameIndex: runtimeState.frameIndex,
				outputFrameIndex,
				outputTimeSeconds,
			};
		}),
	};
	await mkdir(path.dirname(evidencePath), { recursive: true });
	await writeFile(evidencePath, `${JSON.stringify(trace, null, 2)}\n`);
	await testInfo.attach("sticker-lab-export-runtime-trace", {
		body: Buffer.from(JSON.stringify(trace, null, 2)),
		contentType: "application/json",
	});
	expect(trace.draws).toHaveLength(expectedFrameCount);
	for (const draw of trace.draws) {
		expect(["HTMLCanvasElement", "VideoFrame"]).toContain(draw.sourceKind);
		expect(draw.sourceWidth).toBe(expectedSourceWidth);
		expect(draw.sourceHeight).toBe(expectedSourceHeight);
	}
	expect(trace.draws.some(({ alphaPixelRatio }) => alphaPixelRatio > 0)).toBe(
		true
	);
	expect(
		new Set(trace.draws.map(({ pixelHash }) => pixelHash)).size
	).toBeGreaterThan(1);
	const hashesByExpectedFrame = new Map<number, Set<string>>();
	for (const draw of trace.draws) {
		const expectedFrameIndex = draw.expectedRuntimeFrameIndex;
		if (expectedFrameIndex === undefined) {
			throw new Error(
				"Export trace draw is missing its expected runtime frame"
			);
		}
		const hashes = hashesByExpectedFrame.get(expectedFrameIndex) ?? new Set();
		hashes.add(draw.pixelHash);
		hashesByExpectedFrame.set(expectedFrameIndex, hashes);
	}
	expect(hashesByExpectedFrame.size).toBeGreaterThan(1);
	if (timelineDurationSeconds >= descriptor.cycleDurationSeconds) {
		expect(hashesByExpectedFrame.size).toBe(descriptor.frames.length);
	}
	for (const hashes of hashesByExpectedFrame.values()) {
		expect(hashes.size).toBe(1);
	}
	return trace;
}
