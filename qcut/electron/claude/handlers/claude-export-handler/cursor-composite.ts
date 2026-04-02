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
		zoom?.autoZoom === true
	);
}

/** Find cursor telemetry for a source file. */
async function findTelemetryForSource(
	sourcePath: string
): Promise<TelemetryData | null> {
	const searchPaths = [sourcePath];

	// Check platform-specific recordings folder
	const home = os.homedir();
	const platform = process.platform;
	const recordingsDir =
		platform === "darwin"
			? path.join(home, "Movies", "QCut Recordings")
			: platform === "win32"
				? path.join(home, "Videos", "QCut Recordings")
				: path.join(home, "Videos", "QCut Recordings");

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
	originalSourcePath,
	telemetry,
	settings,
	startTime,
	duration,
}: {
	segmentPath: string;
	/** Original source file at full resolution (for sharp zoom) */
	originalSourcePath: string;
	telemetry: TelemetryData;
	settings: ResolvedExportSettings;
	startTime: number;
	duration: number;
}): Promise<void> {
	// Dynamic import @napi-rs/canvas
	let canvasLib: {
		createCanvas: (w: number, h: number) => unknown;
		ImageData: new (data: Uint8ClampedArray, w: number, h?: number) => unknown;
	};
	try {
		const moduleName = "@napi-rs/canvas";
		canvasLib = (await import(moduleName)) as typeof canvasLib;
	} catch {
		claudeLog.warn(HANDLER, "@napi-rs/canvas not available");
		return;
	}

	// Probe ORIGINAL source for full-resolution decode (sharp zoom)
	const srcDims = await probeVideoDimensions(originalSourcePath);
	const outWidth = settings.width;
	const outHeight = settings.height;
	const srcWidth = srcDims?.width ?? outWidth;
	const srcHeight = srcDims?.height ?? outHeight;
	const { fps, codec, bitrate } = settings;
	const ffmpegPath = getFFmpegPath();
	const frameSizeBytes = srcWidth * srcHeight * 4;
	const outputTempPath = segmentPath + ".cursor-tmp.mp4";

	const { points, captureRect } = telemetry;
	const swayAmount = settings.cursorConfig?.sway ?? 0;
	const motionBlur = settings.cursorConfig?.motionBlur ?? 0;
	const autoZoom = settings.zoomConfig?.autoZoom ?? false;
	const cursorRadius = Math.max(12, Math.round(outWidth / 120));

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
		`Compositing src=${srcWidth}x${srcHeight} out=${outWidth}x${outHeight}: ${points.length} cursor pts, ${zoomRegions.length} zoom regions`
	);

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
			const decoderArgs = [
				...(startTime > 0 ? ["-ss", String(startTime)] : []),
				"-i",
				originalSourcePath,
				...(duration > 0 ? ["-t", String(duration)] : []),
				"-f",
				"rawvideo",
				"-pix_fmt",
				"rgba",
				"-s",
				`${srcWidth}x${srcHeight}`,
				"-v",
				"error",
				"pipe:1",
			];
			const decoder = spawn(ffmpegPath, decoderArgs, {
				stdio: ["ignore", "pipe", "pipe"],
			});

			// Encoder: include audio from original source via separate input
			const encoder = spawn(
				ffmpegPath,
				[
					"-y",
					"-f",
					"rawvideo",
					"-pix_fmt",
					"rgba",
					"-s",
					`${outWidth}x${outHeight}`,
					"-r",
					String(fps),
					"-i",
					"pipe:0",
					"-i",
					originalSourcePath,
					"-map",
					"0:v",
					"-map",
					"1:a?",
					"-c:v",
					codec,
					"-preset",
					"veryfast",
					"-b:v",
					parseBitrateForKbps({ bitrate }),
					"-pix_fmt",
					"yuv420p",
					"-c:a",
					"aac",
					"-b:a",
					"192k",
					"-shortest",
					"-movflags",
					"+faststart",
					outputTempPath,
				],
				{ stdio: ["pipe", "ignore", "pipe"] }
			);

			let frameIndex = 0;
			// Accumulate chunks in an array to avoid O(N^2) Buffer.concat
			const chunks: Buffer[] = [];
			let chunksLength = 0;

			// Source at FULL resolution, output at EXPORT resolution.
			const srcCanvas = canvasLib.createCanvas(srcWidth, srcHeight) as Canvas;
			const srcCtx = srcCanvas.getContext("2d") as CanvasCtx;
			const outCanvas = canvasLib.createCanvas(outWidth, outHeight) as Canvas;
			const outCtx = outCanvas.getContext("2d") as CanvasCtx;

			const processFrames = (): void => {
				while (chunksLength >= frameSizeBytes) {
					// Concatenate only when we have enough data
					const combined =
						chunks.length === 1
							? chunks[0]
							: Buffer.concat(chunks, chunksLength);
					const frameData = combined.subarray(0, frameSizeBytes);
					const remainder = combined.subarray(frameSizeBytes);
					chunks.length = 0;
					if (remainder.length > 0) {
						chunks.push(remainder);
					}
					chunksLength = remainder.length;

					const timeMs = (frameIndex / fps) * 1000;
					const dt = lastTimeMs >= 0 ? (timeMs - lastTimeMs) / 1000 : 0;
					lastTimeMs = timeMs;

					const point = findPointAtTime(points, timeMs);

					const clampedData = new Uint8ClampedArray(
						frameData.buffer,
						frameData.byteOffset,
						frameData.length
					);
					const imageData = new canvasLib.ImageData(
						clampedData,
						srcWidth,
						srcHeight
					);
					srcCtx.putImageData(imageData, 0, 0);

					const zoom = computeZoomTransform(
						timeMs,
						zoomRegions,
						outWidth,
						outHeight,
						connectedTransitions
					);

					outCtx.clearRect(0, 0, outWidth, outHeight);
					outCtx.save();

					if (zoom.scale > 1.001) {
						outCtx.translate(zoom.translateX, zoom.translateY);
						outCtx.scale(zoom.scale, zoom.scale);
					}

					outCtx.drawImage(
						srcCanvas,
						0,
						0,
						srcWidth,
						srcHeight,
						0,
						0,
						outWidth,
						outHeight
					);

					outCtx.restore();

					// 4. Draw cursor OUTSIDE zoom context (screen-space)
					if (point) {
						const rx = (point.x - captureRect.x) / captureRect.width;
						const ry = (point.y - captureRect.y) / captureRect.height;
						const rawX = Math.max(0, Math.min(outWidth, rx * outWidth));
						const rawY = Math.max(0, Math.min(outHeight, ry * outHeight));

						const SUB_STEPS = 8;
						const subDt = dt / SUB_STEPS;
						for (let s = 0; s < SUB_STEPS; s++) {
							springX = stepSpring(springX, rawX, springConfig, subDt);
							springY = stepSpring(springY, rawY, springConfig, subDt);
						}
						const cursorX = springX.value;
						const cursorY = springY.value;

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

						if (
							cursorX >= -cursorRadius * 2 &&
							cursorX <= outWidth + cursorRadius * 2 &&
							cursorY >= -cursorRadius * 2 &&
							cursorY <= outHeight + cursorRadius * 2
						) {
							if (motionBlur > 0 && prevSmoothedX >= 0) {
								const dx = cursorX - prevSmoothedX;
								const dy = cursorY - prevSmoothedY;
								const dist = Math.sqrt(dx * dx + dy * dy);
								if (dist > 2) {
									const steps = Math.min(Math.floor(dist / 3), 8);
									for (let s = 1; s <= steps; s++) {
										const t = s / (steps + 1);
										outCtx.globalAlpha = (1 - t) * 0.3 * motionBlur;
										outCtx.beginPath();
										outCtx.arc(
											prevSmoothedX + dx * t,
											prevSmoothedY + dy * t,
											cursorRadius * 0.8,
											0,
											Math.PI * 2
										);
										outCtx.fillStyle = "rgba(59,130,246,0.7)";
										outCtx.fill();
									}
									outCtx.globalAlpha = 1;
								}
							}

							outCtx.save();
							outCtx.translate(cursorX, cursorY);
							if (Math.abs(swayRotation) > 0.001) {
								outCtx.rotate(swayRotation);
							}

							outCtx.globalAlpha = 0.15;
							outCtx.beginPath();
							outCtx.arc(0, 0, cursorRadius * 3, 0, Math.PI * 2);
							outCtx.fillStyle = "rgba(59,130,246,1)";
							outCtx.fill();
							outCtx.globalAlpha = 1;

							outCtx.beginPath();
							outCtx.arc(0, 0, cursorRadius + 4, 0, Math.PI * 2);
							outCtx.fillStyle = "rgba(59,130,246,0.9)";
							outCtx.fill();

							outCtx.beginPath();
							outCtx.arc(0, 0, cursorRadius + 1, 0, Math.PI * 2);
							outCtx.fillStyle = "rgba(255,255,255,1)";
							outCtx.fill();

							outCtx.beginPath();
							outCtx.arc(0, 0, cursorRadius - 2, 0, Math.PI * 2);
							outCtx.fillStyle = "rgba(59,130,246,1)";
							outCtx.fill();

							outCtx.restore();

							if (point.p) {
								outCtx.globalAlpha = 0.35;
								outCtx.beginPath();
								outCtx.arc(cursorX, cursorY, cursorRadius * 5, 0, Math.PI * 2);
								outCtx.fillStyle = "rgba(59,130,246,0.6)";
								outCtx.fill();
								outCtx.globalAlpha = 1;
							}
						}

						prevSmoothedX = cursorX;
						prevSmoothedY = cursorY;
					}

					// Copy pixel data to avoid buffer reuse corruption
					const composited = outCtx.getImageData(0, 0, outWidth, outHeight);
					const outBuffer = Buffer.from(composited.data);

					const canWrite = encoder.stdin.write(outBuffer);
					if (!canWrite) {
						decoder.stdout.pause();
						encoder.stdin.once("drain", () => {
							decoder.stdout.resume();
						});
					}

					frameIndex++;
				}
			};

			decoder.stdout.on("data", (chunk: Buffer) => {
				chunks.push(chunk);
				chunksLength += chunk.length;
				processFrames();
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
					claudeLog.info(HANDLER, `Composited ${frameIndex} frames`);
					resolve();
				} else {
					reject(
						new Error(`Encoder failed (${code}): ${encoderErr.slice(-300)}`)
					);
				}
			});

			decoder.on("close", (code) => {
				if (code !== 0 && code !== null) {
					reject(
						new Error(`Decoder failed (${code}): ${decoderErr.slice(-300)}`)
					);
				}
			});

			const killBoth = () => {
				decoder.kill();
				encoder.kill();
			};
			encoder.on("error", (err) => {
				killBoth();
				reject(err);
			});
			decoder.on("error", (err) => {
				killBoth();
				reject(err);
			});
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
				originalSourcePath: segment.sourcePath,
				telemetry,
				settings,
				startTime: segment.startTime,
				duration: segment.duration,
			});
		} catch (err) {
			claudeLog.error(HANDLER, `Segment ${i} compositing failed:`, err);
		}

		onProgress?.((i + 1) / segmentOutputs.length);
	}
}
