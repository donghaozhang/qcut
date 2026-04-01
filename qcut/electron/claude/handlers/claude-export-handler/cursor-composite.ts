/**
 * Cursor + zoom compositing for Electron CLI exports.
 *
 * Per-segment pipeline: FFmpeg decode → @napi-rs/canvas (zoom + cursor) → FFmpeg encode.
 * Uses a source canvas for raw frames and an output canvas for composited result,
 * because putImageData ignores canvas transforms (translate/scale).
 *
 * @module electron/claude/handlers/claude-export-handler/cursor-composite
 */

import { spawn, execFileSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as fsPromises from "node:fs/promises";
import { getFFmpegPath } from "../../../ffmpeg/utils.js";
import { getFFprobePath } from "../../../ffmpeg/utils.js";
import { claudeLog } from "../../utils/logger.js";
import { readCursorTelemetry } from "../../../screen-recording-handler/cursor-telemetry-io.js";
import type { ResolvedExportSettings, ExportSegment } from "./types.js";
import { parseBitrateForKbps } from "./utils.js";
import {
	analyzeForZoomSuggestions,
	computeZoomTransform,
	findConnectedTransitions,
	createSpringState,
	stepSpring,
	getCursorSpringConfig,
	computeCursorSwayRotation,
	type ZoomRegion,
	type SpringState,
} from "./zoom-utils.js";

const HANDLER = "CursorComposite";

interface CursorPoint {
	t: number;
	x: number;
	y: number;
	p: boolean;
}

interface CaptureRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface TelemetryData {
	points: CursorPoint[];
	captureRect: CaptureRect;
}

/**
 * Check whether enhancement compositing should run for this export.
 */
export function shouldCompositeCursor(
	settings: ResolvedExportSettings
): boolean {
	const cfg = settings.cursorConfig;
	const zoom = settings.zoomConfig;
	if (!cfg && !zoom) return false;
	return (
		(cfg?.sway ?? 0) > 0 ||
		(cfg?.motionBlur ?? 0) > 0 ||
		cfg?.loopMode === true ||
		zoom?.autoZoom === true
	);
}

/** Find cursor telemetry for a source file. */
async function findTelemetryForSource(
	sourcePath: string
): Promise<TelemetryData | null> {
	const searchPaths = [sourcePath];
	const home = os.homedir();
	const recordingsDir = path.join(home, "Movies", "QCut Recordings");
	const recordingsPath = path.join(recordingsDir, path.basename(sourcePath));
	if (recordingsPath !== sourcePath) {
		searchPaths.push(recordingsPath);
	}

	for (const p of searchPaths) {
		const telemetry = await readCursorTelemetry(p);
		if (telemetry && telemetry.points.length > 0) {
			return {
				points: telemetry.points,
				captureRect: telemetry.captureRect,
			};
		}
	}
	return null;
}

/** Get video dimensions using ffprobe. */
async function probeVideoDimensions(
	videoPath: string
): Promise<{ width: number; height: number } | null> {
	try {
		const ffprobePath = await getFFprobePath();
		const output = execFileSync(ffprobePath, [
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_streams",
			"-select_streams",
			"v:0",
			videoPath,
		]).toString();
		const data = JSON.parse(output);
		const stream = data.streams?.[0];
		if (stream?.width && stream?.height) {
			return { width: stream.width, height: stream.height };
		}
	} catch {
		// ignore
	}
	return null;
}

/** Binary search for the telemetry point at or before timeMs. */
function findPointAtTime(
	points: CursorPoint[],
	timeMs: number
): CursorPoint | null {
	if (points.length === 0 || timeMs < points[0].t) return null;
	let low = 0;
	let high = points.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (points[mid].t <= timeMs) low = mid;
		else high = mid - 1;
	}
	return points[low];
}

// ── Canvas type helpers (for @napi-rs/canvas) ───────────────────────

