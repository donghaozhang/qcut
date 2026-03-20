/**
 * Claude Beat Detection Handler
 *
 * Decodes audio via FFmpeg and runs beat detection in the main process.
 * The beat detection algorithm is inlined here (from @qcut/editor-core)
 * because the electron build cannot import from packages/ at runtime.
 *
 * @module electron/claude/handlers/claude-beats-handler
 */

import { spawn } from "child_process";
import { getFFmpegPath } from "../../ffmpeg/utils.js";
import { getMediaInfo } from "./claude-media-handler.js";
import { claudeLog } from "../utils/logger.js";

const LOG_PREFIX = "BeatDetection";
const SAMPLE_RATE = 44100;

// ---------------------------------------------------------------------------
// Types (mirrors @qcut/editor-core/audio/beat-types)
// ---------------------------------------------------------------------------

interface Beat {
	timestamp: number;
	strength: number;
	index: number;
	isDownbeat: boolean;
}

interface BeatDetectionConfig {
	windowSize?: number;
	smoothingFactor?: number;
	thresholdMultiplier?: number;
	minBeatInterval?: number;
	beatsPerMeasure?: number;
}

interface BeatDetectionResult {
	bpm: number;
	confidence: number;
	beats: Beat[];
	downbeats: number[];
	duration: number;
}

interface ResolvedConfig {
	windowSize: number;
	smoothingFactor: number;
	thresholdMultiplier: number;
	minBeatInterval: number;
	beatsPerMeasure: number;
}

// ---------------------------------------------------------------------------
// Beat detection engine (inlined from @qcut/editor-core/audio)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ResolvedConfig = {
	windowSize: 1024,
	smoothingFactor: 0.8,
	thresholdMultiplier: 1.5,
	minBeatInterval: 0.2,
	beatsPerMeasure: 4,
};

function resolveConfig(config?: BeatDetectionConfig): ResolvedConfig {
	return { ...DEFAULT_CONFIG, ...config };
}

function calculateRMSEnergy(
	samples: Float32Array,
	windowSize: number
): Float64Array {
	const numWindows = Math.floor(samples.length / windowSize);
	if (numWindows === 0) return new Float64Array(0);
	const energy = new Float64Array(numWindows);
	for (let i = 0; i < numWindows; i++) {
		const offset = i * windowSize;
		let sumSquares = 0;
		for (let j = 0; j < windowSize; j++) {
			const sample = samples[offset + j];
			sumSquares += sample * sample;
		}
		energy[i] = Math.sqrt(sumSquares / windowSize);
	}
	return energy;
}

function smoothEnergy(
	energy: Float64Array,
	smoothingFactor: number
): Float64Array {
	const smoothed = new Float64Array(energy.length);
	if (energy.length === 0) return smoothed;
	smoothed[0] = energy[0];
	for (let i = 1; i < energy.length; i++) {
		smoothed[i] =
			smoothingFactor * smoothed[i - 1] + (1 - smoothingFactor) * energy[i];
	}
	return smoothed;
}

function computeAdaptiveThreshold(
	energy: Float64Array,
	multiplier: number
): Float64Array {
	const threshold = new Float64Array(energy.length);
	const halfWindow = 21;
	for (let i = 0; i < energy.length; i++) {
		const start = Math.max(0, i - halfWindow);
		const end = Math.min(energy.length, i + halfWindow + 1);
		let sum = 0;
		for (let j = start; j < end; j++) {
			sum += energy[j];
		}
		threshold[i] = (sum / (end - start)) * multiplier;
	}
	return threshold;
}

function detectPeaks(
	energy: Float64Array,
	threshold: Float64Array,
	windowSize: number,
	sampleRate: number,
	minBeatInterval: number
): Array<{ timestamp: number; strength: number }> {
	const peaks: Array<{ timestamp: number; strength: number }> = [];
	const minSamplesBetween = Math.floor(
		(minBeatInterval * sampleRate) / windowSize
	);
	let maxEnergy = 0;
	for (let i = 0; i < energy.length; i++) {
		if (energy[i] > maxEnergy) maxEnergy = energy[i];
	}
	if (maxEnergy === 0) return peaks;

	let lastPeakIndex = -minSamplesBetween;
	for (let i = 1; i < energy.length - 1; i++) {
		if (
			energy[i] > threshold[i] &&
			energy[i] > energy[i - 1] &&
			energy[i] >= energy[i + 1] &&
			i - lastPeakIndex >= minSamplesBetween
		) {
			peaks.push({
				timestamp: (i * windowSize) / sampleRate,
				strength: energy[i] / maxEnergy,
			});
			lastPeakIndex = i;
		}
	}
	return peaks;
}

