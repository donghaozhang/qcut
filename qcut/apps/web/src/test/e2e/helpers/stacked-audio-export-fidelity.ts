/**
 * Real-export fidelity helpers for stacked reverb clips.
 *
 * The impulse cache is only safe if it changes nothing about the rendered
 * audio, so these helpers export a real timeline through the muxer engine and
 * reduce the decoded audio to a hash that can be compared across builds.
 *
 * The source clip is uncompressed PCM on purpose: lossy decoders are not
 * bit-reproducible across runs, which would make a sample-exact gate flaky for
 * reasons unrelated to the change under test.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export interface StackedAudioClipSpec {
	startTime: number;
	duration: number;
	reverb: { enabled: boolean; mix: number; roomSize: number; damping: number };
}

export interface StackedExportMeasurement {
	wallMs: number;
	outputPath: string;
}

export interface AudioFacts {
	codec: string;
	sampleRate: number;
	channels: number;
	durationSeconds: number;
}

/** Generates a deterministic uncompressed tone clip. */
export function generateToneClip({
	filePath,
	seconds,
	frequency,
}: {
	filePath: string;
	seconds: number;
	frequency: number;
}): string {
	mkdirSync(path.dirname(filePath), { recursive: true });
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			`sine=frequency=${frequency}:sample_rate=48000:duration=${seconds}`,
			"-ac",
			"2",
			"-c:a",
			"pcm_s16le",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

/** Reads the audio stream facts that must not change across the optimization. */
export function probeAudioFacts({
	filePath,
}: {
	filePath: string;
}): AudioFacts {
	const raw = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=codec_name,sample_rate,channels:format=duration",
			"-of",
			"json",
			filePath,
		],
		{ encoding: "utf8" }
	);
	const parsed = JSON.parse(raw) as {
		streams?: Array<{
			codec_name?: string;
			sample_rate?: string;
			channels?: number;
		}>;
		format?: { duration?: string };
	};
	const stream = parsed.streams?.[0];
	return {
		channels: stream?.channels ?? 0,
		codec: stream?.codec_name ?? "none",
		durationSeconds: Number(parsed.format?.duration ?? 0),
		sampleRate: Number(stream?.sample_rate ?? 0),
	};
}

/**
 * Decodes the exported audio to raw little-endian float samples and hashes
 * them, so two exports can be compared sample-for-sample.
 */
export function hashDecodedAudio({ filePath }: { filePath: string }): string {
	const pcm = execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-map",
			"a:0",
			"-f",
			"f32le",
			"-acodec",
			"pcm_f32le",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
	);
	return createHash("sha256").update(pcm).digest("hex");
}

/** Decodes one file to float samples. */
function decodeSamples({ filePath }: { filePath: string }): Float32Array {
	const pcm = execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-map",
			"a:0",
			"-f",
			"f32le",
			"-acodec",
			"pcm_f32le",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
	);
	return new Float32Array(
		pcm.buffer,
		pcm.byteOffset,
		Math.floor(pcm.byteLength / 4)
	);
}

/**
 * Compares two exports sample-for-sample.
 *
 * The muxer writes AAC, which is lossy and not bit-reproducible between runs,
 * so an exact hash cannot be the gate. Comparing a pair of exports from the
 * same build gives the encoder's own noise floor, and any code change must not
 * exceed it.
 */
export function compareDecodedAudio({
	leftPath,
	rightPath,
}: {
	leftPath: string;
	rightPath: string;
}): {
	identical: boolean;
	sampleCountMatch: boolean;
	maxAbsDiff: number;
	rmsDiff: number;
	diffDb: number;
} {
	const left = decodeSamples({ filePath: leftPath });
	const right = decodeSamples({ filePath: rightPath });
	const length = Math.min(left.length, right.length);
	let maxAbsDiff = 0;
	let sumSquares = 0;
	let identical = left.length === right.length;
	for (let index = 0; index < length; index += 1) {
		const diff = left[index] - right[index];
		if (diff !== 0) identical = false;
		const magnitude = Math.abs(diff);
		if (magnitude > maxAbsDiff) maxAbsDiff = magnitude;
		sumSquares += diff * diff;
	}
	const rmsDiff = length > 0 ? Math.sqrt(sumSquares / length) : 0;
	return {
		diffDb: rmsDiff > 0 ? 20 * Math.log10(rmsDiff) : Number.NEGATIVE_INFINITY,
		identical,
		maxAbsDiff,
		rmsDiff,
		sampleCountMatch: left.length === right.length,
	};
}

/** Peak and RMS of the decoded audio, as a loudness guard alongside the hash. */
export function measureAudioLevels({ filePath }: { filePath: string }): {
	peak: number;
	rms: number;
	sampleCount: number;
} {
	const pcm = execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-map",
			"a:0",
			"-f",
			"f32le",
			"-acodec",
			"pcm_f32le",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
	);
	const samples = new Float32Array(
		pcm.buffer,
		pcm.byteOffset,
		Math.floor(pcm.byteLength / 4)
	);
	let peak = 0;
	let sumSquares = 0;
	for (const sample of samples) {
		const magnitude = Math.abs(sample);
		if (magnitude > peak) peak = magnitude;
		sumSquares += sample * sample;
	}
	return {
		peak,
		rms: samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0,
		sampleCount: samples.length,
	};
}

/**
 * Replaces the timeline with `clips` copies of the imported audio item, each
 * carrying the requested reverb settings.
 */
export async function buildStackedReverbTimeline({
	page,
	clips,
}: {
	page: Page;
	clips: readonly StackedAudioClipSpec[];
}): Promise<number> {
	return await page.evaluate(
		async (clipSpecs) => {
			const globalWindow = window as unknown as {
				__timelineStore: { getState: () => any };
				__mediaStore: { getState: () => any };
			};
			const timeline = globalWindow.__timelineStore.getState();
			const media = globalWindow.__mediaStore.getState();
			const audioItem = media.mediaItems.find(
				(item: { type: string }) => item.type === "audio"
			);
			if (!audioItem) throw new Error("No audio media item was imported");

			for (const track of [...timeline.tracks]) {
				for (const element of [...track.elements]) {
					timeline.removeElementFromTrack(track.id, element.id);
				}
			}

			const trackId = timeline.addTrack("audio");
			for (const spec of clipSpecs) {
				globalWindow.__timelineStore.getState().addElementToTrack(trackId, {
					// The export path normalizes settings, so reverb alone would be
					// enough for rendering. The timeline task badge, however, reads
					// `element.audio?.<group>.status` without guarding the nested
					// object, so these idle status groups must be present or the
					// renderer throws while the clip is on screen.
					audio: {
						cover: { enabled: false, status: "idle" },
						denoise: {
							amount: 0,
							enabled: false,
							mode: "realtime",
							noiseFloorDb: -50,
							status: "idle",
						},
						loudness: {
							analysisStatus: "idle",
							enabled: false,
							loudnessRange: 11,
							targetLufs: -16,
							truePeakDb: -1.5,
						},
						lyrics: { status: "idle", text: "", words: [] },
						reverb: spec.reverb,
						separation: { enabled: false, status: "idle" },
						voiceConversion: { enabled: false, status: "idle" },
					},
					duration: spec.duration,
					mediaId: audioItem.id,
					name: "stacked-reverb-clip",
					startTime: spec.startTime,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				});
			}
			const state = globalWindow.__timelineStore.getState();
			return state.tracks.reduce(
				(total: number, track: { elements: unknown[] }) =>
					total + track.elements.length,
				0
			);
		},
		clips as unknown as StackedAudioClipSpec[]
	);
}
