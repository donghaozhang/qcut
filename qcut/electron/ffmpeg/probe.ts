/**
 * FFmpeg Video Probing & Normalization
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import type { VideoProbeResult, FFmpegProgress } from "./types";
import { getFFmpegPath, getFFprobePath } from "./paths";
import { debugWarn } from "./constants";
import { parseProgress } from "./progress";

/**
 * Probes a video file to extract codec information using ffprobe.
 */
export async function probeVideoFile(
	videoPath: string
): Promise<VideoProbeResult> {
	const ffprobePath = await getFFprobePath();

	return new Promise<VideoProbeResult>((resolve, reject) => {
		const args = [
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_streams",
			videoPath,
		];

		const ffprobe = spawn(ffprobePath, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const timeoutId = setTimeout(() => {
			ffprobe.kill();
			reject(new Error(`ffprobe timeout for: ${videoPath}`));
		}, 10_000);

		let stdout = "";
		let stderr = "";

		ffprobe.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		ffprobe.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		ffprobe.on("close", (code) => {
			clearTimeout(timeoutId);

			if (code !== 0) {
				reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
				return;
			}

			try {
				const probeData = JSON.parse(stdout);
				const videoStream = probeData.streams?.find(
					(s: any) => s.codec_type === "video"
				);

				if (!videoStream) {
					reject(new Error(`No video stream found in: ${videoPath}`));
					return;
				}

				const hasAudio = probeData.streams?.some(
					(s: any) => s.codec_type === "audio"
				);

				resolve({
					path: videoPath,
					codec: videoStream.codec_name,
					width: videoStream.width,
					height: videoStream.height,
					pix_fmt: videoStream.pix_fmt,
					fps: videoStream.r_frame_rate,
					hasAudio: !!hasAudio,
				});
			} catch (parseErr: any) {
				reject(
					new Error(`Failed to parse ffprobe output: ${parseErr.message}`)
				);
			}
		});

		ffprobe.on("error", (err) => {
			clearTimeout(timeoutId);
			reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
		});
	});
}

/** Returns whether a media file contains at least one decodable audio stream. */
export async function probeHasAudioStream({
	mediaPath,
}: {
	mediaPath: string;
}): Promise<boolean> {
	const ffprobePath = await getFFprobePath();

	return new Promise<boolean>((resolve, reject) => {
		const ffprobe = spawn(
			ffprobePath,
			[
				"-v",
				"error",
				"-select_streams",
				"a:0",
				"-show_entries",
				"stream=index",
				"-of",
				"csv=p=0",
				mediaPath,
			],
			{
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timeoutId = setTimeout(() => {
			ffprobe.kill();
			finish({ error: new Error(`ffprobe timeout for: ${mediaPath}`) });
		}, 10_000);
		const finish = ({
			error,
			hasAudio,
		}: {
			error?: Error;
			hasAudio?: boolean;
		}) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			if (error) {
				reject(error);
				return;
			}
			resolve(hasAudio === true);
		};

		ffprobe.stdout?.on("data", (data) => {
			stdout += data.toString();
		});
		ffprobe.stderr?.on("data", (data) => {
			stderr += data.toString();
		});
		ffprobe.on("close", (code) => {
			if (code !== 0) {
				finish({
					error: new Error(
						`ffprobe failed with code ${code}: ${stderr.trim()}`
					),
				});
				return;
			}
			finish({ hasAudio: stdout.trim().length > 0 });
		});
		ffprobe.on("error", (error) => {
			finish({ error: new Error(`Failed to spawn ffprobe: ${error.message}`) });
		});
	});
}

/**
 * Normalize a single video to target resolution and fps using FFmpeg padding.
 */
export async function normalizeVideo(
	inputPath: string,
	outputPath: string,
	targetWidth: number,
	targetHeight: number,
	targetFps: number,
	duration: number,
	trimStart = 0,
	trimEnd = 0,
	onProgress?: (progress: FFmpegProgress) => void
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		console.log(
			"⚡ [MODE 1.5 NORMALIZE] ============================================"
		);
		console.log("⚡ [MODE 1.5 NORMALIZE] Starting video normalization...");
		console.log(`⚡ [MODE 1.5 NORMALIZE] Input: ${path.basename(inputPath)}`);
		console.log(`⚡ [MODE 1.5 NORMALIZE] Output: ${path.basename(outputPath)}`);
		console.log(
			`⚡ [MODE 1.5 NORMALIZE] Target: ${targetWidth}x${targetHeight} @ ${targetFps}fps`
		);
		console.log("⚡ [MODE 1.5 NORMALIZE] 📏 DURATION CHECK:");
		console.log(
			`⚡ [MODE 1.5 NORMALIZE]   - Input duration parameter: ${duration}s (this is what should be preserved)`
		);
		console.log(`⚡ [MODE 1.5 NORMALIZE]   - Trim start: ${trimStart}s`);
		console.log(`⚡ [MODE 1.5 NORMALIZE]   - Trim end: ${trimEnd}s`);

		const effectiveDuration = duration - trimStart - trimEnd;
		console.log(
			`⚡ [MODE 1.5 NORMALIZE]   - Calculated effective duration: ${effectiveDuration}s`
		);
		console.log(
			"⚡ [MODE 1.5 NORMALIZE]   - This will be set with FFmpeg -t parameter"
		);

		if (!fs.existsSync(inputPath)) {
			const error = `Video source not found: ${inputPath}`;
			console.error(`❌ [MODE 1.5 NORMALIZE] ${error}`);
			reject(new Error(error));
			return;
		}

		const filterChain = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`;
		console.log(`⚡ [MODE 1.5 NORMALIZE] Filter chain: ${filterChain}`);

		const args: string[] = ["-y"];

		if (trimStart && trimStart > 0) {
			args.push("-ss", trimStart.toString());
			console.log(
				`⚡ [MODE 1.5 NORMALIZE] Applying input seek: -ss ${trimStart}s`
			);
		}

		args.push("-i", inputPath);

		if (effectiveDuration > 0) {
			args.push("-t", effectiveDuration.toString());
			console.log(
				`⚡ [MODE 1.5 NORMALIZE] Setting output duration: -t ${effectiveDuration}s`
			);
		} else {
			console.warn(
				`⚠️ [MODE 1.5 NORMALIZE] Invalid effective duration: ${effectiveDuration}s, skipping duration parameter`
			);
		}

		args.push("-vf", filterChain);
		args.push("-r", targetFps.toString());
		args.push(
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p"
		);

		console.log(
			"🎧 [MODE 1.5 NORMALIZE] Transcoding audio to AAC 48kHz stereo for compatibility..."
		);
		args.push("-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2");
		args.push("-af", "aresample=async=1");
		args.push(outputPath);

		console.log(
			`⚡ [MODE 1.5 NORMALIZE] FFmpeg command: ffmpeg ${args.join(" ")}`
		);
		console.log("⚡ [MODE 1.5 NORMALIZE] Starting FFmpeg process...");

		const ffmpegPath = getFFmpegPath();

		const ffmpegProcess = spawn(ffmpegPath, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderrOutput = "";
		let stdoutOutput = "";

		ffmpegProcess.stdout?.on("data", (chunk: Buffer) => {
			stdoutOutput += chunk.toString();
		});

		ffmpegProcess.stderr?.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderrOutput += text;

			const progress = parseProgress(text);
			if (progress) {
				onProgress?.(progress);
				const frame = progress.frame ?? "?";
				const time = progress.time ?? "?";
				process.stdout.write(
					`⚡ [MODE 1.5 NORMALIZE] Progress: frame=${frame} time=${time}\r`
				);
			}
		});

		ffmpegProcess.on("close", (code: number | null) => {
			process.stdout.write("\n");

			if (code === 0) {
				if (fs.existsSync(outputPath)) {
					const stats = fs.statSync(outputPath);
					console.log(
						`⚡ [MODE 1.5 NORMALIZE] ✅ Normalization complete: ${path.basename(outputPath)}`
					);
					console.log(
						`⚡ [MODE 1.5 NORMALIZE] Output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
					);

					verifyOutputDuration(outputPath, effectiveDuration)
						.then(() => resolve())
						.catch((err) => {
							debugWarn(
								"Duration verification failed:",
								err instanceof Error ? err.message : String(err)
							);
							resolve();
						});
				} else {
					const error = `Output file not created: ${outputPath}`;
					console.error(`❌ [MODE 1.5 NORMALIZE] ${error}`);
					reject(new Error(error));
				}
			} else {
				console.error(
					`❌ [MODE 1.5 NORMALIZE] Normalization failed with code ${code}`
				);
				console.error(
					`❌ [MODE 1.5 NORMALIZE] FFmpeg stderr:\n${stderrOutput}`
				);
				console.error(
					"❌ [MODE 1.5 NORMALIZE] ============================================"
				);
				reject(new Error(`FFmpeg normalization failed with code ${code}`));
			}
		});

		ffmpegProcess.on("error", (error: Error) => {
			console.error("❌ [MODE 1.5 NORMALIZE] FFmpeg process error:", error);
			console.error(
				"❌ [MODE 1.5 NORMALIZE] ============================================"
			);
			reject(error);
		});
	});
}

