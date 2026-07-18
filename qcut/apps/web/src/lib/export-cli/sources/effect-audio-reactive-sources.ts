import type {
	EffectAudioReactiveEnvelope,
	EffectAudioReactiveRenderStage,
	EffectRenderProgram,
	MediaElement,
} from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import {
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import type { AudioFileInput } from "../types";

const ENVELOPE_SAMPLE_RATE = 12;
const MAX_ENVELOPE_KEYFRAMES = 240;

interface AudioReactiveReference {
	element: TimelineElement;
	trackId: string;
	stageIndex: number;
	stage: EffectAudioReactiveRenderStage;
	duration: number;
}

interface AudioWaveform {
	duration: number;
	values: Float32Array;
}

type DecodeWaveform = ({
	sourcePath,
	duration,
	peakCount,
	band,
}: {
	sourcePath: string;
	duration: number;
	peakCount: number;
	band: EffectAudioReactiveRenderStage["band"];
}) => Promise<AudioWaveform>;

interface EnvelopeSample {
	timeSeconds: number;
	value: number;
}

function elementTimelineDuration({
	element,
	fps,
}: {
	element: TimelineElement;
	fps: number;
}): number {
	if (element.type === "media") return getMediaTimelineDuration(element, fps);
	return Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

function collectReferences({
	tracks,
	programsByElementId,
	fps,
}: {
	tracks: readonly TimelineTrack[];
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
	fps: number;
}): AudioReactiveReference[] {
	const references: AudioReactiveReference[] = [];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.hidden) continue;
			const program = programsByElementId.get(element.id);
			if (!program) continue;
			const duration = elementTimelineDuration({ element, fps });
			for (const [stageIndex, stage] of program.stages.entries()) {
				if (stage.kind !== "audio-reactive") continue;
				references.push({
					element,
					trackId: track.id,
					stageIndex,
					stage,
					duration,
				});
			}
		}
	}
	return references;
}

function sourceDuration({
	audioFile,
	fallbackDuration,
}: {
	audioFile: AudioFileInput;
	fallbackDuration: number;
}): number {
	return Math.max(0.01, audioFile.duration ?? fallbackDuration);
}

function waveformKey({
	audioFile,
	band,
	fallbackDuration,
}: {
	audioFile: AudioFileInput;
	band: EffectAudioReactiveRenderStage["band"];
	fallbackDuration: number;
}): string {
	return [
		audioFile.path,
		sourceDuration({ audioFile, fallbackDuration }),
		band,
	].join("::");
}

function selectedAudioFiles({
	reference,
	audioFiles,
}: {
	reference: AudioReactiveReference;
	audioFiles: readonly AudioFileInput[];
}): readonly AudioFileInput[] {
	if (reference.stage.driver === "timeline") return audioFiles;
	const exact = audioFiles.filter(
		(audioFile) => audioFile.elementId === reference.element.id
	);
	if (exact.length > 0) return exact;
	return audioFiles.filter(
		(audioFile) => audioFile.trackId === reference.trackId
	);
}

function mediaElementById({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): ReadonlyMap<string, MediaElement> {
	const result = new Map<string, MediaElement>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type === "media") result.set(element.id, element);
		}
	}
	return result;
}

function fadeGain({
	audioFile,
	localTimelineTime,
	timelineDuration,
}: {
	audioFile: AudioFileInput;
	localTimelineTime: number;
	timelineDuration: number;
}): number {
	const fadeIn = Math.max(0, audioFile.fadeIn ?? 0);
	const fadeOut = Math.max(0, audioFile.fadeOut ?? 0);
	const fadeInGain = fadeIn > 0 ? Math.min(1, localTimelineTime / fadeIn) : 1;
	const remaining = Math.max(0, timelineDuration - localTimelineTime);
	const fadeOutGain = fadeOut > 0 ? Math.min(1, remaining / fadeOut) : 1;
	return fadeInGain * fadeOutGain;
}

