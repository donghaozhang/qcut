import { drawPersonCutoutFrame } from "./person-cutout-canvas";
import { PersonCutoutClient } from "./person-cutout-client";
import type { PersonCutoutMaskOptions } from "./person-cutout-mask";
import {
	alphaMaskTrackingSample,
	type MediaMaskTrackingSample,
} from "@/lib/video/media-mask-tracking";

export type PersonCutoutExportSettings = PersonCutoutMaskOptions;

export interface PersonCutoutExportProgress {
	progress: number;
	status: string;
}

export interface PersonCutoutExportResult {
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
	settings: PersonCutoutExportSettings;
	onProgress?: (progress: PersonCutoutExportProgress) => void;
	signal?: AbortSignal;
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
	settings,
	onProgress,
	signal,
}: ExportPersonCutoutVideoOptions): Promise<PersonCutoutExportResult> {
	throwIfAborted(signal);
	onProgress?.({ progress: 0, status: "Reading source video..." });

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
		if (!videoTrack) throw new Error("The selected file has no video track");
		if (!(await videoTrack.canDecode())) {
			throw new Error("This video's codec cannot be decoded on this device");
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
			throw new Error("This device cannot encode VP9 or VP8 transparent video");
		}

		const outputCanvas = document.createElement("canvas");
		outputCanvas.width = width;
		outputCanvas.height = height;
		const sourceCanvas = document.createElement("canvas");
		sourceCanvas.width = width;
		sourceCanvas.height = height;
		const sourceContext = sourceCanvas.getContext("2d");
		if (!sourceContext) throw new Error("Unable to create video frame canvas");
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
						drawPersonCutoutFrame({
							outputCanvas,
							maskCanvas,
							source: sourceCanvas,
							mask,
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
				track.id === primaryAudioTrack?.id
					? { codec: "opus", bitrate: 128_000, forceTranscode: true }
					: { discard: true },
		});

		if (!conversion.isValid) {
			const videoFailure = conversion.discardedTracks.find(
				({ track }) => track.id === videoTrack.id
			);
			throw new Error(
				videoFailure
					? `Transparent video setup failed: ${videoFailure.reason}`
					: "Transparent video setup is not supported on this device"
			);
		}

		conversion.onProgress = (progress) => {
			onProgress?.({
				progress: Math.round(Math.min(0.98, progress) * 100),
				status: `Removing background... ${Math.round(progress * 100)}%`,
			});
		};
		abortHandler = () => void conversion?.cancel();
		signal?.addEventListener("abort", abortHandler, { once: true });

		onProgress?.({ progress: 1, status: "Loading local person model..." });
		await conversion.execute();
		throwIfAborted(signal);

		if (!target.buffer) {
			throw new Error("Transparent video encoder returned no output");
		}
		onProgress?.({ progress: 100, status: "Transparent video ready" });

		return {
			blob: new Blob([target.buffer], { type: "video/webm" }),
			duration,
			width,
			height,
			frameRate,
			frameCount,
			hasAudio: conversion.utilizedTracks.some(
				(track) => track.type === "audio"
			),
			codec,
			trackingSamples,
		};
	} finally {
		if (abortHandler) signal?.removeEventListener("abort", abortHandler);
		client.dispose();
		input.dispose();
	}
}
