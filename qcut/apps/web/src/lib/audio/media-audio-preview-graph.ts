import type { AudioPreviewState } from "./audio-preview-state";
import { dbToGain } from "./audio-properties";
import { clampPlaybackRate } from "@/lib/video/video-timing";
import { FormantCorrectionNode } from "@soundtouchjs/formant-correction-worklet";
import formantProcessorUrl from "@soundtouchjs/formant-correction-worklet/processor?url";
import {
	getAudioMixContext,
	getAudioTrackInput,
	resumeAudioMixEngine,
} from "./audio-mix-engine";

interface MediaAudioPreviewGraph {
	update: ({ state }: { state: AudioPreviewState }) => void;
	setConnected: ({ connected }: { connected: boolean }) => void;
	setTrackId: ({ trackId }: { trackId: string }) => void;
}

const graphs = new WeakMap<HTMLMediaElement, MediaAudioPreviewGraph>();
const pitchRegistrations = new WeakMap<BaseAudioContext, Promise<void>>();

function smooth({
	parameter,
	value,
	context,
}: {
	parameter: AudioParam;
	value: number;
	context: AudioContext;
}) {
	parameter.cancelScheduledValues(context.currentTime);
	parameter.setTargetAtTime(value, context.currentTime, 0.012);
}

function createImpulse({
	context,
	roomSize,
	damping,
}: {
	context: AudioContext;
	roomSize: number;
	damping: number;
}): AudioBuffer {
	const duration = 0.25 + (roomSize / 100) * 2.75;
	const length = Math.max(1, Math.round(context.sampleRate * duration));
	const impulse = context.createBuffer(2, length, context.sampleRate);
	const decay = 1.5 + (damping / 100) * 5;
	for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
		const samples = impulse.getChannelData(channel);
		for (let index = 0; index < samples.length; index += 1) {
			const envelope = (1 - index / samples.length) ** decay;
			samples[index] = (Math.random() * 2 - 1) * envelope;
		}
	}
	return impulse;
}

function registerPitchProcessor({
	context,
}: {
	context: AudioContext;
}): Promise<void> {
	const existing = pitchRegistrations.get(context);
	if (existing) return existing;
	const registration = FormantCorrectionNode.register(
		context,
		formantProcessorUrl
	);
	pitchRegistrations.set(context, registration);
	return registration;
}