/**
 * Verify output video duration matches expected duration.
 */
async function verifyOutputDuration(
	outputPath: string,
	expectedDuration: number
): Promise<void> {
	console.log("⚡ [MODE 1.5 NORMALIZE] 📏 VERIFYING OUTPUT DURATION...");
	const ffprobePath = await getFFprobePath();

	return new Promise<void>((resolve) => {
		const probeProcess = spawn(
			ffprobePath,
			[
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"default=noprint_wrappers=1:nokey=1",
				outputPath,
			],
			{
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			}
		);

		let actualDuration = "";
		probeProcess.stdout?.on("data", (chunk: Buffer) => {
			actualDuration += chunk.toString().trim();
		});

		probeProcess.on("close", (probeCode: number | null) => {
			if (probeCode === 0 && actualDuration) {
				const actualDurationFloat = parseFloat(actualDuration);
				console.log(
					`⚡ [MODE 1.5 NORMALIZE]   - Expected duration: ${expectedDuration}s`
				);
				console.log(
					`⚡ [MODE 1.5 NORMALIZE]   - Actual duration: ${actualDurationFloat.toFixed(2)}s`
				);
				const difference = Math.abs(actualDurationFloat - expectedDuration);
				if (difference > 0.1) {
					console.warn(
						`⚠️ [MODE 1.5 NORMALIZE]   - DURATION MISMATCH: Difference of ${difference.toFixed(2)}s detected!`
					);
				} else {
					console.log(
						"⚡ [MODE 1.5 NORMALIZE]   - ✅ Duration preserved correctly (within 0.1s tolerance)"
					);
				}
			} else {
				console.log(
					"⚡ [MODE 1.5 NORMALIZE]   - Could not verify actual duration (ffprobe unavailable)"
				);
			}
			console.log(
				"⚡ [MODE 1.5 NORMALIZE] ============================================"
			);
			resolve();
		});

		probeProcess.on("error", () => {
			console.log(
				"⚡ [MODE 1.5 NORMALIZE]   - Could not verify actual duration (ffprobe error)"
			);
			console.log(
				"⚡ [MODE 1.5 NORMALIZE] ============================================"
			);
			resolve();
		});
	});
}
