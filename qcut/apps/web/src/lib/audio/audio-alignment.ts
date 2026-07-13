import type { MediaElement } from "@/types/timeline";

const DEFAULT_ENVELOPE_SAMPLE_RATE = 50;
const DEFAULT_MAX_ANALYSIS_SECONDS = 180;
const MIN_OVERLAP_SECONDS = 2;

export interface AudioAlignmentEstimate {
	/** Add this delta to the reference start time to place the target. */
	targetStartDelta: number;
	lagSeconds: number;
	confidence: number;
}

function normalizeSignal({ signal }: { signal: Float32Array }): Float32Array {
	let mean = 0;
	for (const value of signal) mean += value;
	mean /= Math.max(1, signal.length);
	let variance = 0;
	for (const value of signal) variance += (value - mean) ** 2;
	const standardDeviation = Math.sqrt(variance / Math.max(1, signal.length));
	if (standardDeviation < 1e-7) {
		throw new Error("Audio is too quiet to align");
	}
	return Float32Array.from(
		signal,
		(value) => (value - mean) / standardDeviation
	);
}

function correlationAtLag({
	reference,
	target,
	lag,
	minimumOverlap,
}: {
	reference: Float32Array;
	target: Float32Array;
	lag: number;
	minimumOverlap: number;
}): number | null {
	const referenceStart = Math.max(0, -lag);
	const targetStart = Math.max(0, lag);
	const overlap = Math.min(
		reference.length - referenceStart,
		target.length - targetStart
	);
	if (overlap < minimumOverlap) return null;
	let dot = 0;
	let referenceEnergy = 0;
	let targetEnergy = 0;
	for (let index = 0; index < overlap; index++) {
		const referenceValue = reference[referenceStart + index];
		const targetValue = target[targetStart + index];
		dot += referenceValue * targetValue;
		referenceEnergy += referenceValue * referenceValue;
		targetEnergy += targetValue * targetValue;
	}
	const denominator = Math.sqrt(referenceEnergy * targetEnergy);
	return denominator > 1e-9 ? dot / denominator : null;
}

export function estimateAudioAlignment({
	reference,
	target,
	sampleRate,
	maxOffsetSeconds,
}: {
	reference: Float32Array;
	target: Float32Array;
	sampleRate: number;
	maxOffsetSeconds: number;
}): AudioAlignmentEstimate {
	if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
		throw new Error("Audio alignment sample rate must be positive");
	}
	const normalizedReference = normalizeSignal({ signal: reference });
	const normalizedTarget = normalizeSignal({ signal: target });
	const maximumLag = Math.min(
		Math.round(Math.max(0, maxOffsetSeconds) * sampleRate),
		Math.max(reference.length, target.length) - 1
	);
	const minimumOverlap = Math.max(
		2,
		Math.min(
			Math.round(MIN_OVERLAP_SECONDS * sampleRate),
			Math.floor(Math.min(reference.length, target.length) / 2)
		)
	);
	let bestLag = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let lag = -maximumLag; lag <= maximumLag; lag++) {
		const score = correlationAtLag({
			reference: normalizedReference,
			target: normalizedTarget,
			lag,
			minimumOverlap,
		});
		if (score !== null && score > bestScore) {
			bestScore = score;
			bestLag = lag;
		}
	}
	if (!Number.isFinite(bestScore)) {
		throw new Error("The selected clips do not have enough overlapping audio");
	}
	const lagSeconds = bestLag / sampleRate;
	return {
		targetStartDelta: -lagSeconds,
		lagSeconds,
		confidence: Math.min(1, Math.max(0, (bestScore + 1) / 2)),
	};
}

function audioBufferToEnvelope({
	buffer,
	sampleRate,
	maxDurationSeconds,
}: {
	buffer: AudioBuffer;
	sampleRate: number;
	maxDurationSeconds: number;
}): Float32Array {
	const sourceSamplesPerBin = buffer.sampleRate / sampleRate;
	const duration = Math.min(buffer.duration, maxDurationSeconds);
	const binCount = Math.max(1, Math.floor(duration * sampleRate));
	const envelope = new Float32Array(binCount);
	for (let bin = 0; bin < binCount; bin++) {
		const start = Math.floor(bin * sourceSamplesPerBin);
		const end = Math.min(
			buffer.length,
			Math.max(start + 1, Math.floor((bin + 1) * sourceSamplesPerBin))
		);
		let energy = 0;
		let samples = 0;
		for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
			const data = buffer.getChannelData(channel);
			for (let index = start; index < end; index++) {
				energy += data[index] * data[index];
				samples++;
			}
		}
		envelope[bin] = Math.sqrt(energy / Math.max(1, samples));
	}
	return envelope;
}

async function decodeAudioEnvelope({
	file,
	sampleRate,
	maxDurationSeconds,
}: {
	file: File;
	sampleRate: number;
	maxDurationSeconds: number;
}): Promise<Float32Array> {
	const AudioContextConstructor = window.AudioContext;
	if (!AudioContextConstructor) {
		throw new Error("Audio decoding is unavailable in this environment");
	}
	const context = new AudioContextConstructor();
	try {
		const buffer = await context.decodeAudioData(await file.arrayBuffer());
		return audioBufferToEnvelope({ buffer, sampleRate, maxDurationSeconds });
	} finally {
		await context.close();
	}
}

function sliceVisibleEnvelope({
	envelope,
	element,
	sampleRate,
}: {
	envelope: Float32Array;
	element: MediaElement;
	sampleRate: number;
}): Float32Array {
	const start = Math.max(0, Math.round(element.trimStart * sampleRate));
	const end = Math.min(
		envelope.length,
		Math.max(
			start + 1,
			envelope.length - Math.round(element.trimEnd * sampleRate)
		)
	);
	return envelope.slice(start, end);
}

export async function alignMediaElementsByAudio({
	referenceElement,
	targetElement,
	referenceFile,
	targetFile,
	maxOffsetSeconds = 60,
	sampleRate = DEFAULT_ENVELOPE_SAMPLE_RATE,
}: {
	referenceElement: MediaElement;
	targetElement: MediaElement;
	referenceFile: File;
	targetFile: File;
	maxOffsetSeconds?: number;
	sampleRate?: number;
}): Promise<AudioAlignmentEstimate & { targetStartTime: number }> {
	const maxDurationSeconds = Math.min(
		DEFAULT_MAX_ANALYSIS_SECONDS,
		Math.max(referenceElement.duration, targetElement.duration)
	);
	const [referenceEnvelope, targetEnvelope] = await Promise.all([
		decodeAudioEnvelope({
			file: referenceFile,
			sampleRate,
			maxDurationSeconds,
		}),
		decodeAudioEnvelope({
			file: targetFile,
			sampleRate,
			maxDurationSeconds,
		}),
	]);
	const estimate = estimateAudioAlignment({
		reference: sliceVisibleEnvelope({
			envelope: referenceEnvelope,
			element: referenceElement,
			sampleRate,
		}),
		target: sliceVisibleEnvelope({
			envelope: targetEnvelope,
			element: targetElement,
			sampleRate,
		}),
		sampleRate,
		maxOffsetSeconds,
	});
	return {
		...estimate,
		targetStartTime: Math.max(
			0,
			referenceElement.startTime + estimate.targetStartDelta
		),
	};
}
