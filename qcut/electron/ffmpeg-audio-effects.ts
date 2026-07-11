import type { AudioSettings } from "./ffmpeg/audio-settings";
import { calculateReverbDecay } from "./ffmpeg/audio-effect-values";
import {
	appendAutomatedAudioFilter,
	audioKeyframeValueAtFrame,
	audioPropertyExpression,
	buildAudioRuntimeCommands,
	formatAudioNumber,
} from "./ffmpeg/audio-keyframe-automation";

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function dbToLinear({ db }: { db: number }) {
	if (db <= -60) return 0;
	return 10 ** (db / 20);
}

export function buildAudioEnvelopeFilter({
	audio,
	fallbackVolume,
	effectiveDuration,
	fps,
}: {
	audio: AudioSettings | undefined;
	fallbackVolume: number;
	effectiveDuration: number | undefined;
	fps: number;
}): string | null {
	if (!audio) {
		return fallbackVolume === 1
			? null
			: `volume=${formatAudioNumber({ value: fallbackVolume })}`;
	}
	if (!audio.enabled) return "volume=0";
	const volumeDb = audioPropertyExpression({
		audio,
		property: "volumeDb",
		fallback: audio.volumeDb,
		fps,
	});
	const gain = `if(lte(st(0,${volumeDb}),-60),0,pow(10,ld(0)/20))`;
	const fadeInDuration = audioPropertyExpression({
		audio,
		property: "fadeIn",
		fallback: audio.fadeIn,
		fps,
	});
	const fadeIn = `if(gt(st(1,${fadeInDuration}),0),min(1,t/ld(1)),1)`;
	const fadeOutDuration = audioPropertyExpression({
		audio,
		property: "fadeOut",
		fallback: audio.fadeOut,
		fps,
	});
	const fadeOut =
		effectiveDuration === undefined
			? "1"
			: `if(gt(st(2,${fadeOutDuration}),0),min(1,max(0,(${formatAudioNumber({ value: effectiveDuration })}-t)/ld(2))),1)`;
	const hasAutomation = Object.values(audio.keyframes ?? {}).some(
		(keyframes) => (keyframes?.length ?? 0) > 0
	);
	if (!hasAutomation && audio.fadeIn <= 0 && audio.fadeOut <= 0) {
		const staticGain = dbToLinear({ db: audio.volumeDb });
		return staticGain === 1
			? null
			: `volume=${formatAudioNumber({ value: staticGain })}`;
	}
	return `volume='(${gain})*(${fadeIn})*(${fadeOut})':eval=frame`;
}

