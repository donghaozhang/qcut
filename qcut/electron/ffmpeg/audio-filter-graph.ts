import type { AudioFile } from "../ffmpeg/types";
import {
	buildAudioEffectTransforms,
	buildAudioEnvelopeFilter,
} from "../ffmpeg-audio-effects";
import {
	buildSpeedSamples,
	outputTimeAtSource,
} from "../ffmpeg-video-transform";
import {
	appendPitchEffect,
	appendPostDynamicsGraphEffects,
} from "./audio-graph-effects";

export interface AudioFilterGraph {
	mapAudio: string | null;
	filterSteps: string[];
}

function appendEffectStage({
	currentLabel,
	filterSteps,
	filters,
	outputLabel,
}: {
	currentLabel: string;
	filterSteps: string[];
	filters: string[];
	outputLabel: string;
}): string {
	if (filters.length === 0) return currentLabel;
	filterSteps.push(`[${currentLabel}]${filters.join(",")}[${outputLabel}]`);
	return outputLabel;
}

function buildAtempoFilters({ rate }: { rate: number }): string[] {
	const filters: string[] = [];
	let remaining = Math.min(8, Math.max(0.1, rate));
	while (remaining > 2) {
		filters.push("atempo=2");
		remaining /= 2;
	}
	while (remaining < 0.5) {
		filters.push("atempo=0.5");
		remaining /= 0.5;
	}
	if (Math.abs(remaining - 1) > 1e-6) {
		filters.push(`atempo=${remaining}`);
	}
	return filters;
}

function canMapAudioInputDirectly({
	audioFile,
	fps,
}: {
	audioFile: AudioFile;
	fps: number;
}): boolean {
	return (
		(audioFile.startTime ?? 0) <= 0 &&
		(audioFile.volume ?? 1) === 1 &&
		(audioFile.sourceGain ?? 1) === 1 &&
		(audioFile.trimStart ?? 0) === 0 &&
		(audioFile.trimEnd ?? 0) === 0 &&
		audioFile.duration === undefined &&
		(audioFile.fadeIn ?? 0) === 0 &&
		(audioFile.fadeOut ?? 0) === 0 &&
		!audioFile.normalize &&
		(audioFile.denoise ?? 0) === 0 &&
		(audioFile.pan ?? 0) === 0 &&
		(audioFile.playbackRate ?? 1) === 1 &&
		(audioFile.speedKeyframes?.length ?? 0) === 0 &&
		!audioFile.reverse &&
		(audioFile.freezeFrameDuration ?? 0) === 0 &&
		buildAudioEffectTransforms({ audio: audioFile.audio }).length === 0 &&
		buildAudioEnvelopeFilter({
			audio: audioFile.audio,
			fallbackVolume: audioFile.volume ?? 1,
			effectiveDuration: undefined,
			fps,
		}) === null
	);
}

function appendSourceTiming({
	audioFile,
	currentLabel,
	filterSteps,
	index,
}: {
	audioFile: AudioFile;
	currentLabel: string;
	filterSteps: string[];
	index: number;
}): {
	currentLabel: string;
	effectiveDuration: number | undefined;
	trimStart: number;
} {
	const trimStart = Math.max(0, audioFile.trimStart ?? 0);
	const trimEnd = Math.max(0, audioFile.trimEnd ?? 0);
	const effectiveDuration =
		audioFile.duration === undefined
			? undefined
			: Math.max(0.01, audioFile.duration - trimStart - trimEnd);
	const sourceTransforms: string[] = [];
	if (trimStart > 0 || effectiveDuration !== undefined) {
		const trimParts = [`start=${trimStart}`];
		if (effectiveDuration !== undefined) {
			trimParts.push(`duration=${effectiveDuration}`);
		}
		sourceTransforms.push(
			`atrim=${trimParts.join(":")}`,
			"asetpts=PTS-STARTPTS"
		);
	}
	if (audioFile.reverse) sourceTransforms.push("areverse");
	if (sourceTransforms.length === 0) {
		return { currentLabel, effectiveDuration, trimStart };
	}

	const prepared = `a_${index}_prepared`;
	filterSteps.push(
		`[${currentLabel}]${sourceTransforms.join(",")}[${prepared}]`
	);
	return { currentLabel: prepared, effectiveDuration, trimStart };
}