function sampleWaveform({
	audioFile,
	waveform,
	timelineTime,
	mediaElement,
	fps,
}: {
	audioFile: AudioFileInput;
	waveform: AudioWaveform;
	timelineTime: number;
	mediaElement?: MediaElement;
	fps: number;
}): number {
	const localTimelineTime = timelineTime - audioFile.startTime;
	let sourceTime = 0;
	let timelineDuration = 0;
	if (mediaElement) {
		timelineDuration = getMediaTimelineDuration(mediaElement, fps);
		if (localTimelineTime < 0 || localTimelineTime >= timelineDuration)
			return 0;
		const timing = mapMediaTimelineTime({
			element: mediaElement,
			localTimelineTime,
			fps,
		});
		if (timing.isFrozen) return 0;
		sourceTime = mediaElement.trimStart + timing.sourceTime;
	} else {
		const duration = sourceDuration({
			audioFile,
			fallbackDuration: waveform.duration,
		});
		const visibleDuration = Math.max(
			0,
			duration - (audioFile.trimStart ?? 0) - (audioFile.trimEnd ?? 0)
		);
		const playbackRate = Math.max(0.1, audioFile.playbackRate ?? 1);
		timelineDuration = visibleDuration / playbackRate;
		if (localTimelineTime < 0 || localTimelineTime >= timelineDuration)
			return 0;
		const playbackTime = localTimelineTime * playbackRate;
		sourceTime = audioFile.reverse
			? duration - (audioFile.trimEnd ?? 0) - playbackTime
			: (audioFile.trimStart ?? 0) + playbackTime;
	}

	const progress = Math.min(1, Math.max(0, sourceTime / waveform.duration));
	const index = Math.min(
		waveform.values.length - 1,
		Math.max(0, Math.round(progress * (waveform.values.length - 1)))
	);
	const sourceGain =
		Math.max(0, audioFile.volume ?? 1) *
		Math.max(0, audioFile.sourceGain ?? 1) *
		fadeGain({ audioFile, localTimelineTime, timelineDuration });
	return (waveform.values[index] ?? 0) * sourceGain;
}

function normalizeAndSmooth({
	samples,
	stage,
}: {
	samples: EnvelopeSample[];
	stage: EffectAudioReactiveRenderStage;
}): EnvelopeSample[] {
	const peak = samples.reduce(
		(maximum, sample) => Math.max(maximum, sample.value),
		0
	);
	if (peak < 0.01) return samples.map((sample) => ({ ...sample, value: 0 }));
	let previous = 0;
	return samples.map((sample, index) => {
		const target = Math.min(1, sample.value / peak);
		const milliseconds = target > previous ? stage.attackMs : stage.releaseMs;
		const elapsed =
			index === 0
				? 1 / ENVELOPE_SAMPLE_RATE
				: sample.timeSeconds - samples[index - 1].timeSeconds;
		const alpha =
			milliseconds <= 0 ? 1 : 1 - Math.exp(-elapsed / (milliseconds / 1_000));
		previous += (target - previous) * alpha;
		return { ...sample, value: Math.min(1, Math.max(0, previous)) };
	});
}

function simplifyEnvelope({
	samples,
}: {
	samples: EnvelopeSample[];
}): EnvelopeSample[] {
	if (samples.length <= 2) return samples;
	const candidates = [samples[0]];
	let lastKept = samples[0];
	for (let index = 1; index < samples.length - 1; index += 1) {
		const previous = samples[index - 1];
		const sample = samples[index];
		const next = samples[index + 1];
		const isTurningPoint =
			(sample.value >= previous.value && sample.value > next.value) ||
			(sample.value <= previous.value && sample.value < next.value);
		const changed = Math.abs(sample.value - lastKept.value) >= 0.025;
		const elapsed = sample.timeSeconds - lastKept.timeSeconds >= 0.5;
		if (!isTurningPoint && !changed && !elapsed) continue;
		candidates.push(sample);
		lastKept = sample;
	}
	candidates.push(samples[samples.length - 1]);
	if (candidates.length <= MAX_ENVELOPE_KEYFRAMES) return candidates;
	const reduced = [candidates[0]];
	const stride = (candidates.length - 1) / (MAX_ENVELOPE_KEYFRAMES - 1);
	for (let index = 1; index < MAX_ENVELOPE_KEYFRAMES - 1; index += 1) {
		reduced.push(candidates[Math.round(index * stride)]);
	}
	reduced.push(candidates[candidates.length - 1]);
	return reduced;
}

