// Adapted from OpenReel Video (MIT License)

/**
 * Beat detection engine — pure JavaScript implementation.
 *
 * Pipeline: RMS energy → smoothing → adaptive threshold → peak detection → BPM → downbeats
 *
 * No browser dependencies — works with Float32Array from AudioBuffer or Node.js.
 *
 * @module @qcut/editor-core/audio/beat-detection-engine
 */

import type {
	Beat,
	BeatDetectionConfig,
	BeatDetectionResult,
	ResolvedBeatDetectionConfig,
} from "./beat-types.js";

const DEFAULT_CONFIG: ResolvedBeatDetectionConfig = {
	windowSize: 1024,
	smoothingFactor: 0.8,
	thresholdMultiplier: 1.5,
	minBeatInterval: 0.2,
	beatsPerMeasure: 4,
};

function resolveConfig(
	config?: BeatDetectionConfig
): ResolvedBeatDetectionConfig {
	return { ...DEFAULT_CONFIG, ...config };
}

/**
 * Calculate RMS energy for windowed segments of audio samples.
 * Returns an array of energy values, one per window.
 */
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

/**
 * Apply exponential moving average smoothing to the energy envelope.
 */
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

/**
 * Compute adaptive threshold using a local average window.
 * The threshold at each point is the local mean * multiplier.
 */
function computeAdaptiveThreshold(
	energy: Float64Array,
	multiplier: number
): Float64Array {
	const threshold = new Float64Array(energy.length);
	// Use a window of ~43 frames (~1 second at 44100/1024)
	const halfWindow = 21;

	for (let i = 0; i < energy.length; i++) {
		const start = Math.max(0, i - halfWindow);
		const end = Math.min(energy.length, i + halfWindow + 1);
		let sum = 0;
		for (let j = start; j < end; j++) {
			sum += energy[j];
		}
		const localMean = sum / (end - start);
		threshold[i] = localMean * multiplier;
	}

	return threshold;
}

/**
 * Detect peaks where energy exceeds the adaptive threshold,
 * respecting minimum beat interval.
 */
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

	// Find max energy for normalization
	let maxEnergy = 0;
	for (let i = 0; i < energy.length; i++) {
		if (energy[i] > maxEnergy) maxEnergy = energy[i];
	}
	if (maxEnergy === 0) return peaks;

	let lastPeakIndex = -minSamplesBetween;

	for (let i = 1; i < energy.length - 1; i++) {
		// Must exceed threshold and be a local maximum
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

/**
 * Estimate BPM from beat intervals using histogram approach.
 * Returns BPM and confidence.
 */
function estimateBPM(beats: Array<{ timestamp: number }>): {
	bpm: number;
	confidence: number;
} {
	if (beats.length < 2) return { bpm: 0, confidence: 0 };

	// Collect intervals between consecutive beats
	const intervals: number[] = [];
	for (let i = 1; i < beats.length; i++) {
		const interval = beats[i].timestamp - beats[i - 1].timestamp;
		// Only consider reasonable intervals (30-300 BPM range)
		if (interval > 0.2 && interval < 2.0) {
			intervals.push(interval);
		}
	}

	if (intervals.length === 0) return { bpm: 0, confidence: 0 };

	// Sort and find median interval
	intervals.sort((a, b) => a - b);
	const medianInterval = intervals[Math.floor(intervals.length / 2)];
	const bpm = 60 / medianInterval;

	// Confidence = how many intervals are close to the median (within 10%)
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

/**
 * Analyze raw PCM audio samples and detect beats.
 *
 * @param samples - Mono audio samples as Float32Array (values between -1 and 1)
 * @param sampleRate - Sample rate in Hz (e.g. 44100)
 * @param config - Optional configuration overrides
 * @returns Beat detection result with BPM, confidence, beats, and downbeats
 */
export function analyzeFromSamples(
	samples: Float32Array,
	sampleRate: number,
	config?: BeatDetectionConfig
): BeatDetectionResult {
	const cfg = resolveConfig(config);
	const duration = samples.length / sampleRate;

	// Short clips: not enough data for meaningful analysis
	if (samples.length < cfg.windowSize * 3) {
		return { bpm: 0, confidence: 0, beats: [], downbeats: [], duration };
	}

	// 1. Calculate RMS energy per window
	const energy = calculateRMSEnergy(samples, cfg.windowSize);

	// 2. Smooth the energy envelope
	const smoothed = smoothEnergy(energy, cfg.smoothingFactor);

	// 3. Compute adaptive threshold
	const threshold = computeAdaptiveThreshold(smoothed, cfg.thresholdMultiplier);

	// 4. Detect peaks
	const rawPeaks = detectPeaks(
		smoothed,
		threshold,
		cfg.windowSize,
		sampleRate,
		cfg.minBeatInterval
	);

	// 5. Estimate BPM
	const { bpm, confidence } = estimateBPM(rawPeaks);

	// 6. Build beat array with downbeat identification
	const beats: Beat[] = rawPeaks.map((peak, index) => ({
		timestamp: peak.timestamp,
		strength: peak.strength,
		index,
		isDownbeat: index % cfg.beatsPerMeasure === 0,
	}));

	// 7. Extract downbeat timestamps
	const downbeats = beats.filter((b) => b.isDownbeat).map((b) => b.timestamp);

	return { bpm, confidence, beats, downbeats, duration };
}

/** Re-export config resolution for testing */
export { resolveConfig, DEFAULT_CONFIG };
