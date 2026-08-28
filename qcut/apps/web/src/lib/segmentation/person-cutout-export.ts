import { drawPersonCutoutFrame } from "./person-cutout-canvas";
import { PersonCutoutClient } from "./person-cutout-client";
import type { PersonCutoutMaskOptions } from "./person-cutout-mask";
import {
	createCenterPersonFallbackAlpha,
	hasPersonMaskForeground,
} from "./person-cutout-mask";
import {
	alphaMaskTrackingSample,
	type MediaMaskTrackingSample,
} from "@/lib/video/media-mask-tracking";
import { exportJianyingPersonCutout } from "./jianying-person-cutout-client";
import type { TemattingBlendImplementation } from "@/types/electron/api-jianying-person-cutout";

export type PersonCutoutExportSettings = PersonCutoutMaskOptions;
export type PersonCutoutQuality = "basic" | "fine";

export interface PersonCutoutExportProgress {
	progress: number;
	status: string;
}

export interface PersonCutoutExportResult {
	blendImplementation?: TemattingBlendImplementation;
	blob: Blob;
	duration: number;
	width: number;
	height: number;
	frameRate: number;
	frameCount: number;
	hasAudio: boolean;
	codec: "vp9" | "vp8";
	trackingSamples: MediaMaskTrackingSample[];
}

interface ExportPersonCutoutVideoOptions {
	file: File;
	sourcePath?: string;
	settings: PersonCutoutExportSettings;
	quality?: PersonCutoutQuality;
	includeAudio?: boolean;
	absentPersonMode?: PersonCutoutAbsentMode;
	onProgress?: (progress: PersonCutoutExportProgress) => void;
	signal?: AbortSignal;
}

export type PersonCutoutAbsentMode = "transparent" | "full-frame" | "center";

function drawPersonFrameWithFallback({
	outputCanvas,
	maskCanvas,
	sourceCanvas,
	mask,
	absentPersonMode,
}: {
	outputCanvas: HTMLCanvasElement;
	maskCanvas: HTMLCanvasElement;
	sourceCanvas: HTMLCanvasElement;
	mask: Awaited<ReturnType<PersonCutoutClient["segment"]>>;
	absentPersonMode: PersonCutoutAbsentMode;
}) {
	if (hasPersonMaskForeground({ alpha: mask.alpha })) {
		drawPersonCutoutFrame({
			outputCanvas,
			maskCanvas,
			source: sourceCanvas,
			mask,
		});
		return;
	}
	const context = outputCanvas.getContext("2d");
	if (!context) throw new Error("Unable to create person export canvas");
	context.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
	if (absentPersonMode === "transparent") return;
	if (absentPersonMode === "full-frame") {
		context.drawImage(
			sourceCanvas,
			0,
			0,
			outputCanvas.width,
			outputCanvas.height
		);
		return;
	}
	drawPersonCutoutFrame({
		outputCanvas,
		maskCanvas,
		source: sourceCanvas,
		mask: {
			...mask,
			alpha: createCenterPersonFallbackAlpha({
				width: mask.width,
				height: mask.height,
			}),
		},
	});
}

function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) {
		throw new DOMException("Person cutout export was canceled", "AbortError");
	}
}

export function getPersonCutoutVideoBitrate({
	width,
	height,
	frameRate,
}: {
	width: number;
	height: number;
	frameRate: number;
}): number {
	const estimated = width * height * Math.min(60, frameRate) * 0.12;
	return Math.round(Math.min(24_000_000, Math.max(4_000_000, estimated)));
}

