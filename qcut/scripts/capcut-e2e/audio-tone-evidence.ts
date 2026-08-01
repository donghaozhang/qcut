import { runCommand } from "./runtime.js";
import { CAPCUT_E2E_FIXTURE_SPEC, type CapCutE2eFixtureSpec } from "./spec.js";

const FREQUENCY_TOLERANCE_HZ = 1;

export interface AudioToneWindowEvidence {
	durationSeconds: number;
	expectedFrequencyHz: number;
	measuredFrequencyHz: number;
	method: "ffmpeg-astats-zero-crossings";
	startSeconds: number;
	toleranceHz: number;
	zeroCrossings: number;
}

export interface SourceAudioToneEvidence {
	clipA: AudioToneWindowEvidence;
	clipB: AudioToneWindowEvidence;
}

export function buildAstatsToneArgs({
	durationSeconds,
	mediaPath,
	startSeconds,
}: {
	durationSeconds: number;
	mediaPath: string;
	startSeconds: number;
}): string[] {
	const endSeconds = startSeconds + durationSeconds;
	return [
		"-hide_banner",
		"-nostats",
		"-i",
		mediaPath,
		"-af",
		`atrim=start=${startSeconds}:end=${endSeconds},astats=metadata=0:reset=0:measure_perchannel=Zero_crossings:measure_overall=none`,
		"-f",
		"null",
		"-",
	];
}

export function parseAstatsZeroCrossings({
	stderr,
}: {
	stderr: string;
}): number {
	const matches = [...stderr.matchAll(/\bZero crossings:\s+(\d+)\b/g)];
	if (matches.length !== 1) {
		throw new Error(
			`FFmpeg astats must report exactly one zero-crossing measurement; received ${matches.length}.`
		);
	}
	const zeroCrossings = Number(matches[0]?.[1]);
	if (!Number.isSafeInteger(zeroCrossings) || zeroCrossings <= 0) {
		throw new Error("FFmpeg astats returned an invalid zero-crossing count.");
	}
	return zeroCrossings;
}

function validateToneWindow({
	evidence,
	expectedDurationSeconds,
	expectedFrequencyHz,
	expectedStartSeconds,
	label,
}: {
	evidence: AudioToneWindowEvidence;
	expectedDurationSeconds: number;
	expectedFrequencyHz: number;
	expectedStartSeconds: number;
	label: string;
}): void {
	if (
		evidence.method !== "ffmpeg-astats-zero-crossings" ||
		evidence.startSeconds !== expectedStartSeconds ||
		evidence.durationSeconds !== expectedDurationSeconds ||
		evidence.expectedFrequencyHz !== expectedFrequencyHz ||
		evidence.toleranceHz !== FREQUENCY_TOLERANCE_HZ ||
		!Number.isSafeInteger(evidence.zeroCrossings) ||
		evidence.zeroCrossings <= 0 ||
		!Number.isFinite(evidence.measuredFrequencyHz)
	) {
		throw new Error(`${label} tone evidence has an invalid shape.`);
	}
	if (
		Math.abs(evidence.measuredFrequencyHz - expectedFrequencyHz) >
		evidence.toleranceHz
	) {
		throw new Error(
			`${label} measured ${evidence.measuredFrequencyHz} Hz; expected ${expectedFrequencyHz} ± ${evidence.toleranceHz} Hz.`
		);
	}
	const frequencyFromZeroCrossings =
		evidence.zeroCrossings / (2 * evidence.durationSeconds);
	if (
		Math.abs(frequencyFromZeroCrossings - evidence.measuredFrequencyHz) > 1e-9
	) {
		throw new Error(
			`${label} measured frequency does not match its zero-crossing evidence.`
		);
	}
}

export function validateSourceAudioToneEvidence({
	evidence,
	spec = CAPCUT_E2E_FIXTURE_SPEC,
}: {
	evidence: SourceAudioToneEvidence;
	spec?: CapCutE2eFixtureSpec;
}): void {
	validateToneWindow({
		evidence: evidence.clipA,
		expectedDurationSeconds: spec.clipDurationSeconds,
		expectedFrequencyHz: spec.audio.clipAFrequencyHz,
		expectedStartSeconds: 0,
		label: "Clip A audio",
	});
	validateToneWindow({
		evidence: evidence.clipB,
		expectedDurationSeconds: spec.clipDurationSeconds,
		expectedFrequencyHz: spec.audio.clipBFrequencyHz,
		expectedStartSeconds: spec.clipDurationSeconds,
		label: "Clip B audio",
	});
}

async function measureToneWindow({
	durationSeconds,
	expectedFrequencyHz,
	ffmpegPath,
	mediaPath,
	startSeconds,
}: {
	durationSeconds: number;
	expectedFrequencyHz: number;
	ffmpegPath: string;
	mediaPath: string;
	startSeconds: number;
}): Promise<AudioToneWindowEvidence> {
	const { stderr } = await runCommand({
		args: buildAstatsToneArgs({ durationSeconds, mediaPath, startSeconds }),
		command: ffmpegPath,
	});
	const zeroCrossings = parseAstatsZeroCrossings({ stderr });
	return {
		durationSeconds,
		expectedFrequencyHz,
		measuredFrequencyHz: zeroCrossings / (2 * durationSeconds),
		method: "ffmpeg-astats-zero-crossings",
		startSeconds,
		toleranceHz: FREQUENCY_TOLERANCE_HZ,
		zeroCrossings,
	};
}

export async function measureSourceAudioTones({
	ffmpegPath,
	mediaPath,
	spec = CAPCUT_E2E_FIXTURE_SPEC,
}: {
	ffmpegPath: string;
	mediaPath: string;
	spec?: CapCutE2eFixtureSpec;
}): Promise<SourceAudioToneEvidence> {
	const [clipA, clipB] = await Promise.all([
		measureToneWindow({
			durationSeconds: spec.clipDurationSeconds,
			expectedFrequencyHz: spec.audio.clipAFrequencyHz,
			ffmpegPath,
			mediaPath,
			startSeconds: 0,
		}),
		measureToneWindow({
			durationSeconds: spec.clipDurationSeconds,
			expectedFrequencyHz: spec.audio.clipBFrequencyHz,
			ffmpegPath,
			mediaPath,
			startSeconds: spec.clipDurationSeconds,
		}),
	]);
	const evidence = { clipA, clipB };
	validateSourceAudioToneEvidence({ evidence, spec });
	return evidence;
}
