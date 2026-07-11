import type { AudioSettings } from "./audio-settings";
import { calculateReverbDecay } from "./audio-effect-values";
import {
	audioKeyframeValueAtFrame,
	audioPropertyExpression,
	formatAudioNumber,
} from "./audio-keyframe-automation";

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

function appendLinearChain({
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

function pitchFilters({ semitones }: { semitones: number }): string[] {
	const factor = 2 ** (clamp({ value: semitones, min: -12, max: 12 }) / 12);
	if (Math.abs(factor - 1) < 0.000_001) return [];
	return [
		"aresample=48000",
		`asetrate=${formatAudioNumber({ value: 48_000 * factor })}`,
		"aresample=48000",
		`atempo=${formatAudioNumber({ value: 1 / factor })}`,
	];
}

function appendPitch({
	audio,
	currentLabel,
	effectiveDuration,
	filterSteps,
	fps,
	index,
}: {
	audio: AudioSettings;
	currentLabel: string;
	effectiveDuration: number | undefined;
	filterSteps: string[];
	fps: number;
	index: number;
}): string {
	if (!audio.pitch.enabled) return currentLabel;
	const keyframes = audio.keyframes?.pitchSemitones;
	if (!keyframes?.length || effectiveDuration === undefined) {
		return appendLinearChain({
			currentLabel,
			filterSteps,
			filters: pitchFilters({ semitones: audio.pitch.semitones }),
			outputLabel: `a_${index}_pitch`,
		});
	}
	if (keyframes.length === 1) {
		return appendLinearChain({
			currentLabel,
			filterSteps,
			filters: pitchFilters({ semitones: keyframes[0].value }),
			outputLabel: `a_${index}_pitch`,
		});
	}

	const lastFrame = Math.max(1, Math.round(effectiveDuration * fps));
	const step = Math.max(1, Math.round(fps / 8), Math.ceil(lastFrame / 240));
	const boundaries = new Set<number>([0, lastFrame]);
	for (let frame = step; frame < lastFrame; frame += step) {
		boundaries.add(frame);
	}
	for (const keyframe of keyframes) {
		boundaries.add(clamp({ value: keyframe.frame, min: 0, max: lastFrame }));
	}
	const sorted = [...boundaries].sort((left, right) => left - right);
	const segmentCount = sorted.length - 1;
	if (segmentCount <= 0) return currentLabel;

	const splitLabels = Array.from(
		{ length: segmentCount },
		(_unused, segmentIndex) => `a_${index}_pitch_split_${segmentIndex}`
	);
	filterSteps.push(
		`[${currentLabel}]asplit=${segmentCount}${splitLabels.map((label) => `[${label}]`).join("")}`
	);
	const segmentLabels: string[] = [];
	for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
		const startFrame = sorted[segmentIndex];
		const endFrame = sorted[segmentIndex + 1];
		if (endFrame <= startFrame) continue;
		const semitones = audioKeyframeValueAtFrame({
			keyframes,
			frame: (startFrame + endFrame) / 2,
			fallback: audio.pitch.semitones,
		});
		const label = `a_${index}_pitch_segment_${segmentIndex}`;
		const filters = [
			`atrim=start=${formatAudioNumber({ value: startFrame / fps })}:end=${formatAudioNumber({ value: endFrame / fps })}`,
			"asetpts=PTS-STARTPTS",
			...pitchFilters({ semitones }),
		];
		filterSteps.push(
			`[${splitLabels[segmentIndex]}]${filters.join(",")}[${label}]`
		);
		segmentLabels.push(label);
	}
	const outputLabel = `a_${index}_pitch`;
	filterSteps.push(
		`${segmentLabels.map((label) => `[${label}]`).join("")}concat=n=${segmentLabels.length}:v=0:a=1[${outputLabel}]`
	);
	return outputLabel;
}

function appendTelephone({
	audio,
	currentLabel,
	filterSteps,
	index,
}: {
	audio: AudioSettings;
	currentLabel: string;
	filterSteps: string[];
	index: number;
}): string {
	if (!audio.telephone.enabled || audio.telephone.mix <= 0) return currentLabel;
	const mix = clamp({ value: audio.telephone.mix / 100, min: 0, max: 1 });
	const drySource = `a_${index}_telephone_dry_source`;
	const wetSource = `a_${index}_telephone_wet_source`;
	const dry = `a_${index}_telephone_dry`;
	const wet = `a_${index}_telephone_wet`;
	const output = `a_${index}_telephone`;
	filterSteps.push(
		`[${currentLabel}]asplit=2[${drySource}][${wetSource}]`,
		`[${drySource}]volume=${formatAudioNumber({ value: 1 - mix })}[${dry}]`,
		`[${wetSource}]highpass=f=320,lowpass=f=3400,volume=${formatAudioNumber({ value: mix })}[${wet}]`,
		`[${dry}][${wet}]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[${output}]`
	);
	return output;
}

function appendReverbAndEcho({
	audio,
	currentLabel,
	filterSteps,
	fps,
	index,
}: {
	audio: AudioSettings;
	currentLabel: string;
	filterSteps: string[];
	fps: number;
	index: number;
}): string {
	const hasReverb =
		audio.reverb.enabled &&
		(audio.reverb.mix > 0 || (audio.keyframes?.reverbMix?.length ?? 0) > 0);
	const hasEcho =
		audio.echo.enabled &&
		(audio.echo.mix > 0 || (audio.keyframes?.echoMix?.length ?? 0) > 0);
	if (!hasReverb && !hasEcho) return currentLabel;

	const reverbMix = hasReverb
		? `(${audioPropertyExpression({
				audio,
				property: "reverbMix",
				fallback: audio.reverb.mix,
				fps,
			})})/100`
		: "0";
	const echoMix = hasEcho
		? `(${audioPropertyExpression({
				audio,
				property: "echoMix",
				fallback: audio.echo.mix,
				fps,
			})})/100`
		: "0";
	const branchCount = 1 + Number(hasReverb) + Number(hasEcho);
	const drySource = `a_${index}_spatial_dry_source`;
	const reverbSource = `a_${index}_reverb_source`;
	const echoSource = `a_${index}_echo_source`;
	const splitOutputs = [drySource];
	if (hasReverb) splitOutputs.push(reverbSource);
	if (hasEcho) splitOutputs.push(echoSource);
	filterSteps.push(
		`[${currentLabel}]asplit=${branchCount}${splitOutputs.map((label) => `[${label}]`).join("")}`
	);

	const mixedLabels: string[] = [];
	const dry = `a_${index}_spatial_dry`;
	filterSteps.push(
		`[${drySource}]volume='max(0,1-max(${reverbMix},${echoMix}))':eval=frame[${dry}]`
	);
	mixedLabels.push(dry);
	if (hasReverb) {
		const room = clamp({ value: audio.reverb.roomSize / 100, min: 0, max: 1 });
		const decay = calculateReverbDecay({
			roomSize: audio.reverb.roomSize,
			damping: audio.reverb.damping,
		});
		const wet = `a_${index}_reverb_wet`;
		filterSteps.push(
			`[${reverbSource}]aecho=0.15:0.9:${formatAudioNumber({ value: 18 + room * 22 })}|${formatAudioNumber({ value: 31 + room * 39 })}:${formatAudioNumber({ value: decay })}|${formatAudioNumber({ value: decay * 0.65 })},volume='${reverbMix}':eval=frame[${wet}]`
		);
		mixedLabels.push(wet);
	}
	if (hasEcho) {
		const wet = `a_${index}_echo_wet`;
		filterSteps.push(
			`[${echoSource}]aecho=0.15:0.9:${formatAudioNumber({ value: clamp({ value: audio.echo.delayMs, min: 20, max: 2_000 }) })}:${formatAudioNumber({ value: clamp({ value: audio.echo.feedback / 100, min: 0.01, max: 0.85 }) })},volume='${echoMix}':eval=frame[${wet}]`
		);
		mixedLabels.push(wet);
	}
	const output = `a_${index}_spatial`;
	filterSteps.push(
		`${mixedLabels.map((label) => `[${label}]`).join("")}amix=inputs=${mixedLabels.length}:duration=longest:dropout_transition=0:normalize=0[${output}]`
	);
	return output;
}

export function appendPitchEffect({
	audio,
	currentLabel,
	effectiveDuration,
	filterSteps,
	fps,
	index,
}: {
	audio: AudioSettings;
	currentLabel: string;
	effectiveDuration: number | undefined;
	filterSteps: string[];
	fps: number;
	index: number;
}): string {
	return appendPitch({
		audio,
		currentLabel,
		effectiveDuration,
		filterSteps,
		fps,
		index,
	});
}

export function appendPostDynamicsGraphEffects({
	audio,
	currentLabel,
	filterSteps,
	fps,
	index,
}: {
	audio: AudioSettings;
	currentLabel: string;
	filterSteps: string[];
	fps: number;
	index: number;
}): string {
	const telephone = appendTelephone({
		audio,
		currentLabel,
		filterSteps,
		index,
	});
	return appendReverbAndEcho({
		audio,
		currentLabel: telephone,
		filterSteps,
		fps,
		index,
	});
}
