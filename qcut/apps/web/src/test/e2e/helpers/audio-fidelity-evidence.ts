/**
 * Audio fidelity evidence for export tests.
 *
 * A faster audio pass is only a win if the samples are unchanged, so these
 * helpers read the properties an optimization must not move: stream facts
 * (sample rate, channels, duration), EBU R128 loudness, per-window RMS for
 * time alignment, and a sample-exact difference between two renders.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";

const execFileAsync = promisify(execFile);

export interface AudioStreamFacts {
	channels: number;
	codecName: string;
	durationSeconds: number;
	sampleRate: number;
}

/** Stream-level facts an export must preserve exactly. */
export async function probeAudioStream({
	filePath,
}: {
	filePath: string;
}): Promise<AudioStreamFacts> {
	const { stdout } = await execFileAsync(await getFFprobePath(), [
		"-v",
		"error",
		"-select_streams",
		"a:0",
		"-show_entries",
		"stream=codec_name,channels,sample_rate,duration:format=duration",
		"-of",
		"json",
		filePath,
	]);
	const probe = JSON.parse(stdout) as {
		format?: { duration?: string };
		streams?: Array<{
			channels?: number;
			codec_name?: string;
			duration?: string;
			sample_rate?: string;
		}>;
	};
	const stream = probe.streams?.[0];
	if (!stream) throw new Error(`No audio stream in ${filePath}`);
	return {
		channels: stream.channels ?? 0,
		codecName: stream.codec_name ?? "",
		durationSeconds: Number(stream.duration ?? probe.format?.duration ?? 0),
		sampleRate: Number(stream.sample_rate ?? 0),
	};
}

export interface LoudnessMeasurement {
	integratedLufs: number;
	truePeakDb: number;
}

/** EBU R128 integrated loudness and true peak, via ffmpeg's loudnorm pass. */
export async function measureLoudness({
	filePath,
}: {
	filePath: string;
}): Promise<LoudnessMeasurement> {
	const { stderr } = await execFileAsync(getFFmpegPath(), [
		"-hide_banner",
		"-nostats",
		"-i",
		filePath,
		"-af",
		"loudnorm=print_format=json",
		"-f",
		"null",
		"-",
	]);
	// loudnorm prints its JSON block last on stderr.
	const start = stderr.lastIndexOf("{");
	const end = stderr.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`Could not read loudness for ${filePath}`);
	}
	const parsed = JSON.parse(stderr.slice(start, end + 1)) as {
		input_i?: string;
		input_tp?: string;
	};
	return {
		integratedLufs: Number(parsed.input_i ?? Number.NaN),
		truePeakDb: Number(parsed.input_tp ?? Number.NaN),
	};
}

/**
 * Decodes the whole audio track to mono 48 kHz float samples.
 *
 * Used for alignment and sample-difference checks; a 6 s clip is ~288k floats,
 * which is small enough to hold in the test process.
 */
export async function decodeAudioSamples({
	filePath,
	sampleRate = 48_000,
}: {
	filePath: string;
	sampleRate?: number;
}): Promise<Float32Array> {
	const { stdout } = await execFileAsync(
		getFFmpegPath(),
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-map",
			"a:0",
			"-ac",
			"1",
			"-ar",
			String(sampleRate),
			"-f",
			"f32le",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
	);
	const bytes = stdout as unknown as Buffer;
	return new Float32Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	);
}

/** RMS per fixed-length window, the coarse shape used for time alignment. */
export function windowedRms({
	samples,
	windowSeconds = 0.25,
	sampleRate = 48_000,
}: {
	samples: Float32Array;
	windowSeconds?: number;
	sampleRate?: number;
}): number[] {
	const windowSize = Math.max(1, Math.round(windowSeconds * sampleRate));
	const windows: number[] = [];
	for (let start = 0; start < samples.length; start += windowSize) {
		const end = Math.min(samples.length, start + windowSize);
		let sum = 0;
		for (let index = start; index < end; index += 1) {
			sum += samples[index] * samples[index];
		}
		windows.push(Math.sqrt(sum / Math.max(1, end - start)));
	}
	return windows;
}

export interface SampleDifference {
	comparedSamples: number;
	maxAbsDiff: number;
	rmsDiff: number;
}

/**
 * Sample-exact difference between two renders of the same timeline.
 *
 * Both files go through the same decode, so an unchanged mix yields a
 * difference at the encoder's noise floor rather than an audible delta.
 */
export function compareAudioSamples({
	left,
	right,
}: {
	left: Float32Array;
	right: Float32Array;
}): SampleDifference {
	const comparedSamples = Math.min(left.length, right.length);
	let maxAbsDiff = 0;
	let sumSquares = 0;
	for (let index = 0; index < comparedSamples; index += 1) {
		const diff = left[index] - right[index];
		const absDiff = Math.abs(diff);
		if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;
		sumSquares += diff * diff;
	}
	return {
		comparedSamples,
		maxAbsDiff,
		rmsDiff: Math.sqrt(sumSquares / Math.max(1, comparedSamples)),
	};
}