export function buildAudioEffectTransforms({
	audio,
	fps = 30,
	instanceSuffix = "0",
	stage = "all",
}: {
	audio: AudioSettings | undefined;
	fps?: number;
	instanceSuffix?: string;
	stage?: "all" | "pre-pitch" | "dynamics" | "output";
}): string[] {
	if (!audio) return [];
	const transforms: string[] = [];
	const includesPrePitch = stage === "all" || stage === "pre-pitch";
	const includesDynamics = stage === "all" || stage === "dynamics";
	const includesOutput = stage === "all" || stage === "output";
	const includesGraphManaged = stage === "all";
	if (
		includesPrePitch &&
		audio.denoise.enabled &&
		(audio.denoise.amount > 0 || audio.keyframes?.denoiseAmount?.length)
	) {
		const denoiseTarget = `afftdn@qcutdenoise${instanceSuffix}`;
		const amountTransform = (value: number) =>
			clamp({ value: Math.max(0.01, value * 0.97), min: 0.01, max: 97 });
		const amount = amountTransform(
			audioKeyframeValueAtFrame({
				keyframes: audio.keyframes?.denoiseAmount,
				frame: 0,
				fallback: audio.denoise.amount,
			})
		);
		appendAutomatedAudioFilter({
			transforms,
			keyframes: audio.keyframes?.denoiseAmount,
			fallback: audio.denoise.amount,
			fps,
			target: denoiseTarget,
			command: "noise_reduction",
			filter: `${denoiseTarget}=nr=${formatAudioNumber({ value: amount })}:nf=${formatAudioNumber({ value: clamp({ value: audio.denoise.noiseFloorDb, min: -80, max: -20 }) })}:tn=1`,
			transform: amountTransform,
		});
	}
	if (
		includesGraphManaged &&
		audio.telephone.enabled &&
		audio.telephone.mix > 0
	) {
		const mix = clamp({ value: audio.telephone.mix / 100, min: 0, max: 1 });
		transforms.push(
			`highpass=f=300:mix=${formatAudioNumber({ value: mix })}`,
			`lowpass=f=3400:mix=${formatAudioNumber({ value: mix })}`
		);
	}
	if (includesPrePitch && audio.equalizer.enabled) {
		for (const [property, frequency, fallback, name] of [
			["eqLowGainDb", 120, audio.equalizer.lowGainDb, "low"],
			["eqMidGainDb", 1_000, audio.equalizer.midGainDb, "mid"],
			["eqHighGainDb", 6_500, audio.equalizer.highGainDb, "high"],
		] as const) {
			const target = `equalizer@qcuteq${name}${instanceSuffix}`;
			const initial = audioKeyframeValueAtFrame({
				keyframes: audio.keyframes?.[property],
				frame: 0,
				fallback,
			});
			appendAutomatedAudioFilter({
				transforms,
				keyframes: audio.keyframes?.[property],
				fallback,
				fps,
				target,
				command: "gain",
				filter: `${target}=f=${frequency}:t=q:w=0.8:g=${formatAudioNumber({ value: initial })}`,
			});
		}
	}
	if (includesPrePitch && audio.voiceEnhance.enabled) {
		for (const [property, frequency, fallback, name] of [
			["voiceWarmth", 220, audio.voiceEnhance.warmth, "warmth"],
			["voiceClarity", 2_400, audio.voiceEnhance.clarity, "clarity"],
			["voicePresence", 4_800, audio.voiceEnhance.presence, "presence"],
		] as const) {
			const target = `equalizer@qcutvoice${name}${instanceSuffix}`;
			const gainTransform = (value: number) => value * 0.08;
			const initial = gainTransform(
				audioKeyframeValueAtFrame({
					keyframes: audio.keyframes?.[property],
					frame: 0,
					fallback,
				})
			);
			appendAutomatedAudioFilter({
				transforms,
				keyframes: audio.keyframes?.[property],
				fallback,
				fps,
				target,
				command: "gain",
				filter: `${target}=f=${frequency}:t=q:w=0.9:g=${formatAudioNumber({ value: initial })}`,
				transform: gainTransform,
			});
		}
	}
	if (includesDynamics && audio.compressor.enabled) {
		const target = `acompressor@qcutcompressor${instanceSuffix}`;
		const threshold = audioKeyframeValueAtFrame({
			keyframes: audio.keyframes?.compressorThresholdDb,
			frame: 0,
			fallback: audio.compressor.thresholdDb,
		});
		const ratio = audioKeyframeValueAtFrame({
			keyframes: audio.keyframes?.compressorRatio,
			frame: 0,
			fallback: audio.compressor.ratio,
		});
		const thresholdCommands = buildAudioRuntimeCommands({
			keyframes: audio.keyframes?.compressorThresholdDb,
			fallback: audio.compressor.thresholdDb,
			fps,
			target,
			command: "threshold",
			transform: (value) => dbToLinear({ db: value }),
		});
		const ratioCommands = buildAudioRuntimeCommands({
			keyframes: audio.keyframes?.compressorRatio,
			fallback: audio.compressor.ratio,
			fps,
			target,
			command: "ratio",
			transform: (value) => clamp({ value, min: 1, max: 20 }),
		});
		if (thresholdCommands) transforms.push(thresholdCommands);
		if (ratioCommands) transforms.push(ratioCommands);
		transforms.push(
			`${target}=threshold=${formatAudioNumber({ value: dbToLinear({ db: threshold }) })}:ratio=${formatAudioNumber({ value: clamp({ value: ratio, min: 1, max: 20 }) })}:attack=${formatAudioNumber({ value: clamp({ value: audio.compressor.attackMs, min: 0.01, max: 2000 }) })}:release=${formatAudioNumber({ value: clamp({ value: audio.compressor.releaseMs, min: 0.01, max: 9000 }) })}:makeup=${formatAudioNumber({ value: dbToLinear({ db: audio.compressor.makeupGainDb }) })}`
		);
	}
	if (
		includesGraphManaged &&
		audio.pitch.enabled &&
		Math.abs(audio.pitch.semitones) >= 0.01
	) {
		const factor =
			2 ** (clamp({ value: audio.pitch.semitones, min: -12, max: 12 }) / 12);
		transforms.push(
			"aresample=48000",
			`asetrate=${formatAudioNumber({ value: 48_000 * factor })}`,
			"aresample=48000",
			`atempo=${formatAudioNumber({ value: 1 / factor })}`
		);
	}
	if (includesGraphManaged && audio.reverb.enabled && audio.reverb.mix > 0) {
		const wetMix = clamp({ value: audio.reverb.mix / 100, min: 0, max: 1 });
		const decay = clamp({
			value:
				calculateReverbDecay({
					roomSize: audio.reverb.roomSize,
					damping: audio.reverb.damping,
				}) *
				(0.25 + wetMix * 0.75),
			min: 0.05,
			max: 0.8,
		});
		const room = clamp({ value: audio.reverb.roomSize / 100, min: 0, max: 1 });
		transforms.push(
			`aecho=0.8:0.9:${formatAudioNumber({ value: 18 + room * 22 })}|${formatAudioNumber({ value: 31 + room * 39 })}:${formatAudioNumber({ value: decay })}|${formatAudioNumber({ value: decay * 0.65 })}`
		);
	}
	if (includesGraphManaged && audio.echo.enabled && audio.echo.mix > 0) {
		transforms.push(
			`aecho=0.8:${formatAudioNumber({ value: clamp({ value: 0.5 + audio.echo.mix / 200, min: 0.5, max: 1 }) })}:${formatAudioNumber({ value: clamp({ value: audio.echo.delayMs, min: 20, max: 2000 }) })}:${formatAudioNumber({ value: clamp({ value: audio.echo.feedback / 100, min: 0.01, max: 0.85 }) })}`
		);
	}
	if (includesDynamics && audio.limiter.enabled) {
		transforms.push(
			`alimiter=limit=${formatAudioNumber({ value: dbToLinear({ db: audio.limiter.ceilingDb }) })}:attack=5:release=${formatAudioNumber({ value: clamp({ value: audio.limiter.releaseMs, min: 10, max: 1000 }) })}`
		);
	}
	if (includesOutput && audio.loudness.enabled) {
		transforms.push(
			`loudnorm=I=${formatAudioNumber({ value: clamp({ value: audio.loudness.targetLufs, min: -70, max: -5 }) })}:LRA=${formatAudioNumber({ value: clamp({ value: audio.loudness.loudnessRange, min: 1, max: 50 }) })}:TP=${formatAudioNumber({ value: clamp({ value: audio.loudness.truePeakDb, min: -9, max: 0 }) })}`
		);
	}
	const pan = audio.panEnabled
		? clamp({
				value:
					audioKeyframeValueAtFrame({
						keyframes: audio.keyframes?.pan,
						frame: 0,
						fallback: audio.pan * 100,
					}) / 100,
				min: -1,
				max: 1,
			})
		: 0;
	if (
		includesOutput &&
		(pan !== 0 || (audio.panEnabled && audio.keyframes?.pan?.length))
	) {
		const target = `stereotools@qcutpan${instanceSuffix}`;
		const commands = buildAudioRuntimeCommands({
			keyframes: audio.keyframes?.pan,
			fallback: audio.pan * 100,
			fps,
			target,
			command: "balance_out",
			transform: (value) => clamp({ value: value / 100, min: -1, max: 1 }),
		});
		if (commands) transforms.push(commands);
		transforms.push(
			"aformat=channel_layouts=stereo",
			`${target}=balance_out=${formatAudioNumber({ value: pan })}`
		);
	}
	return transforms;
}