function buildEnvelope({
	reference,
	audioFiles,
	waveforms,
	mediaElements,
	fps,
}: {
	reference: AudioReactiveReference;
	audioFiles: readonly AudioFileInput[];
	waveforms: ReadonlyMap<string, AudioWaveform>;
	mediaElements: ReadonlyMap<string, MediaElement>;
	fps: number;
}): EffectAudioReactiveEnvelope {
	const sampleCount = Math.max(
		2,
		Math.min(16_384, Math.ceil(reference.duration * ENVELOPE_SAMPLE_RATE) + 1)
	);
	const samples: EnvelopeSample[] = [];
	for (let index = 0; index < sampleCount; index += 1) {
		const timeSeconds =
			sampleCount === 1 ? 0 : (index / (sampleCount - 1)) * reference.duration;
		const timelineTime = reference.element.startTime + timeSeconds;
		let sumOfSquares = 0;
		for (const audioFile of audioFiles) {
			const key = waveformKey({
				audioFile,
				band: reference.stage.band,
				fallbackDuration: reference.duration,
			});
			const waveform = waveforms.get(key);
			if (!waveform) continue;
			const value = sampleWaveform({
				audioFile,
				waveform,
				timelineTime,
				mediaElement: audioFile.elementId
					? mediaElements.get(audioFile.elementId)
					: undefined,
				fps,
			});
			sumOfSquares += value * value;
		}
		samples.push({ timeSeconds, value: Math.min(1, Math.sqrt(sumOfSquares)) });
	}
	return {
		stageIndex: reference.stageIndex,
		keyframes: simplifyEnvelope({
			samples: normalizeAndSmooth({ samples, stage: reference.stage }),
		}),
	};
}

/** Builds deterministic per-clip envelopes from the same audio mixed into export. */
export async function extractEffectAudioReactiveEnvelopes({
	programsByElementId,
	tracks,
	audioFiles,
	fps,
	decodeWaveform = async ({ sourcePath, duration, peakCount, band }) =>
		platform().ffmpeg.extractAudioWaveform({
			sourcePath,
			duration,
			peakCount,
			band,
		}),
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
	tracks: readonly TimelineTrack[];
	audioFiles: readonly AudioFileInput[];
	fps: number;
	decodeWaveform?: DecodeWaveform;
}): Promise<ReadonlyMap<string, EffectAudioReactiveEnvelope[]>> {
	const references = collectReferences({ tracks, programsByElementId, fps });
	if (references.length === 0) return new Map();
	const waveformPromises = new Map<string, Promise<AudioWaveform>>();
	for (const reference of references) {
		for (const audioFile of selectedAudioFiles({ reference, audioFiles })) {
			const duration = sourceDuration({
				audioFile,
				fallbackDuration: reference.duration,
			});
			const key = waveformKey({
				audioFile,
				band: reference.stage.band,
				fallbackDuration: reference.duration,
			});
			if (waveformPromises.has(key)) continue;
			waveformPromises.set(
				key,
				decodeWaveform({
					sourcePath: audioFile.path,
					duration,
					peakCount: Math.min(16_384, Math.max(64, Math.ceil(duration * 30))),
					band: reference.stage.band,
				})
			);
		}
	}
	const waveformEntries = await Promise.all(
		[...waveformPromises].map(
			async ([key, pending]) => [key, await pending] as const
		)
	);
	const waveforms = new Map(waveformEntries);
	const mediaElements = mediaElementById({ tracks });
	const envelopesByElementId = new Map<string, EffectAudioReactiveEnvelope[]>();
	for (const reference of references) {
		const envelopes = envelopesByElementId.get(reference.element.id) ?? [];
		envelopes.push(
			buildEnvelope({
				reference,
				audioFiles: selectedAudioFiles({ reference, audioFiles }),
				waveforms,
				mediaElements,
				fps,
			})
		);
		envelopesByElementId.set(reference.element.id, envelopes);
	}
	return envelopesByElementId;
}
