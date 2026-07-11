import type {
	AudioKeyframeProperty,
	AudioPropertyKeyframe,
	AudioSettings,
} from "./audio-settings";

export function formatAudioNumber({ value }: { value: number }): string {
	const rounded = Math.round(value * 1_000_000) / 1_000_000;
	return String(Object.is(rounded, -0) ? 0 : rounded);
}

function easingExpression({
	progress,
	easing,
}: {
	progress: string;
	easing: AudioPropertyKeyframe["easing"];
}): string {
	if (easing === "easeIn") return `pow(${progress},2)`;
	if (easing === "easeOut") return `(1-pow(1-${progress},2))`;
	if (easing === "easeInOut") {
		return `if(lt(${progress},0.5),2*pow(${progress},2),1-pow(-2*${progress}+2,2)/2)`;
	}
	if (easing === "spring") return `(1-pow(1-${progress},3))`;
	return progress;
}

export function audioKeyframeExpression({
	keyframes,
	fallback,
	fps,
}: {
	keyframes: AudioPropertyKeyframe[] | undefined;
	fallback: number;
	fps: number;
}): string {
	const sorted = [...(keyframes ?? [])]
		.filter(
			(keyframe) =>
				Number.isFinite(keyframe.frame) && Number.isFinite(keyframe.value)
		)
		.sort((left, right) => left.frame - right.frame);
	if (sorted.length === 0) return formatAudioNumber({ value: fallback });
	if (sorted.length === 1) {
		return formatAudioNumber({ value: sorted[0].value });
	}
	let expression = formatAudioNumber({
		value: sorted[sorted.length - 1].value,
	});
	for (let index = sorted.length - 2; index >= 0; index -= 1) {
		const start = sorted[index];
		const end = sorted[index + 1];
		const startTime = start.frame / fps;
		const endTime = end.frame / fps;
		const duration = Math.max(1 / fps, endTime - startTime);
		const progress = `max(0,min(1,(t-${formatAudioNumber({ value: startTime })})/${formatAudioNumber({ value: duration })}))`;
		const eased = easingExpression({ progress, easing: end.easing });
		const segment = `${formatAudioNumber({ value: start.value })}+(${formatAudioNumber({ value: end.value - start.value })})*${eased}`;
		expression = `if(lt(t,${formatAudioNumber({ value: endTime })}),${segment},${expression})`;
	}
	const firstTime = sorted[0].frame / fps;
	return firstTime > 0
		? `if(lt(t,${formatAudioNumber({ value: firstTime })}),${formatAudioNumber({ value: sorted[0].value })},${expression})`
		: expression;
}

export function audioPropertyExpression({
	audio,
	property,
	fallback,
	fps,
}: {
	audio: AudioSettings;
	property: AudioKeyframeProperty;
	fallback: number;
	fps: number;
}): string {
	return audioKeyframeExpression({
		keyframes: audio.keyframes?.[property],
		fallback,
		fps,
	});
}

function numericEasing({
	progress,
	easing,
}: {
	progress: number;
	easing: AudioPropertyKeyframe["easing"];
}): number {
	if (easing === "easeIn") return progress ** 2;
	if (easing === "easeOut") return 1 - (1 - progress) ** 2;
	if (easing === "easeInOut") {
		return progress < 0.5
			? 2 * progress ** 2
			: 1 - (-2 * progress + 2) ** 2 / 2;
	}
	if (easing === "spring") return 1 - (1 - progress) ** 3;
	return progress;
}

export function audioKeyframeValueAtFrame({
	keyframes,
	frame,
	fallback,
}: {
	keyframes: AudioPropertyKeyframe[] | undefined;
	frame: number;
	fallback: number;
}): number {
	const sorted = [...(keyframes ?? [])].sort(
		(left, right) => left.frame - right.frame
	);
	if (sorted.length === 0) return fallback;
	if (frame <= sorted[0].frame) return sorted[0].value;
	if (frame >= sorted[sorted.length - 1].frame) {
		return sorted[sorted.length - 1].value;
	}
	const endIndex = sorted.findIndex((keyframe) => keyframe.frame >= frame);
	const start = sorted[endIndex - 1];
	const end = sorted[endIndex];
	const progress = (frame - start.frame) / Math.max(1, end.frame - start.frame);
	const eased = numericEasing({ progress, easing: end.easing });
	return start.value + (end.value - start.value) * eased;
}

export function buildAudioRuntimeCommands({
	keyframes,
	fallback,
	fps,
	target,
	command,
	transform = (value) => value,
}: {
	keyframes: AudioPropertyKeyframe[] | undefined;
	fallback: number;
	fps: number;
	target: string;
	command: string;
	transform?: (value: number) => number;
}): string | null {
	if (!keyframes || keyframes.length < 2) return null;
	const lastFrame = Math.max(...keyframes.map((keyframe) => keyframe.frame));
	const step = Math.max(1, Math.round(fps / 20), Math.ceil(lastFrame / 1_500));
	const sampledFrames = new Set<number>();
	for (let frame = 0; frame <= lastFrame; frame += step) {
		sampledFrames.add(frame);
	}
	for (const keyframe of keyframes) sampledFrames.add(keyframe.frame);
	let previousValue: number | undefined;
	const commands: string[] = [];
	for (const frame of [...sampledFrames].sort((left, right) => left - right)) {
		const value = transform(
			audioKeyframeValueAtFrame({ keyframes, frame, fallback })
		);
		if (
			previousValue !== undefined &&
			Math.abs(value - previousValue) < 0.000_001
		) {
			continue;
		}
		commands.push(
			`${formatAudioNumber({ value: frame / fps })} ${target} ${command} ${formatAudioNumber({ value })}`
		);
		previousValue = value;
	}
	return commands.length > 0 ? `asendcmd=c='${commands.join(";")}'` : null;
}

export function appendAutomatedAudioFilter({
	transforms,
	keyframes,
	fallback,
	fps,
	target,
	command,
	filter,
	transform,
}: {
	transforms: string[];
	keyframes: AudioPropertyKeyframe[] | undefined;
	fallback: number;
	fps: number;
	target: string;
	command: string;
	filter: string;
	transform?: (value: number) => number;
}): void {
	const runtimeCommands = buildAudioRuntimeCommands({
		keyframes,
		fallback,
		fps,
		target,
		command,
		transform,
	});
	if (runtimeCommands) transforms.push(runtimeCommands);
	transforms.push(filter);
}
