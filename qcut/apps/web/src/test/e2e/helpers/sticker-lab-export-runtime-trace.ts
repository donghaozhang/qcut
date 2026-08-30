import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	evaluateStickerRuntime,
	parseDirectGifRuntimeDescriptor,
	type DirectGifRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import { expect, type TestInfo } from "@playwright/test";
import type { Page } from "playwright";
import type { StratifiedStickerSourceReference } from "./sticker-lab-source-frame-evidence";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";

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

interface StickerExportRuntimeTraceState extends StickerExportRuntimeTrace {
	outputFrameIndex: number;
}

interface StickerExportRuntimeSourceFingerprint {
	alphaPixelRatio: number;
	pixelHash: string;
}

interface StickerExportRuntimeTraceWindow extends Window {
	__stickerExportRuntimeTraceInstalled?: boolean;
	__stickerExportRuntimeTrace?: StickerExportRuntimeTraceState;
	__stickerExportRuntimeFingerprintSource?: (
		source: CanvasImageSource
	) => StickerExportRuntimeSourceFingerprint;
}

export async function installStickerExportRuntimeTrace({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		const traceWindow = window as StickerExportRuntimeTraceWindow;
		traceWindow.__stickerExportRuntimeTrace = {
			draws: [],
			outputFrameIndex: -1,
		};
		if (traceWindow.__stickerExportRuntimeTraceInstalled) return;

		const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
		const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
		const sampleCanvas = document.createElement("canvas");
		sampleCanvas.width = 64;
		sampleCanvas.height = 64;
		const sampleContext = sampleCanvas.getContext("2d", {
			willReadFrequently: true,
		});
		if (!sampleContext) {
			throw new Error("Unable to create Sticker Lab export trace canvas");
		}
		const fingerprintSource = (
			source: CanvasImageSource
		): StickerExportRuntimeSourceFingerprint => {
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
			return {
				alphaPixelRatio: alphaPixels / (64 * 64),
				pixelHash: (hash >>> 0).toString(16).padStart(8, "0"),
			};
		};
		traceWindow.__stickerExportRuntimeFingerprintSource = fingerprintSource;
		const isExportCanvas = (canvas: HTMLCanvasElement): boolean =>
			canvas.classList.contains("export-canvas");

		CanvasRenderingContext2D.prototype.clearRect = function (
			x,
			y,
			width,
			height
		) {
			const targetCanvas = this.canvas;
			const clearsWholeExportCanvas =
				targetCanvas instanceof HTMLCanvasElement &&
				isExportCanvas(targetCanvas) &&
				x <= 0 &&
				y <= 0 &&
				width >= targetCanvas.width &&
				height >= targetCanvas.height;
			if (clearsWholeExportCanvas) {
				const trace = traceWindow.__stickerExportRuntimeTrace;
				if (trace) trace.outputFrameIndex += 1;
			}
			return Reflect.apply(originalClearRect, this, [x, y, width, height]);
		};

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
				isExportCanvas(targetCanvas) &&
				(sourceKind === "VideoFrame" || sourceKind === "HTMLCanvasElement");
			if (isRuntimeDraw) {
				const fingerprint = fingerprintSource(source);
				const trace = traceWindow.__stickerExportRuntimeTrace;
				const outputFrameIndex = trace?.outputFrameIndex ?? -1;
				trace?.draws.push({
					alphaPixelRatio: fingerprint.alphaPixelRatio,
					...(outputFrameIndex >= 0 ? { outputFrameIndex } : {}),
					pixelHash: fingerprint.pixelHash,
					sourceHeight: resolvedSourceHeight,
					sourceKind,
					sourceWidth: resolvedSourceWidth,
				});
			}
			return Reflect.apply(originalDrawImage, this, args);
		};
		traceWindow.__stickerExportRuntimeTraceInstalled = true;
	});
}