interface CanvasCtx {
	putImageData: (data: unknown, x: number, y: number) => void;
	drawImage: (
		src: unknown,
		sx: number,
		sy: number,
		sw: number,
		sh: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number
	) => void;
	beginPath: () => void;
	arc: (x: number, y: number, r: number, s: number, e: number) => void;
	fill: () => void;
	save: () => void;
	restore: () => void;
	translate: (x: number, y: number) => void;
	scale: (x: number, y: number) => void;
	rotate: (angle: number) => void;
	clearRect: (x: number, y: number, w: number, h: number) => void;
	globalAlpha: number;
	fillStyle: string;
	getImageData: (
		x: number,
		y: number,
		w: number,
		h: number
	) => { data: Uint8ClampedArray };
}

interface Canvas {
	getContext: (type: string) => CanvasCtx;
	width: number;
	height: number;
}

/**
 * Composite cursor + zoom onto a single encoded segment file.
 */
async function compositeSegmentCursor({
	segmentPath,
	telemetry,
	settings,
}: {
	segmentPath: string;
	telemetry: TelemetryData;
	settings: ResolvedExportSettings;
}): Promise<void> {
	// Dynamic import @napi-rs/canvas
	let canvasLib: {
		createCanvas: (w: number, h: number) => unknown;
		ImageData: new (
			data: Uint8ClampedArray,
			w: number,
			h?: number
		) => unknown;
	};
	try {
		const moduleName = "@napi-rs/canvas";
		canvasLib = (await import(moduleName)) as typeof canvasLib;
	} catch {
		claudeLog.warn(HANDLER, "@napi-rs/canvas not available");
		return;
	}

	const dims = await probeVideoDimensions(segmentPath);
	if (!dims) {
		claudeLog.warn(HANDLER, "Could not probe video dimensions");
		return;
	}

	const { width, height } = dims;
	const { fps, codec, bitrate } = settings;
	const ffmpegPath = getFFmpegPath();
	const frameSizeBytes = width * height * 4;
	const outputTempPath = segmentPath + ".cursor-tmp.mp4";

	const { points, captureRect } = telemetry;
	const swayAmount = settings.cursorConfig?.sway ?? 0;
	const motionBlur = settings.cursorConfig?.motionBlur ?? 0;
	const autoZoom = settings.zoomConfig?.autoZoom ?? false;
	const cursorRadius = Math.max(6, Math.round(width / 200));

	// Generate zoom regions from telemetry if auto-zoom is enabled
	let zoomRegions: ZoomRegion[] = [];
	if (autoZoom) {
		zoomRegions = analyzeForZoomSuggestions(points, captureRect);
		claudeLog.info(
			HANDLER,
			`Auto-zoom generated ${zoomRegions.length} region(s)`
		);
	}
	const connectedTransitions = findConnectedTransitions(zoomRegions);

	claudeLog.info(
		HANDLER,
		`Compositing ${width}x${height}: ${points.length} cursor pts, ${zoomRegions.length} zoom regions, radius=${cursorRadius}`
	);

	// Spring state for cursor smoothing
	let springX = createSpringState();
	let springY = createSpringState();
	let springRot = createSpringState();
	const springConfig = getCursorSpringConfig(0.18);
	const swaySpringConfig = {
		stiffness: springConfig.stiffness,
		damping: springConfig.damping * 0.9,
		mass: springConfig.mass * 0.8,
	};

	let prevRawX = -1;
	let prevRawY = -1;
	let prevSmoothedX = -1;
	let prevSmoothedY = -1;
	let lastTimeMs = -1;

	try {
		await new Promise<void>((resolve, reject) => {
			const decoder = spawn(
				ffmpegPath,
				[
					"-i",
					segmentPath,
					"-f",
					"rawvideo",
					"-pix_fmt",
					"rgba",
					"-s",
					`${width}x${height}`,
					"-v",
					"error",
					"pipe:1",
				],
				{ stdio: ["ignore", "pipe", "pipe"] }
			);

			const encoder = spawn(
				ffmpegPath,
				[
					"-y",
					"-f",
					"rawvideo",
					"-pix_fmt",
					"rgba",
					"-s",
					`${width}x${height}`,
					"-r",
					String(fps),
					"-i",
					"pipe:0",
					"-c:v",
					codec,
					"-preset",
					"veryfast",
					"-b:v",
					parseBitrateForKbps({ bitrate }),
					"-pix_fmt",
					"yuv420p",
					"-movflags",
					"+faststart",
					outputTempPath,
				],
				{ stdio: ["pipe", "ignore", "pipe"] }
			);

			let frameIndex = 0;
			let buffer = Buffer.alloc(0);

			// Two canvases: source (raw frame) and output (composited)
			// putImageData ignores transforms, so we draw raw → source canvas,
			// then drawImage source → output canvas with zoom transforms applied.
			const srcCanvas = canvasLib.createCanvas(width, height) as Canvas;
			const srcCtx = srcCanvas.getContext("2d") as CanvasCtx;
			const outCanvas = canvasLib.createCanvas(width, height) as Canvas;
			const outCtx = outCanvas.getContext("2d") as CanvasCtx;

			decoder.stdout.on("data", (chunk: Buffer) => {
				buffer = Buffer.concat([buffer, chunk]);

				while (buffer.length >= frameSizeBytes) {
					const frameData = buffer.subarray(0, frameSizeBytes);
					buffer = buffer.subarray(frameSizeBytes);

					const timeMs = (frameIndex / fps) * 1000;
					const dt =
						lastTimeMs >= 0 ? (timeMs - lastTimeMs) / 1000 : 0;
					lastTimeMs = timeMs;

					const point = findPointAtTime(points, timeMs);

					// 1. Put raw frame onto source canvas
					const clampedData = new Uint8ClampedArray(
						frameData.buffer,
						frameData.byteOffset,
						frameData.length
					);
					const imageData = new canvasLib.ImageData(
						clampedData,
						width,
						height
					);
					srcCtx.putImageData(imageData, 0, 0);

					// 2. Compute zoom transform
					const zoom = computeZoomTransform(
						timeMs,
						zoomRegions,
						width,
						height,
						connectedTransitions
					);

					// 3. Draw source → output with zoom transform
					outCtx.clearRect(0, 0, width, height);
					outCtx.save();

					if (zoom.scale > 1.001) {
						outCtx.translate(zoom.translateX, zoom.translateY);
						outCtx.scale(zoom.scale, zoom.scale);
					}

					outCtx.drawImage(
						srcCanvas,
						0,
						0,
						width,
						height,
						0,
						0,
						width,
						height
					);

					// 4. Draw cursor (inside zoom context)
					if (point) {
						const rx =
							(point.x - captureRect.x) / captureRect.width;
						const ry =
							(point.y - captureRect.y) / captureRect.height;
						const rawX = rx * width;
						const rawY = ry * height;

						// Spring smoothing
						springX = stepSpring(springX, rawX, springConfig, dt);
						springY = stepSpring(springY, rawY, springConfig, dt);
						let cursorX = springX.value;
						let cursorY = springY.value;

						// Sway rotation
						let swayRotation = 0;
						if (swayAmount > 0 && prevRawX >= 0) {
							const dxRaw = rawX - prevRawX;
							const dyRaw = rawY - prevRawY;
							const deltaMs = dt * 1000 || 33;
							const targetRot = computeCursorSwayRotation({
								dx: dxRaw,
								dy: dyRaw,
								deltaMs,
								sway: swayAmount,
							});
							springRot = stepSpring(
								springRot,
								targetRot,
								swaySpringConfig,
								dt
							);
							swayRotation = springRot.value;
						}
						prevRawX = rawX;
						prevRawY = rawY;

						// Draw cursor if within frame
						if (
							cursorX >= -cursorRadius * 2 &&
							cursorX <= width + cursorRadius * 2 &&
							cursorY >= -cursorRadius * 2 &&
							cursorY <= height + cursorRadius * 2
						) {
							// Motion blur ghost trail
							if (
								motionBlur > 0 &&
								prevSmoothedX >= 0
							) {
								const dx = cursorX - prevSmoothedX;
								const dy = cursorY - prevSmoothedY;
								const dist = Math.sqrt(
									dx * dx + dy * dy
								);
								if (dist > 2) {
									const steps = Math.min(
										Math.floor(dist / 3),
										8
									);
									for (let s = 1; s <= steps; s++) {
										const t = s / (steps + 1);
										outCtx.globalAlpha =
											(1 - t) * 0.3 * motionBlur;
										outCtx.beginPath();
										outCtx.arc(
											prevSmoothedX + dx * t,
											prevSmoothedY + dy * t,
											cursorRadius * 0.8,
											0,
											Math.PI * 2
										);
										outCtx.fillStyle =
											"rgba(0,0,0,0.85)";
										outCtx.fill();
									}
									outCtx.globalAlpha = 1;
								}
							}

							// Draw cursor with sway rotation
							outCtx.save();
							outCtx.translate(cursorX, cursorY);
							if (Math.abs(swayRotation) > 0.001) {
								outCtx.rotate(swayRotation);
							}

							// White border
							outCtx.beginPath();
							outCtx.arc(
								0,
								0,
								cursorRadius + 2,
								0,
								Math.PI * 2
							);
							outCtx.fillStyle = "rgba(255,255,255,0.9)";
							outCtx.fill();

							// Black dot
							outCtx.beginPath();
							outCtx.arc(0, 0, cursorRadius, 0, Math.PI * 2);
							outCtx.fillStyle = "rgba(0,0,0,0.85)";
							outCtx.fill();

							outCtx.restore();

							// Click highlight (outside rotation)
							if (point.p) {
								outCtx.globalAlpha = 0.25;
								outCtx.beginPath();
								outCtx.arc(
									cursorX,
									cursorY,
									cursorRadius * 4,
									0,
									Math.PI * 2
								);
								outCtx.fillStyle = "rgba(59,130,246,0.5)";
								outCtx.fill();
								outCtx.globalAlpha = 1;
							}
						}

						prevSmoothedX = cursorX;
						prevSmoothedY = cursorY;
					}

					outCtx.restore();

					// 5. Read composited frame and pipe to encoder
					const composited = outCtx.getImageData(
						0,
						0,
						width,
						height
					);
					const outBuffer = Buffer.from(composited.data.buffer);

					const canWrite = encoder.stdin.write(outBuffer);
					if (!canWrite) {
						decoder.stdout.pause();
						encoder.stdin.once("drain", () => {
							decoder.stdout.resume();
						});
					}

					frameIndex++;
				}
			});

			decoder.stdout.on("end", () => {
				encoder.stdin.end();
			});

			let decoderErr = "";
			decoder.stderr?.on("data", (c: Buffer) => {
				decoderErr += c.toString();
			});
			let encoderErr = "";
			encoder.stderr?.on("data", (c: Buffer) => {
				encoderErr += c.toString();
			});

			encoder.on("close", (code) => {
				if (code === 0) {
					claudeLog.info(
						HANDLER,
						`Composited ${frameIndex} frames`
					);
					resolve();
				} else {
					reject(
						new Error(
							`Encoder failed (${code}): ${encoderErr.slice(-300)}`
						)
					);
				}
			});

			decoder.on("close", (code) => {
				if (code !== 0 && code !== null) {
					reject(
						new Error(
							`Decoder failed (${code}): ${decoderErr.slice(-300)}`
						)
					);
				}
			});

			encoder.on("error", reject);
			decoder.on("error", reject);
		});

		await fsPromises.rename(outputTempPath, segmentPath);
	} catch (error) {
		try {
			await fsPromises.unlink(outputTempPath);
		} catch {
			/* ignore */
		}
		throw error;
	}
}

/**
 * Composite cursor + zoom onto export segments that have telemetry.
 * Called per-segment BEFORE concatenation so timestamps align correctly.
 */
export async function compositeCursorOnSegments({
	segmentOutputs,
	segments,
	settings,
	onProgress,
}: {
	segmentOutputs: string[];
	segments: ExportSegment[];
	settings: ResolvedExportSettings;
	onProgress?: (progress: number) => void;
}): Promise<void> {
	for (const [i, segOut] of segmentOutputs.entries()) {
		const segment = segments[i];
		if (!segment || segment.isImage) continue;

		const telemetry = await findTelemetryForSource(segment.sourcePath);
		if (!telemetry) continue;

		claudeLog.info(
			HANDLER,
			`Processing segment ${i}: ${path.basename(segment.sourcePath)}`
		);

		try {
			await compositeSegmentCursor({
				segmentPath: segOut,
				telemetry,
				settings,
			});
		} catch (err) {
			claudeLog.error(
				HANDLER,
				`Segment ${i} compositing failed:`,
				err
			);
		}

		onProgress?.((i + 1) / segmentOutputs.length);
	}
}
