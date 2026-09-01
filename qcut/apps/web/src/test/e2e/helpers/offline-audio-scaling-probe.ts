/**
 * Offline-audio scaling probe.
 *
 * Renders synthetic `OfflineAudioContext` graphs inside the real renderer so
 * the superlinear cost of stacking audio clips can be attributed to one factor
 * at a time: graph node count, automation events, the reverb convolver, the
 * echo delay line, the summing topology (direct fan-in vs a shared mix bus),
 * and source scheduling.
 *
 * The probe deliberately reconstructs the production per-clip chain rather
 * than calling the exporter, so a single factor can be removed without
 * touching production code or changing any exported output.
 */

import type { Page } from "@playwright/test";

export interface ScalingProbeConfig {
	/** Number of simultaneous clip chains in the graph. */
	clips: number;
	/** Build the full production-shaped chain rather than source -> destination. */
	chain: boolean;
	/** Schedule the same parameter ramps the exporter schedules. */
	automation: boolean;
	/** Include the convolution reverb branch. */
	convolver: boolean;
	/** Include the delay + feedback branch. */
	delay: boolean;
	/** Sum through one shared gain instead of connecting each clip to output. */
	mixBus: boolean;
	/** Stagger clip starts instead of starting them all at zero. */
	stagger: boolean;
	/**
	 * Build the reverb impulse once and share the buffer across clips instead
	 * of rebuilding an identical buffer per clip.
	 */
	sharedImpulse?: boolean;
}

export interface ScalingProbeResult {
	config: ScalingProbeConfig;
	renderMs: number[];
	medianMs: number;
	p95Ms: number;
	minMs: number;
	maxMs: number;
	/** Median time spent building the graph, before rendering starts. */
	buildMedianMs: number;
}

export const DEFAULT_PROBE = {
	seconds: 6,
	sampleRate: 48_000,
	clipSeconds: 1.5,
} as const;

function percentile(values: readonly number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.floor(sorted.length * fraction)
	);
	return Number(sorted[index].toFixed(2));
}

export function summarizeRuns({
	config,
	renderMs,
	buildMs = [],
}: {
	config: ScalingProbeConfig;
	renderMs: number[];
	buildMs?: number[];
}): ScalingProbeResult {
	return {
		buildMedianMs: percentile(buildMs, 0.5),
		config,
		renderMs: renderMs.map((value) => Number(value.toFixed(2))),
		maxMs: percentile(renderMs, 1),
		medianMs: percentile(renderMs, 0.5),
		minMs: percentile(renderMs, 0),
		p95Ms: percentile(renderMs, 0.95),
	};
}

/**
 * Runs one configuration `rounds` times in the renderer and returns each
 * render's wall time.
 */