export async function exportPersonCutoutVideo({
	file,
	sourcePath,
	settings,
	quality = "basic",
	includeAudio = true,
	absentPersonMode = "transparent",
	onProgress,
	signal,
}: ExportPersonCutoutVideoOptions): Promise<PersonCutoutExportResult> {
	if (quality === "fine") {
		return exportJianyingPersonCutout({
			file,
			sourcePath,
			settings,
			onProgress,
			signal,
		});
	}
	throwIfAborted(signal);
	onProgress?.({ progress: 0, status: "正在读取视频..." });

	const {
		ALL_FORMATS,
		BlobSource,
		BufferTarget,
		Conversion,
		Input,
		Output,
		WebMOutputFormat,
		canEncodeVideo,
	} = await import("mediabunny");

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	const client = new PersonCutoutClient();
	let conversion: Awaited<ReturnType<typeof Conversion.init>> | null = null;
	let abortHandler: (() => void) | null = null;

	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error("所选文件没有视频画面");
		if (!(await videoTrack.canDecode())) {
			throw new Error("这段视频暂时无法在本机解码");
		}

		const width = videoTrack.displayWidth;
		const height = videoTrack.displayHeight;
		const [durationEnd, firstTimestamp, packetStats] = await Promise.all([
			videoTrack.computeDuration(),
			videoTrack.getFirstTimestamp(),
			videoTrack.computePacketStats(120),
		]);
		const duration = Math.max(0, durationEnd - Math.max(0, firstTimestamp));
		const frameRate = Math.min(
			60,
			Math.max(1, packetStats.averagePacketRate || 30)
		);
		const bitrate = getPersonCutoutVideoBitrate({
			width,
			height,
			frameRate,
		});

		let codec: "vp9" | "vp8" | null = null;
		for (const candidate of ["vp9", "vp8"] as const) {
			if (
				await canEncodeVideo(candidate, {
					width,
					height,
					bitrate,
					alpha: "keep",
				})
			) {
				codec = candidate;
				break;
			}
		}
		if (!codec) {
			throw new Error("本机暂时无法生成透明视频");
		}

		const outputCanvas = document.createElement("canvas");
		outputCanvas.width = width;
		outputCanvas.height = height;
		const sourceCanvas = document.createElement("canvas");
		sourceCanvas.width = width;
		sourceCanvas.height = height;
		const sourceContext = sourceCanvas.getContext("2d");
		if (!sourceContext) throw new Error("无法准备视频画面");
		const maskCanvas = document.createElement("canvas");

		const target = new BufferTarget();
		const output = new Output({
			format: new WebMOutputFormat(),
			target,
		});
		const primaryAudioTrack = await input.getPrimaryAudioTrack();
		let frameCount = 0;
		const trackingSamples: MediaMaskTrackingSample[] = [];

		conversion = await Conversion.init({
			input,
			output,
			showWarnings: false,
			video: (track) => {
				if (track.id !== videoTrack.id) return { discard: true };
				return {
					codec,
					bitrate,
					alpha: "keep",
					forceTranscode: true,
					hardwareAcceleration: "no-preference",
					processedWidth: width,
					processedHeight: height,
					process: async (sample) => {
						throwIfAborted(signal);
						sourceContext.clearRect(0, 0, width, height);
						sample.draw(sourceContext, 0, 0, width, height);
						const frame = await createImageBitmap(sourceCanvas);
						const mask = await client.segment({
							frame,
							sourceTimestampMs: sample.timestamp * 1000,
							options: settings,
						});
						drawPersonFrameWithFallback({
							outputCanvas,
							maskCanvas,
							sourceCanvas,
							mask,
							absentPersonMode,
						});
						const trackingSample = alphaMaskTrackingSample({
							alpha: mask.alpha,
							width: mask.width,
							height: mask.height,
							frame: Math.max(
								0,
								Math.round((sample.timestamp - firstTimestamp) * frameRate)
							),
						});
						if (trackingSample) trackingSamples.push(trackingSample);
						frameCount += 1;
						return outputCanvas;
					},
				};
			},
			audio: (track) =>
				includeAudio && track.id === primaryAudioTrack?.id
					? { codec: "opus", bitrate: 128_000, forceTranscode: true }
					: { discard: true },
		});

		if (!conversion.isValid) {
			const videoFailure = conversion.discardedTracks.find(
				({ track }) => track.id === videoTrack.id
			);
			throw new Error(
				videoFailure
					? `透明视频准备失败：${videoFailure.reason}`
					: "本机暂不支持透明视频"
			);
		}

		conversion.onProgress = (progress) => {
			onProgress?.({
				progress: Math.round(Math.min(0.98, progress) * 100),
				status: `正在抠除背景... ${Math.round(progress * 100)}%`,
			});
		};
		abortHandler = () => void conversion?.cancel();
		signal?.addEventListener("abort", abortHandler, { once: true });

		onProgress?.({ progress: 1, status: "正在加载人物抠像..." });
		await conversion.execute();
		throwIfAborted(signal);

		if (!target.buffer) {
			throw new Error("透明视频没有生成结果");
		}
		onProgress?.({ progress: 100, status: "人物抠像已完成" });

		return {
			blob: new Blob([target.buffer], { type: "video/webm" }),
			duration,
			width,
			height,
			frameRate,
			frameCount,
			hasAudio:
				includeAudio &&
				conversion.utilizedTracks.some((track) => track.type === "audio"),
			codec,
			trackingSamples,
		};
	} finally {
		if (abortHandler) signal?.removeEventListener("abort", abortHandler);
		client.dispose();
		input.dispose();
	}
}

function canvasBlob({
	canvas,
	type,
}: {
	canvas: HTMLCanvasElement;
	type: string;
}): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(blob);
				return;
			}
			reject(new Error("Person cutout image encoder returned no output"));
		}, type);
	});
}

export async function exportPersonCutoutImage({
	file,
	settings,
	absentPersonMode = "transparent",
}: {
	file: File;
	settings: PersonCutoutExportSettings;
	absentPersonMode?: PersonCutoutAbsentMode;
}): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const sourceCanvas = document.createElement("canvas");
	sourceCanvas.width = bitmap.width;
	sourceCanvas.height = bitmap.height;
	const sourceContext = sourceCanvas.getContext("2d");
	if (!sourceContext) throw new Error("Unable to create person image canvas");
	sourceContext.drawImage(bitmap, 0, 0);
	bitmap.close();
	const client = new PersonCutoutClient();
	try {
		const frame = await createImageBitmap(sourceCanvas);
		const mask = await client.segment({
			frame,
			sourceTimestampMs: 0,
			options: settings,
		});
		const outputCanvas = document.createElement("canvas");
		outputCanvas.width = sourceCanvas.width;
		outputCanvas.height = sourceCanvas.height;
		const maskCanvas = document.createElement("canvas");
		drawPersonFrameWithFallback({
			outputCanvas,
			maskCanvas,
			sourceCanvas,
			mask,
			absentPersonMode,
		});
		return canvasBlob({ canvas: outputCanvas, type: "image/png" });
	} finally {
		client.dispose();
	}
}