function createGraph({
	context,
	mediaElement,
	trackId,
}: {
	context: AudioContext;
	mediaElement: HTMLMediaElement;
	trackId: string;
}): MediaAudioPreviewGraph {
	const source = context.createMediaElementSource(mediaElement);
	const input = context.createGain();
	const denoiseHighpass = context.createBiquadFilter();
	const denoiseLowpass = context.createBiquadFilter();
	const eqLow = context.createBiquadFilter();
	const eqMid = context.createBiquadFilter();
	const eqHigh = context.createBiquadFilter();
	const warmth = context.createBiquadFilter();
	const clarity = context.createBiquadFilter();
	const presence = context.createBiquadFilter();
	const pitchDry = context.createGain();
	const pitchWet = context.createGain();
	const compressor = context.createDynamicsCompressor();
	const compressorMakeup = context.createGain();
	const limiter = context.createDynamicsCompressor();
	const telephoneDry = context.createGain();
	const telephoneHighpass = context.createBiquadFilter();
	const telephoneLowpass = context.createBiquadFilter();
	const telephoneWet = context.createGain();
	const effectsBus = context.createGain();
	const dryGain = context.createGain();
	const convolver = context.createConvolver();
	const reverbGain = context.createGain();
	const delay = context.createDelay(2);
	const echoGain = context.createGain();
	const feedbackGain = context.createGain();
	const panner = context.createStereoPanner();
	const output = context.createGain();

	denoiseHighpass.type = "highpass";
	denoiseLowpass.type = "lowpass";
	eqLow.type = "lowshelf";
	eqLow.frequency.value = 160;
	eqMid.type = "peaking";
	eqMid.frequency.value = 1_000;
	eqMid.Q.value = 0.8;
	eqHigh.type = "highshelf";
	eqHigh.frequency.value = 5_500;
	warmth.type = "lowshelf";
	warmth.frequency.value = 220;
	clarity.type = "peaking";
	clarity.frequency.value = 2_400;
	clarity.Q.value = 0.85;
	presence.type = "highshelf";
	presence.frequency.value = 4_800;
	telephoneHighpass.type = "highpass";
	telephoneHighpass.frequency.value = 320;
	telephoneLowpass.type = "lowpass";
	telephoneLowpass.frequency.value = 3_400;
	limiter.knee.value = 0;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.003;

	source.connect(input);
	input.connect(denoiseHighpass);
	denoiseHighpass.connect(denoiseLowpass);
	denoiseLowpass.connect(eqLow);
	eqLow.connect(eqMid);
	eqMid.connect(eqHigh);
	eqHigh.connect(warmth);
	warmth.connect(clarity);
	clarity.connect(presence);
	presence.connect(pitchDry);
	pitchDry.connect(compressor);
	pitchWet.connect(compressor);
	compressor.connect(compressorMakeup);
	compressorMakeup.connect(limiter);
	limiter.connect(telephoneDry);
	telephoneDry.connect(effectsBus);
	limiter.connect(telephoneHighpass);
	telephoneHighpass.connect(telephoneLowpass);
	telephoneLowpass.connect(telephoneWet);
	telephoneWet.connect(effectsBus);
	effectsBus.connect(dryGain);
	dryGain.connect(panner);
	effectsBus.connect(convolver);
	convolver.connect(reverbGain);
	reverbGain.connect(panner);
	effectsBus.connect(delay);
	delay.connect(echoGain);
	echoGain.connect(panner);
	delay.connect(feedbackGain);
	feedbackGain.connect(delay);
	panner.connect(output);
	let connectedTrackId = trackId;
	const initialTrackInput = getAudioTrackInput({ trackId });
	if (!initialTrackInput) throw new Error("Audio track input is unavailable");
	let trackInput: AudioNode = initialTrackInput;
	output.connect(trackInput);
	let connected = true;
	let impulseSignature = "";
	let pitchNode: FormantCorrectionNode | null = null;
	let latestState: AudioPreviewState | null = null;
	const applyPitch = ({ state }: { state: AudioPreviewState }) => {
		const pitchEnabled =
			state.settings.pitch.enabled &&
			Math.abs(state.settings.pitch.semitones) >= 0.01;
		if (!pitchNode) {
			smooth({ parameter: pitchDry.gain, value: 1, context });
			smooth({ parameter: pitchWet.gain, value: 0, context });
			mediaElement.dataset.audioPreviewPitch = pitchEnabled ? "loading" : "off";
			return;
		}
		const playbackRate = clampPlaybackRate(mediaElement.playbackRate);
		smooth({
			parameter: pitchNode.playbackRate,
			value: playbackRate,
			context,
		});
		smooth({
			parameter: pitchNode.pitchSemitones,
			value: pitchEnabled ? state.settings.pitch.semitones : 0,
			context,
		});
		smooth({
			parameter: pitchNode.formantStrength,
			value: pitchEnabled && state.settings.pitch.preserveFormants ? 1 : 0,
			context,
		});
		smooth({ parameter: pitchDry.gain, value: pitchEnabled ? 0 : 1, context });
		smooth({ parameter: pitchWet.gain, value: pitchEnabled ? 1 : 0, context });
		mediaElement.dataset.audioPreviewPitch = pitchEnabled
			? state.settings.pitch.preserveFormants
				? "formant"
				: "standard"
			: "off";
		mediaElement.dataset.audioPreviewPitchRate = playbackRate.toFixed(4);
	};
	registerPitchProcessor({ context })
		.then(() => {
			pitchNode = new FormantCorrectionNode({ context });
			presence.connect(pitchNode);
			pitchNode.connect(pitchWet);
			if (latestState) applyPitch({ state: latestState });
		})
		.catch(() => {
			mediaElement.dataset.audioPreviewPitch = "unavailable";
		});

	return {
		update: ({ state }) => {
			latestState = state;
			const { settings } = state;
			const denoiseAmount = settings.denoise.enabled
				? settings.denoise.amount / 100
				: 0;
			smooth({
				parameter: denoiseHighpass.frequency,
				value: 20 + denoiseAmount * 120,
				context,
			});
			applyPitch({ state });
			smooth({
				parameter: denoiseLowpass.frequency,
				value: 22_000 - denoiseAmount * 12_000,
				context,
			});
			smooth({
				parameter: eqLow.gain,
				value: settings.equalizer.enabled ? settings.equalizer.lowGainDb : 0,
				context,
			});
			smooth({
				parameter: eqMid.gain,
				value: settings.equalizer.enabled ? settings.equalizer.midGainDb : 0,
				context,
			});
			smooth({
				parameter: eqHigh.gain,
				value: settings.equalizer.enabled ? settings.equalizer.highGainDb : 0,
				context,
			});
			smooth({
				parameter: warmth.gain,
				value: settings.voiceEnhance.enabled
					? settings.voiceEnhance.warmth * 0.08
					: 0,
				context,
			});
			smooth({
				parameter: clarity.gain,
				value: settings.voiceEnhance.enabled
					? settings.voiceEnhance.clarity * 0.08
					: 0,
				context,
			});
			smooth({
				parameter: presence.gain,
				value: settings.voiceEnhance.enabled
					? settings.voiceEnhance.presence * 0.08
					: 0,
				context,
			});
			smooth({
				parameter: compressor.threshold,
				value: settings.compressor.enabled
					? settings.compressor.thresholdDb
					: 0,
				context,
			});
			smooth({
				parameter: compressor.ratio,
				value: settings.compressor.enabled ? settings.compressor.ratio : 1,
				context,
			});
			smooth({
				parameter: compressor.attack,
				value: settings.compressor.attackMs / 1_000,
				context,
			});
			smooth({
				parameter: compressor.release,
				value: settings.compressor.releaseMs / 1_000,
				context,
			});
			smooth({
				parameter: compressorMakeup.gain,
				value: settings.compressor.enabled
					? dbToGain({ db: settings.compressor.makeupGainDb })
					: 1,
				context,
			});
			smooth({
				parameter: limiter.threshold,
				value: settings.limiter.enabled ? settings.limiter.ceilingDb : 0,
				context,
			});
			smooth({
				parameter: limiter.ratio,
				value: settings.limiter.enabled ? 20 : 1,
				context,
			});
			smooth({
				parameter: limiter.release,
				value: settings.limiter.releaseMs / 1_000,
				context,
			});
			const telephoneMix = settings.telephone.enabled
				? settings.telephone.mix / 100
				: 0;
			smooth({
				parameter: telephoneDry.gain,
				value: 1 - telephoneMix,
				context,
			});
			smooth({ parameter: telephoneWet.gain, value: telephoneMix, context });
			const reverbMix = settings.reverb.enabled ? settings.reverb.mix / 100 : 0;
			const echoMix = settings.echo.enabled ? settings.echo.mix / 100 : 0;
			smooth({
				parameter: dryGain.gain,
				value: Math.max(0, 1 - Math.max(reverbMix, echoMix)),
				context,
			});
			smooth({ parameter: reverbGain.gain, value: reverbMix, context });
			smooth({
				parameter: delay.delayTime,
				value: settings.echo.delayMs / 1_000,
				context,
			});
			smooth({ parameter: echoGain.gain, value: echoMix, context });
			smooth({
				parameter: feedbackGain.gain,
				value: settings.echo.enabled
					? Math.min(0.85, settings.echo.feedback / 100)
					: 0,
				context,
			});
			const nextImpulseSignature = `${settings.reverb.roomSize}:${settings.reverb.damping}`;
			if (
				settings.reverb.enabled &&
				nextImpulseSignature !== impulseSignature
			) {
				convolver.buffer = createImpulse({
					context,
					roomSize: settings.reverb.roomSize,
					damping: settings.reverb.damping,
				});
				impulseSignature = nextImpulseSignature;
			}
			smooth({ parameter: panner.pan, value: state.pan, context });
			smooth({ parameter: output.gain, value: state.outputGain, context });
			mediaElement.volume = 1;
			mediaElement.muted = false;
			mediaElement.preservesPitch = true;
			mediaElement.dataset.audioPreview = "web-audio";
			mediaElement.dataset.audioPreviewGain = state.outputGain.toFixed(4);
			mediaElement.dataset.audioPreviewPan = state.pan.toFixed(4);
			mediaElement.dataset.audioPreviewEffects = [
				settings.denoise.enabled ? "denoise" : null,
				settings.voiceEnhance.enabled ? "voice" : null,
				settings.equalizer.enabled ? "equalizer" : null,
				settings.compressor.enabled ? "compressor" : null,
				settings.limiter.enabled ? "limiter" : null,
				settings.reverb.enabled ? "reverb" : null,
				settings.echo.enabled ? "echo" : null,
				settings.telephone.enabled ? "telephone" : null,
			]
				.filter((effect): effect is string => effect !== null)
				.join(",");
		},
		setConnected: ({ connected: shouldConnect }) => {
			if (connected === shouldConnect) return;
			if (shouldConnect) output.connect(trackInput);
			else output.disconnect();
			connected = shouldConnect;
		},
		setTrackId: ({ trackId: nextTrackId }) => {
			if (connectedTrackId === nextTrackId) return;
			const nextTrackInput = getAudioTrackInput({ trackId: nextTrackId });
			if (!nextTrackInput) return;
			if (connected) output.disconnect();
			connectedTrackId = nextTrackId;
			trackInput = nextTrackInput;
			if (connected) output.connect(trackInput);
		},
	};
}

export function acquireMediaAudioPreview({
	mediaElement,
	trackId,
}: {
	mediaElement: HTMLMediaElement;
	trackId: string;
}): MediaAudioPreviewGraph | null {
	const existing = graphs.get(mediaElement);
	if (existing) {
		existing.setTrackId({ trackId });
		existing.setConnected({ connected: true });
		return existing;
	}
	const context = getAudioMixContext();
	if (!context) return null;
	try {
		const graph = createGraph({ context, mediaElement, trackId });
		graphs.set(mediaElement, graph);
		return graph;
	} catch {
		mediaElement.dataset.audioPreview = "fallback";
		return null;
	}
}

export function releaseMediaAudioPreview({
	mediaElement,
}: {
	mediaElement: HTMLMediaElement;
}) {
	graphs.get(mediaElement)?.setConnected({ connected: false });
}

export async function resumeMediaAudioPreview(): Promise<void> {
	await resumeAudioMixEngine();
}