export async function runScalingProbe({
	page,
	config,
	rounds,
	seconds = DEFAULT_PROBE.seconds,
	sampleRate = DEFAULT_PROBE.sampleRate,
	clipSeconds = DEFAULT_PROBE.clipSeconds,
}: {
	page: Page;
	config: ScalingProbeConfig;
	rounds: number;
	seconds?: number;
	sampleRate?: number;
	clipSeconds?: number;
}): Promise<ScalingProbeResult> {
	const renderMs = await page.evaluate(
		async ({ config, rounds, seconds, sampleRate, clipSeconds }) => {
			const times: number[] = [];
			const builds: number[] = [];
			for (let round = 0; round < rounds; round += 1) {
				const context = new OfflineAudioContext(
					2,
					Math.ceil(seconds * sampleRate),
					sampleRate
				);

				// Deterministic source material: one buffer reused by every clip so
				// the only difference between configurations is graph shape.
				const buffer = context.createBuffer(
					2,
					Math.ceil(clipSeconds * sampleRate),
					sampleRate
				);
				for (let channel = 0; channel < 2; channel += 1) {
					const data = buffer.getChannelData(channel);
					for (let index = 0; index < data.length; index += 1) {
						data[index] =
							Math.sin((index / sampleRate) * 2 * Math.PI * 440) * 0.25;
					}
				}

				const sharedBus = config.mixBus ? context.createGain() : null;
				sharedBus?.connect(context.destination);

				// Faithful copy of the exporter's impulse generator: a fixed-seed
				// LCG plus a per-sample pow envelope, so every call with the same
				// room size and damping produces an identical buffer.
				const buildImpulse = (): AudioBuffer => {
					const roomSize = 50;
					const damping = 50;
					const impulseSeconds = 0.25 + (roomSize / 100) * 2.75;
					const impulse = context.createBuffer(
						2,
						Math.max(1, Math.round(sampleRate * impulseSeconds)),
						sampleRate
					);
					const decay = 1.5 + (damping / 100) * 5;
					let seed = 0x51f15e;
					for (
						let channel = 0;
						channel < impulse.numberOfChannels;
						channel += 1
					) {
						const samples = impulse.getChannelData(channel);
						for (let index = 0; index < samples.length; index += 1) {
							seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
							const noise = (seed / 0xffff_ffff) * 2 - 1;
							samples[index] = noise * (1 - index / samples.length) ** decay;
						}
					}
					return impulse;
				};

				// Started before the shared impulse is built so both configurations
				// are charged for the impulse work they actually do.
				const buildStartedAt = performance.now();
				const sharedImpulse =
					config.sharedImpulse && config.convolver ? buildImpulse() : null;

				for (let clip = 0; clip < config.clips; clip += 1) {
					const source = context.createBufferSource();
					source.buffer = buffer;
					const sink = sharedBus ?? context.destination;

					if (config.chain) {
						// Production-shaped chain: gain -> 2 denoise filters -> 3 EQ
						// bands -> 3 voice filters -> compressor -> makeup -> limiter
						// -> telephone split -> effects bus -> dry/reverb/echo -> pan.
						const input = context.createGain();
						const filters = Array.from({ length: 8 }, () =>
							context.createBiquadFilter()
						);
						const compressor = context.createDynamicsCompressor();
						const makeup = context.createGain();
						const limiter = context.createDynamicsCompressor();
						const telephoneDry = context.createGain();
						const telephoneHighpass = context.createBiquadFilter();
						const telephoneLowpass = context.createBiquadFilter();
						const telephoneWet = context.createGain();
						const effectsBus = context.createGain();
						const dryGain = context.createGain();
						const panner = context.createStereoPanner();
						const output = context.createGain();

						source.connect(input);
						let tail: AudioNode = input;
						for (const filter of filters) {
							tail.connect(filter);
							tail = filter;
						}
						tail.connect(compressor);
						compressor.connect(makeup);
						makeup.connect(limiter);
						limiter.connect(telephoneDry);
						telephoneDry.connect(effectsBus);
						limiter.connect(telephoneHighpass);
						telephoneHighpass.connect(telephoneLowpass);
						telephoneLowpass.connect(telephoneWet);
						telephoneWet.connect(effectsBus);
						effectsBus.connect(dryGain);
						dryGain.connect(panner);

						if (config.convolver) {
							const convolver = context.createConvolver();
							convolver.buffer = sharedImpulse ?? buildImpulse();
							const reverbGain = context.createGain();
							reverbGain.gain.value = 0;
							effectsBus.connect(convolver);
							convolver.connect(reverbGain);
							reverbGain.connect(panner);
						}

						if (config.delay) {
							const delay = context.createDelay(2);
							const echoGain = context.createGain();
							const feedbackGain = context.createGain();
							delay.delayTime.value = 0.25;
							echoGain.gain.value = 0;
							feedbackGain.gain.value = 0;
							effectsBus.connect(delay);
							delay.connect(echoGain);
							echoGain.connect(panner);
							delay.connect(feedbackGain);
							feedbackGain.connect(delay);
						}

						panner.connect(output);
						output.connect(sink);

						if (config.automation) {
							// Two-point ramps, matching what a plain clip schedules.
							const params: AudioParam[] = [
								output.gain,
								panner.pan,
								dryGain.gain,
								makeup.gain,
								telephoneDry.gain,
								telephoneWet.gain,
								compressor.threshold,
								compressor.ratio,
								limiter.threshold,
								...filters.map((filter) => filter.gain),
							];
							for (const param of params) {
								param.setValueAtTime(param.value, 0);
								param.linearRampToValueAtTime(param.value, clipSeconds);
							}
						}
					} else {
						source.connect(sink);
					}

					const startAt = config.stagger ? clip * 0.75 : 0;
					source.start(startAt, 0, clipSeconds);
					source.stop(startAt + clipSeconds);
				}

				const startedAt = performance.now();
				builds.push(startedAt - buildStartedAt);
				await context.startRendering();
				times.push(performance.now() - startedAt);
			}
			return { builds, times };
		},
		{ clipSeconds, config, rounds, sampleRate, seconds }
	);
	return summarizeRuns({
		buildMs: renderMs.builds,
		config,
		renderMs: renderMs.times,
	});
}

export function baseConfig({
	clips,
	overrides = {},
}: {
	clips: number;
	overrides?: Partial<ScalingProbeConfig>;
}): ScalingProbeConfig {
	return {
		automation: true,
		chain: true,
		clips,
		convolver: true,
		delay: true,
		mixBus: false,
		stagger: true,
		...overrides,
	};
}