function appendSpeedAndFreeze({
	audioFile,
	currentLabel,
	effectiveDuration,
	filterSteps,
	index,
}: {
	audioFile: AudioFile;
	currentLabel: string;
	effectiveDuration: number | undefined;
	filterSteps: string[];
	index: number;
}): string {
	let outputLabel = currentLabel;
	let speedDuration = effectiveDuration;
	let speedSamples =
		effectiveDuration === undefined
			? []
			: buildSpeedSamples(audioFile, effectiveDuration, 30);
	if (speedSamples.length > 0) {
		speedDuration = speedSamples[speedSamples.length - 1].outputEnd;
	}

	if ((audioFile.speedKeyframes?.length ?? 0) > 0 && speedSamples.length > 0) {
		const splitLabels = speedSamples.map(
			(_sample, sampleIndex) => `a_${index}_speed_split_${sampleIndex}`
		);
		filterSteps.push(
			`[${outputLabel}]asplit=${speedSamples.length}${splitLabels.map((label) => `[${label}]`).join("")}`
		);
		const segmentLabels = speedSamples.map((sample, sampleIndex) => {
			const label = `a_${index}_speed_segment_${sampleIndex}`;
			const atempo = buildAtempoFilters({ rate: sample.rate });
			filterSteps.push(
				`[${splitLabels[sampleIndex]}]atrim=start=${sample.sourceStart}:end=${sample.sourceEnd},` +
					`asetpts=PTS-STARTPTS${atempo.length > 0 ? `,${atempo.join(",")}` : ""}[${label}]`
			);
			return label;
		});
		const sped = `a_${index}_sped`;
		filterSteps.push(
			`${segmentLabels.map((label) => `[${label}]`).join("")}concat=n=${segmentLabels.length}:v=0:a=1[${sped}]`
		);
		outputLabel = sped;
	} else {
		const atempo = buildAtempoFilters({
			rate: audioFile.playbackRate ?? 1,
		});
		if (atempo.length > 0) {
			const sped = `a_${index}_sped`;
			filterSteps.push(`[${outputLabel}]${atempo.join(",")}[${sped}]`);
			outputLabel = sped;
		}
	}

	const freezeDuration = Math.max(0, audioFile.freezeFrameDuration ?? 0);
	if (
		freezeDuration <= 0 ||
		effectiveDuration === undefined ||
		speedDuration === undefined
	) {
		return outputLabel;
	}

	if (speedSamples.length === 0) {
		speedSamples = buildSpeedSamples(audioFile, effectiveDuration, 30);
	}
	const freezeStart = outputTimeAtSource(
		speedSamples,
		Math.min(
			effectiveDuration,
			Math.max(0, audioFile.freezeFrameTime ?? effectiveDuration)
		)
	);
	const normalized = `a_${index}_freeze_input`;
	const beforeSource = `a_${index}_freeze_before_source`;
	const afterSource = `a_${index}_freeze_after_source`;
	const before = `a_${index}_freeze_before`;
	const silence = `a_${index}_freeze_silence`;
	const after = `a_${index}_freeze_after`;
	const frozen = `a_${index}_with_freeze`;
	filterSteps.push(
		`[${outputLabel}]aformat=sample_rates=48000:channel_layouts=stereo[${normalized}]`,
		`[${normalized}]asplit=2[${beforeSource}][${afterSource}]`,
		`[${beforeSource}]atrim=start=0:end=${freezeStart},asetpts=PTS-STARTPTS[${before}]`,
		`anullsrc=r=48000:cl=stereo:d=${freezeDuration}[${silence}]`,
		`[${afterSource}]atrim=start=${freezeStart}:end=${speedDuration},asetpts=PTS-STARTPTS[${after}]`,
		`[${before}][${silence}][${after}]concat=n=3:v=0:a=1[${frozen}]`
	);
	return frozen;
}

function buildLegacyTransforms({
	audioFile,
	effectiveDuration,
}: {
	audioFile: AudioFile;
	effectiveDuration: number | undefined;
}): string[] {
	const transforms: string[] = [];
	const denoise = Math.min(100, Math.max(0, audioFile.denoise ?? 0));
	if (denoise > 0) transforms.push(`afftdn=nf=${-50 + denoise * 0.25}`);
	if (audioFile.normalize) transforms.push("loudnorm=I=-16:LRA=11:TP=-1.5");
	const pan = Math.min(1, Math.max(-1, audioFile.pan ?? 0));
	if (pan !== 0) {
		transforms.push(
			"aformat=channel_layouts=stereo",
			`stereotools=balance_out=${pan}`
		);
	}
	const fadeIn = Math.min(
		Math.max(0, audioFile.fadeIn ?? 0),
		effectiveDuration ?? Number.POSITIVE_INFINITY
	);
	if (fadeIn > 0) transforms.push(`afade=t=in:st=0:d=${fadeIn}`);
	const fadeOut = Math.min(
		Math.max(0, audioFile.fadeOut ?? 0),
		effectiveDuration ?? 0
	);
	if (fadeOut > 0 && effectiveDuration !== undefined) {
		transforms.push(
			`afade=t=out:st=${Math.max(0, effectiveDuration - fadeOut)}:d=${fadeOut}`
		);
	}
	if ((audioFile.volume ?? 1) !== 1) {
		transforms.push(`volume=${audioFile.volume ?? 1}`);
	}
	return transforms;
}

