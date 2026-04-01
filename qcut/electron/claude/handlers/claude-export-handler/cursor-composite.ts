/**
 * Cursor compositing for Electron CLI exports.
 *
 * Decodes video frames with FFmpeg, draws cursor overlay using @napi-rs/canvas,
 * and re-encodes via FFmpeg. Composites per-segment so telemetry timestamps
 * align correctly (each segment maps to its source recording's telemetry).
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
 * Check whether cursor compositing should run for this export.
 */
export function shouldCompositeCursor(
	settings: ResolvedExportSettings
): boolean {
	const cfg = settings.cursorConfig;
	if (!cfg) return false;
	return (
		(cfg.sway ?? 0) > 0 ||
		(cfg.motionBlur ?? 0) > 0 ||
		cfg.loopMode === true
	);
}

/**
 * Find cursor telemetry for a source file.
 * Checks sidecar next to the file and in QCut Recordings.
 */
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

/** Get video dimensions using ffprobe */
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

/**
 * Composite cursor onto a single encoded segment file.
 * Probes actual video dimensions and decodes/re-encodes at that resolution.
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
		claudeLog.warn(
			HANDLER,
			"@napi-rs/canvas not available, skipping cursor"
		);
		return;
	}

	// Probe actual video dimensions
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
	const cursorRadius = Math.max(6, Math.round(width / 200));

	claudeLog.info(
		HANDLER,
		`Compositing ${width}x${height} segment, ${points.length} cursor points, radius=${cursorRadius}`
	);

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
			let prevCursorX = -1;
			let prevCursorY = -1;

			const canvas = canvasLib.createCanvas(width, height) as {
				getContext: (type: string) => CanvasCtx;
			};
			const ctx = canvas.getContext("2d") as CanvasCtx;

			interface CanvasCtx {
				putImageData: (data: unknown, x: number, y: number) => void;
				beginPath: () => void;
				arc: (
					x: number,
					y: number,
					r: number,
					s: number,
					e: number
				) => void;
				fill: () => void;
				globalAlpha: number;
				fillStyle: string;
				getImageData: (
					x: number,
					y: number,
					w: number,
					h: number
				) => { data: Uint8ClampedArray };
			}

			decoder.stdout.on("data", (chunk: Buffer) => {
				buffer = Buffer.concat([buffer, chunk]);

				while (buffer.length >= frameSizeBytes) {
					const frameData = buffer.subarray(0, frameSizeBytes);
					buffer = buffer.subarray(frameSizeBytes);

					const timeMs = (frameIndex / fps) * 1000;
					const point = findPointAtTime(points, timeMs);

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
					ctx.putImageData(imageData, 0, 0);

					if (point) {
						const rx =
							(point.x - captureRect.x) / captureRect.width;
						const ry =
							(point.y - captureRect.y) / captureRect.height;
						let cursorX = rx * width;
						let cursorY = ry * height;

						if (swayAmount > 0 && prevCursorX >= 0) {
							const dx = cursorX - prevCursorX;
							const dy = cursorY - prevCursorY;
							const speed = Math.sqrt(dx * dx + dy * dy);
							const swayPhase = timeMs * 0.003;
							const swayMag =
								Math.min(speed * 0.15, 4) * swayAmount;
							cursorX += Math.sin(swayPhase) * swayMag;
							cursorY +=
								Math.cos(swayPhase * 1.3) * swayMag * 0.7;
						}

						if (
							cursorX >= -cursorRadius &&
							cursorX <= width + cursorRadius &&
							cursorY >= -cursorRadius &&
							cursorY <= height + cursorRadius
						) {
							// Motion blur ghost trail
							if (motionBlur > 0 && prevCursorX >= 0) {
								const dx = cursorX - prevCursorX;
								const dy = cursorY - prevCursorY;
								const dist = Math.sqrt(dx * dx + dy * dy);
								if (dist > 2) {
									const steps = Math.min(
										Math.floor(dist / 3),
										8
									);
									for (let s = 1; s <= steps; s++) {
										const t = s / (steps + 1);
										const gx = prevCursorX + dx * t;
										const gy = prevCursorY + dy * t;
										ctx.globalAlpha =
											(1 - t) * 0.3 * motionBlur;
										ctx.beginPath();
										ctx.arc(
											gx,
											gy,
											cursorRadius * 0.8,
											0,
											Math.PI * 2
										);
										ctx.fillStyle = "rgba(0,0,0,0.85)";
										ctx.fill();
									}
									ctx.globalAlpha = 1;
								}
							}

							// White border
							ctx.beginPath();
							ctx.arc(
								cursorX,
								cursorY,
								cursorRadius + 2,
								0,
								Math.PI * 2
							);
							ctx.fillStyle = "rgba(255,255,255,0.9)";
							ctx.fill();

							// Black dot
							ctx.beginPath();
							ctx.arc(
								cursorX,
								cursorY,
								cursorRadius,
								0,
								Math.PI * 2
							);
							ctx.fillStyle = "rgba(0,0,0,0.85)";
							ctx.fill();

							// Click highlight
							if (point.p) {
								ctx.globalAlpha = 0.25;
								ctx.beginPath();
								ctx.arc(
									cursorX,
									cursorY,
									cursorRadius * 4,
									0,
									Math.PI * 2
								);
								ctx.fillStyle = "rgba(59,130,246,0.5)";
								ctx.fill();
								ctx.globalAlpha = 1;
							}
						}

						prevCursorX = cursorX;
						prevCursorY = cursorY;
					}

					const composited = ctx.getImageData(0, 0, width, height);
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
 * Composite cursor overlay onto export segments that have telemetry.
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
			`Compositing cursor on segment ${i}: ${path.basename(segment.sourcePath)}`
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
				`Segment ${i} cursor compositing failed:`,
				err
			);
			// Non-fatal: continue without cursor for this segment
		}

		onProgress?.((i + 1) / segmentOutputs.length);
	}
}
