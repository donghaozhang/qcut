export interface AudioWaveformPeaks {
	duration: number;
	values: Float32Array;
}

export type AudioWaveformLoader = ({
	audioUrl,
}: {
	audioUrl: string;
}) => Promise<AudioWaveformPeaks>;

interface AudioWaveformCacheEntry {
	promise: Promise<AudioWaveformPeaks>;
	accessedAt: number;
}

const DEFAULT_PEAK_COUNT = 4_096;

export function createAudioWaveformPeaks({
	buffer,
	peakCount = DEFAULT_PEAK_COUNT,
}: {
	buffer: AudioBuffer;
	peakCount?: number;
}): AudioWaveformPeaks {
	const resolvedPeakCount = Math.max(1, Math.min(peakCount, buffer.length));
	const values = new Float32Array(resolvedPeakCount);
	const channelData = Array.from(
		{ length: buffer.numberOfChannels },
		(_, channel) => buffer.getChannelData(channel)
	);

	for (let peakIndex = 0; peakIndex < resolvedPeakCount; peakIndex++) {
		const sampleStart = Math.floor(
			(peakIndex / resolvedPeakCount) * buffer.length
		);
		const sampleEnd = Math.max(
			sampleStart + 1,
			Math.floor(((peakIndex + 1) / resolvedPeakCount) * buffer.length)
		);
		let peak = 0;
		for (const channel of channelData) {
			for (
				let sampleIndex = sampleStart;
				sampleIndex < sampleEnd;
				sampleIndex++
			) {
				peak = Math.max(peak, Math.abs(channel[sampleIndex] ?? 0));
			}
		}
		values[peakIndex] = peak;
	}

	return { duration: buffer.duration, values };
}

export async function decodeAudioWaveform({
	audioUrl,
}: {
	audioUrl: string;
}): Promise<AudioWaveformPeaks> {
	const response = await fetch(audioUrl);
	if (!response.ok) {
		throw new Error(`Audio waveform request failed (${response.status})`);
	}
	const AudioContextConstructor =
		window.AudioContext ??
		(window as Window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!AudioContextConstructor) {
		throw new Error("Web Audio is unavailable");
	}
	const context = new AudioContextConstructor();
	try {
		const buffer = await context.decodeAudioData(await response.arrayBuffer());
		return createAudioWaveformPeaks({ buffer });
	} finally {
		await context.close();
	}
}

export class AudioWaveformCache {
	private readonly entries = new Map<string, AudioWaveformCacheEntry>();

	constructor(private readonly maxEntries = 24) {}

	get({
		audioUrl,
		loader = decodeAudioWaveform,
	}: {
		audioUrl: string;
		loader?: AudioWaveformLoader;
	}): Promise<AudioWaveformPeaks> {
		const cached = this.entries.get(audioUrl);
		if (cached) {
			cached.accessedAt = Date.now();
			return cached.promise;
		}

		const promise = loader({ audioUrl }).catch((error: unknown) => {
			if (this.entries.get(audioUrl)?.promise === promise) {
				this.entries.delete(audioUrl);
			}
			throw error;
		});
		this.entries.set(audioUrl, { promise, accessedAt: Date.now() });
		this.evictIfNeeded();
		return promise;
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	private evictIfNeeded(): void {
		if (this.entries.size <= this.maxEntries) return;
		const oldest = [...this.entries.entries()].sort(
			(left, right) => left[1].accessedAt - right[1].accessedAt
		)[0];
		if (oldest) this.entries.delete(oldest[0]);
	}
}

export const audioWaveformCache = new AudioWaveformCache();

export function sampleAudioWaveformBars({
	waveform,
	startTime = 0,
	endTime = waveform.duration,
	barCount,
}: {
	waveform: AudioWaveformPeaks;
	startTime?: number;
	endTime?: number;
	barCount: number;
}): Float32Array {
	const count = Math.max(1, Math.floor(barCount));
	const bars = new Float32Array(count);
	if (waveform.values.length === 0 || waveform.duration <= 0) return bars;
	const boundedStart = Math.max(0, Math.min(startTime, waveform.duration));
	const boundedEnd = Math.max(
		boundedStart,
		Math.min(endTime, waveform.duration)
	);
	const firstPeak = Math.floor(
		(boundedStart / waveform.duration) * waveform.values.length
	);
	const lastPeak = Math.max(
		firstPeak + 1,
		Math.ceil((boundedEnd / waveform.duration) * waveform.values.length)
	);
	const peakSpan = Math.max(1, lastPeak - firstPeak);

	for (let barIndex = 0; barIndex < count; barIndex++) {
		const rangeStart = firstPeak + Math.floor((barIndex / count) * peakSpan);
		const rangeEnd = Math.max(
			rangeStart + 1,
			firstPeak + Math.ceil(((barIndex + 1) / count) * peakSpan)
		);
		let peak = 0;
		for (
			let peakIndex = rangeStart;
			peakIndex < Math.min(rangeEnd, waveform.values.length);
			peakIndex++
		) {
			peak = Math.max(peak, waveform.values[peakIndex] ?? 0);
		}
		bars[barIndex] = peak;
	}
	return bars;
}