function estimateBPM(beats: Array<{ timestamp: number }>): {
	bpm: number;
	confidence: number;
} {
	if (beats.length < 2) return { bpm: 0, confidence: 0 };
	const intervals: number[] = [];
	for (let i = 1; i < beats.length; i++) {
		const interval = beats[i].timestamp - beats[i - 1].timestamp;
		if (interval > 0.2 && interval < 2.0) {
			intervals.push(interval);
		}
	}
	if (intervals.length === 0) return { bpm: 0, confidence: 0 };

	intervals.sort((a, b) => a - b);
	const medianInterval = intervals[Math.floor(intervals.length / 2)];
	const bpm = 60 / medianInterval;

	const tolerance = medianInterval * 0.1;
	let matchCount = 0;
	for (const interval of intervals) {
		if (Math.abs(interval - medianInterval) <= tolerance) {
			matchCount++;
		}
	}
	const confidence = Math.min(1, matchCount / intervals.length);
	return { bpm: Math.round(bpm * 10) / 10, confidence };
}

function analyzeFromSamples(
	samples: Float32Array,
	sampleRate: number,
	config?: BeatDetectionConfig
): BeatDetectionResult {
	const cfg = resolveConfig(config);
	const duration = samples.length / sampleRate;

	if (samples.length < cfg.windowSize * 3) {
		return { bpm: 0, confidence: 0, beats: [], downbeats: [], duration };
	}

	const energy = calculateRMSEnergy(samples, cfg.windowSize);
	const smoothed = smoothEnergy(energy, cfg.smoothingFactor);
	const threshold = computeAdaptiveThreshold(smoothed, cfg.thresholdMultiplier);
	const rawPeaks = detectPeaks(
		smoothed,
		threshold,
		cfg.windowSize,
		sampleRate,
		cfg.minBeatInterval
	);
	const { bpm, confidence } = estimateBPM(rawPeaks);

	const beats: Beat[] = rawPeaks.map((peak, index) => ({
		timestamp: peak.timestamp,
		strength: peak.strength,
		index,
		isDownbeat: index % cfg.beatsPerMeasure === 0,
	}));

	const downbeats = beats.filter((b) => b.isDownbeat).map((b) => b.timestamp);
	return { bpm, confidence, beats, downbeats, duration };
}

// ---------------------------------------------------------------------------
// FFmpeg audio decoder
// ---------------------------------------------------------------------------

interface AnalyzeBeatsOptions {
	mediaId: string;
	threshold?: number;
}

function decodeAudioToSamples(filePath: string): Promise<Float32Array> {
	return new Promise((resolve, reject) => {
		const ffmpegPath = getFFmpegPath();
		const args = [
			"-i",
			filePath,
			"-ac",
			"1",
			"-ar",
			String(SAMPLE_RATE),
			"-f",
			"f32le",
			"-acodec",
			"pcm_f32le",
			"pipe:1",
		];

		const proc = spawn(ffmpegPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const chunks: Buffer[] = [];
		let stderr = "";

		proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`
					)
				);
				return;
			}
			const buffer = Buffer.concat(chunks);
			const float32 = new Float32Array(
				buffer.buffer,
				buffer.byteOffset,
				buffer.byteLength / 4
			);
			resolve(float32);
		});

		proc.on("error", (err) => reject(err));
	});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze beats for a media file in a project.
 */
export async function analyzeBeats(
	projectId: string,
	options: AnalyzeBeatsOptions
): Promise<BeatDetectionResult> {
	const { mediaId, threshold } = options;

	claudeLog.info(
		LOG_PREFIX,
		`Analyzing beats for media ${mediaId} in project ${projectId}`
	);

	const media = await getMediaInfo(projectId, mediaId);
	if (!media) {
		throw new Error(`Media not found: ${mediaId}`);
	}

	const samples = await decodeAudioToSamples(media.path);
	claudeLog.info(
		LOG_PREFIX,
		`Decoded ${samples.length} samples (${(samples.length / SAMPLE_RATE).toFixed(1)}s)`
	);

	const result = analyzeFromSamples(samples, SAMPLE_RATE, {
		thresholdMultiplier: threshold,
	});

	claudeLog.info(
		LOG_PREFIX,
		`Detected ${result.beats.length} beats at ${result.bpm.toFixed(1)} BPM (confidence: ${(result.confidence * 100).toFixed(0)}%)`
	);

	return result;
}