export async function readStickerSourceRuntimeFrameHashes({
	page,
	rootPath,
	samples,
	sourceReferences,
}: {
	page: Page;
	rootPath: string;
	samples: StratifiedStickerSample[];
	sourceReferences: ReadonlyMap<string, StratifiedStickerSourceReference>;
}): Promise<ReadonlyMap<string, string[]>> {
	const animatedSamples = samples.filter(
		({ mimeType }) => mimeType === "image/gif"
	);
	const entries = await Promise.all(
		animatedSamples.map(async (sample) => {
			const sourceReference = sourceReferences.get(sample.itemId);
			if (
				!sourceReference ||
				sourceReference.mimeType !== "image/gif" ||
				sourceReference.checksumSha256 !== sample.checksumSha256
			) {
				throw new Error(
					`Sticker ${sample.itemId} runtime descriptor source is incorrect`
				);
			}
			const descriptor = parseDirectGifRuntimeDescriptor({
				bytes: sourceReference.bytes,
			});
			if (descriptor.frames.length !== sample.frameCount) {
				throw new Error(
					`Sticker ${sample.itemId} runtime descriptor frame count is incorrect`
				);
			}
			const frameHashes = await page.evaluate(
				async ({
					batchId,
					checksumSha256,
					descriptor,
					frameCount,
					rootPath,
					stickerId,
				}) => {
					const stickerLab = window.electronAPI?.stickerLab;
					if (!stickerLab) throw new Error("Sticker Lab bridge is unavailable");
					const fingerprintSource = (window as StickerExportRuntimeTraceWindow)
						.__stickerExportRuntimeFingerprintSource;
					if (!fingerprintSource) {
						throw new Error(
							"Sticker export runtime fingerprinting is unavailable"
						);
					}
					if (typeof ImageDecoder === "undefined") {
						throw new Error("ImageDecoder is unavailable");
					}
					const reference = await stickerLab.readLocalReference({
						batchId,
						rootPath,
						stickerId,
					});
					if (
						reference.mimeType !== "image/gif" ||
						reference.checksumSha256 !== checksumSha256
					) {
						throw new Error(`Sticker ${stickerId} runtime source is incorrect`);
					}
					const decoder = new ImageDecoder({
						data: reference.bytes,
						type: reference.mimeType,
					});
					try {
						await decoder.tracks.ready;
						if (decoder.tracks.selectedTrack?.frameCount !== frameCount) {
							throw new Error(
								`Sticker ${stickerId} runtime frame count is incorrect`
							);
						}
						if (descriptor.frames.length !== frameCount) {
							throw new Error(
								`Sticker ${stickerId} descriptor frame count changed`
							);
						}
						const logicalCanvas = document.createElement("canvas");
						logicalCanvas.width = descriptor.canvasSize.width;
						logicalCanvas.height = descriptor.canvasSize.height;
						const logicalContext = logicalCanvas.getContext("2d", {
							willReadFrequently: true,
						});
						if (!logicalContext) {
							throw new Error(
								`Sticker ${stickerId} logical canvas is unavailable`
							);
						}
						const frameHashes: string[] = [];
						let previousFrameIndex: number | null = null;
						let restoreImage: ImageData | null = null;
						const decodeFrame = async (frameIndex: number): Promise<void> => {
							if (frameIndex >= frameCount) return;
							const frame = descriptor.frames[frameIndex];
							if (!frame) {
								throw new Error(
									`Sticker ${stickerId} descriptor frame is missing`
								);
							}
							const { complete, image } = await decoder.decode({
								completeFramesOnly: true,
								frameIndex,
							});
							try {
								if (!complete) {
									throw new Error(
										`Sticker ${stickerId} runtime frame is incomplete`
									);
								}
								if (previousFrameIndex !== null) {
									const previousFrame = descriptor.frames[previousFrameIndex];
									if (!previousFrame) {
										throw new Error(
											`Sticker ${stickerId} previous descriptor frame is missing`
										);
									}
									if (previousFrame.disposalMethod === 2) {
										logicalContext.clearRect(
											previousFrame.frameRect.x,
											previousFrame.frameRect.y,
											previousFrame.frameRect.width,
											previousFrame.frameRect.height
										);
									} else if (
										previousFrame.disposalMethod === 3 &&
										restoreImage
									) {
										logicalContext.putImageData(restoreImage, 0, 0);
									}
								}
								const nextRestoreImage =
									frame.disposalMethod === 3
										? logicalContext.getImageData(
												0,
												0,
												logicalCanvas.width,
												logicalCanvas.height
											)
										: null;
								const decoderReturnedLogicalScreen =
									image.displayWidth === logicalCanvas.width &&
									image.displayHeight === logicalCanvas.height;
								const target = decoderReturnedLogicalScreen
									? {
											height: logicalCanvas.height,
											width: logicalCanvas.width,
											x: 0,
											y: 0,
										}
									: frame.frameRect;
								logicalContext.drawImage(
									image,
									0,
									0,
									image.displayWidth,
									image.displayHeight,
									target.x,
									target.y,
									target.width,
									target.height
								);
								frameHashes.push(fingerprintSource(logicalCanvas).pixelHash);
								previousFrameIndex = frameIndex;
								restoreImage = nextRestoreImage;
							} finally {
								image.close();
							}
							return decodeFrame(frameIndex + 1);
						};
						await decodeFrame(0);
						return frameHashes;
					} finally {
						decoder.close();
					}
				},
				{
					batchId: sample.batchId,
					checksumSha256: sample.checksumSha256,
					descriptor,
					frameCount: sample.frameCount,
					rootPath,
					stickerId: sample.itemId,
				}
			);
			return [sample.itemId, frameHashes] as const;
		})
	);
	return new Map(entries);
}

export async function resetStickerExportRuntimeTrace({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		const trace = (window as StickerExportRuntimeTraceWindow)
			.__stickerExportRuntimeTrace;
		if (!trace) throw new Error("Sticker Lab export trace was not installed");
		trace.draws.length = 0;
		trace.outputFrameIndex = -1;
	});
}

export async function readRawStickerExportRuntimeDraws({
	page,
}: {
	page: Page;
}): Promise<StickerExportRuntimeDraw[]> {
	return page.evaluate(() => {
		const trace = (window as StickerExportRuntimeTraceWindow)
			.__stickerExportRuntimeTrace;
		if (!trace) throw new Error("Sticker Lab export trace was not installed");
		return trace.draws;
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
		draws: capturedTrace.draws.map((draw, fallbackOutputFrameIndex) => {
			const outputFrameIndex =
				draw.outputFrameIndex ?? fallbackOutputFrameIndex;
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