/** Builds the one canonical FFmpeg graph for every timeline audio export path. */
export function buildTimelineAudioFilters({
	audioFiles,
	audioStartIndex,
	fps,
}: {
	audioFiles: AudioFile[];
	audioStartIndex: number;
	fps: number;
}): AudioFilterGraph {
	if (audioFiles.length === 0) {
		return { mapAudio: null, filterSteps: [] };
	}

	if (
		audioFiles.length === 1 &&
		canMapAudioInputDirectly({ audioFile: audioFiles[0], fps })
	) {
		return { mapAudio: `${audioStartIndex}:a`, filterSteps: [] };
	}

	const filterSteps: string[] = [];
	const mixedLabels: string[] = [];
	for (const [index, audioFile] of audioFiles.entries()) {
		const timing = appendSourceTiming({
			audioFile,
			currentLabel: `${audioStartIndex + index}:a`,
			filterSteps,
			index,
		});
		let currentLabel = appendSpeedAndFreeze({
			audioFile,
			currentLabel: timing.currentLabel,
			effectiveDuration: timing.effectiveDuration,
			filterSteps,
			index,
		});
		const transforms: string[] = [];
		if (audioFile.audio) {
			currentLabel = appendEffectStage({
				currentLabel,
				filterSteps,
				filters: buildAudioEffectTransforms({
					audio: audioFile.audio,
					fps,
					instanceSuffix: String(index),
					stage: "pre-pitch",
				}),
				outputLabel: `a_${index}_pre_pitch`,
			});
			currentLabel = appendPitchEffect({
				audio: audioFile.audio,
				currentLabel,
				effectiveDuration: timing.effectiveDuration,
				filterSteps,
				fps,
				index,
			});
			currentLabel = appendEffectStage({
				currentLabel,
				filterSteps,
				filters: buildAudioEffectTransforms({
					audio: audioFile.audio,
					fps,
					instanceSuffix: String(index),
					stage: "dynamics",
				}),
				outputLabel: `a_${index}_dynamics`,
			});
			currentLabel = appendPostDynamicsGraphEffects({
				audio: audioFile.audio,
				currentLabel,
				filterSteps,
				fps,
				index,
			});
			currentLabel = appendEffectStage({
				currentLabel,
				filterSteps,
				filters: buildAudioEffectTransforms({
					audio: audioFile.audio,
					fps,
					instanceSuffix: String(index),
					stage: "output",
				}),
				outputLabel: `a_${index}_output_effects`,
			});
			const envelope = buildAudioEnvelopeFilter({
				audio: audioFile.audio,
				fallbackVolume: audioFile.volume ?? 1,
				effectiveDuration: timing.effectiveDuration,
				fps,
			});
			if (envelope) transforms.push(envelope);
		} else {
			transforms.push(
				...buildLegacyTransforms({
					audioFile,
					effectiveDuration: timing.effectiveDuration,
				})
			);
		}
		const delayMs = Math.max(0, Math.round((audioFile.startTime ?? 0) * 1000));
		if ((audioFile.sourceGain ?? 1) !== 1) {
			transforms.push(`volume=${Math.max(0, audioFile.sourceGain ?? 1)}`);
		}
		if (delayMs > 0) transforms.push(`adelay=${delayMs}:all=1`);

		const outputLabel = `a_${index}`;
		filterSteps.push(
			`[${currentLabel}]${transforms.length > 0 ? transforms.join(",") : "anull"}[${outputLabel}]`
		);
		mixedLabels.push(`[${outputLabel}]`);
	}

	if (mixedLabels.length === 1) {
		return { mapAudio: mixedLabels[0], filterSteps };
	}
	filterSteps.push(
		`${mixedLabels.join("")}amix=inputs=${mixedLabels.length}:duration=longest:dropout_transition=0:normalize=0[a_mix]`
	);
	return { mapAudio: "[a_mix]", filterSteps };
}
