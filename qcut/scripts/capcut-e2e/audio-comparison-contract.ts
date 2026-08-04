export const AUDIO_COMPARISON_MANIFEST_SCHEMA =
	"qcut.capcut-e2e.audio-comparison";
export const AUDIO_COMPARISON_MANIFEST_FILE_NAME =
	"audio-comparison-manifest.json";

export interface AudioComparisonThresholds {
	evidenceStatus: "candidate-unverified" | "verified";
	id: string;
	maxDifferencePeakDbfs: number;
	maxDifferenceRmsDbfs: number;
	maxDurationDeltaSeconds: number;
	maxIntegratedLoudnessDeltaLu: number;
	maxLoudnessRangeDeltaLu: number;
	maxSilenceBoundaryDeltaSeconds: number;
	maxTruePeakDeltaDb: number;
}

// Real CapCut 8.1 four-way exports must calibrate these before promotion.
export const CAPCUT_8_1_CORE_AUDIO_THRESHOLDS = Object.freeze({
	evidenceStatus: "candidate-unverified" as const,
	id: "capcut-8.1-core-candidate-v1",
	maxDifferencePeakDbfs: -40,
	maxDifferenceRmsDbfs: -50,
	maxDurationDeltaSeconds: 0.02,
	maxIntegratedLoudnessDeltaLu: 0.5,
	maxLoudnessRangeDeltaLu: 0.5,
	maxSilenceBoundaryDeltaSeconds: 0.02,
	maxTruePeakDeltaDb: 0.5,
});

export interface AudioStreamEvidence {
	channelLayout: string;
	channels: number;
	durationSeconds: number;
	sampleRateHz: number;
}

export interface AudioSilenceInterval {
	endSeconds: number;
	startSeconds: number;
}

export interface AudioSignalEvidence {
	integratedLoudnessLufs: number | "negative-infinity";
	loudnessRangeLu: number;
	silenceIntervals: AudioSilenceInterval[];
	truePeakDbfs: number | "negative-infinity";
}

export interface AudioDifferenceEvidence {
	channels: Array<{
		channel: number;
		peakDbfs: number | "negative-infinity";
		rmsDbfs: number | "negative-infinity";
	}>;
	exact: boolean;
}

export interface AudioComparisonChecks {
	channelsMatch: boolean;
	differencePeakPass: boolean;
	differenceRmsPass: boolean;
	durationDeltaSeconds: number;
	durationPass: boolean;
	integratedLoudnessDeltaLu: number | null;
	integratedLoudnessPass: boolean;
	loudnessRangeDeltaLu: number;
	loudnessRangePass: boolean;
	sampleRateMatch: boolean;
	silenceBoundaryMaximumDeltaSeconds: number | null;
	silencePass: boolean;
	truePeakDeltaDb: number | null;
	truePeakPass: boolean;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requirePositiveNumber({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	const parsed = typeof value === "string" ? Number(value) : value;
	if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive finite number.`);
	}
	return parsed;
}

function roundMetric({ value }: { value: number }): number {
	return Number(value.toFixed(6));
}

function deriveChannelLayout({
	channels,
	value,
}: {
	channels: number;
	value: unknown;
}): string {
	if (typeof value === "string" && /^[a-zA-Z0-9().+_-]+$/.test(value)) {
		return value;
	}
	if (channels === 1) return "mono";
	if (channels === 2) return "stereo";
	throw new Error(
		"Multichannel audio requires an explicit safe channel layout."
	);
}

export function parseAudioStreamEvidence({
	probe,
}: {
	probe: unknown;
}): AudioStreamEvidence | null {
	const root = requireRecord({ label: "FFprobe report", value: probe });
	if (!Array.isArray(root.streams)) {
		throw new Error("FFprobe report is missing streams.");
	}
	const audioStreams = root.streams
		.map((stream, index) =>
			requireRecord({ label: `FFprobe stream ${index}`, value: stream })
		)
		.filter((stream) => stream.codec_type === "audio");
	if (audioStreams.length === 0) return null;
	if (audioStreams.length !== 1) {
		throw new Error("Audio comparison requires exactly one audio stream.");
	}
	const stream = audioStreams[0];
	if (!stream) throw new Error("FFprobe audio stream is unavailable.");
	const channels = requirePositiveNumber({
		label: "Audio channel count",
		value: stream.channels,
	});
	if (!Number.isSafeInteger(channels)) {
		throw new Error("Audio channel count must be an integer.");
	}
	const format = requireRecord({
		label: "FFprobe format",
		value: root.format,
	});
	return {
		channelLayout: deriveChannelLayout({
			channels,
			value: stream.channel_layout,
		}),
		channels,
		durationSeconds: requirePositiveNumber({
			label: "Audio duration",
			value: stream.duration ?? format.duration,
		}),
		sampleRateHz: requirePositiveNumber({
			label: "Audio sample rate",
			value: stream.sample_rate,
		}),
	};
}

function parseLevel({
	label,
	value,
}: {
	label: string;
	value: string;
}): number | "negative-infinity" {
	if (value === "-inf") return "negative-infinity";
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid.`);
	return parsed;
}

function requireSingleMatch({
	label,
	pattern,
	value,
}: {
	label: string;
	pattern: RegExp;
	value: string;
}): string {
	const matches = [...value.matchAll(pattern)];
	if (matches.length !== 1 || matches[0]?.[1] === undefined) {
		throw new Error(`${label} must appear exactly once.`);
	}
	return matches[0][1];
}

function parseSilenceIntervals({ stderr }: { stderr: string }) {
	const intervals: AudioSilenceInterval[] = [];
	let startSeconds: number | null = null;
	for (const match of stderr.matchAll(
		/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g
	)) {
		const kind = match[1];
		const seconds = Number(match[2]);
		if (!Number.isFinite(seconds) || seconds < 0) {
			throw new Error("FFmpeg silencedetect returned an invalid boundary.");
		}
		if (kind === "start") {
			if (startSeconds !== null) {
				throw new Error("FFmpeg silencedetect returned nested intervals.");
			}
			startSeconds = seconds;
			continue;
		}
		if (startSeconds === null || seconds < startSeconds) {
			throw new Error("FFmpeg silencedetect returned an unmatched interval.");
		}
		intervals.push({ endSeconds: seconds, startSeconds });
		startSeconds = null;
	}
	if (startSeconds !== null) {
		throw new Error("FFmpeg silencedetect returned an open interval.");
	}
	return intervals;
}

export function parseAudioSignalEvidence({
	stderr,
}: {
	stderr: string;
}): AudioSignalEvidence {
	const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
	if (!summary.startsWith("Summary:")) {
		throw new Error("FFmpeg ebur128 summary is missing.");
	}
	const integrated = requireSingleMatch({
		label: "Integrated loudness",
		pattern: /Integrated loudness:\s*\n\s*I:\s*(-inf|-?\d+(?:\.\d+)?)\s+LUFS/g,
		value: summary,
	});
	const loudnessRange = requireSingleMatch({
		label: "Loudness range",
		pattern: /Loudness range:\s*\n\s*LRA:\s*(\d+(?:\.\d+)?)\s+LU/g,
		value: summary,
	});
	const truePeak = requireSingleMatch({
		label: "True peak",
		pattern: /True peak:\s*\n\s*Peak:\s*(-inf|-?\d+(?:\.\d+)?)\s+dBFS/g,
		value: summary,
	});
	return {
		integratedLoudnessLufs: parseLevel({
			label: "Integrated loudness",
			value: integrated,
		}),
		loudnessRangeLu: Number(loudnessRange),
		silenceIntervals: parseSilenceIntervals({ stderr }),
		truePeakDbfs: parseLevel({ label: "True peak", value: truePeak }),
	};
}

export function parseAudioDifferenceEvidence({
	channelCount,
	stderr,
}: {
	channelCount: number;
	stderr: string;
}): AudioDifferenceEvidence {
	const channels = [
		...stderr.matchAll(
			/Channel:\s*(\d+)[\s\S]*?Peak level dB:\s*(-inf|-?\d+(?:\.\d+)?)[\s\S]*?RMS level dB:\s*(-inf|-?\d+(?:\.\d+)?)/g
		),
	]
		.map((match) => ({
			channel: Number(match[1]) - 1,
			peakDbfs: parseLevel({ label: "Difference peak", value: match[2] ?? "" }),
			rmsDbfs: parseLevel({ label: "Difference RMS", value: match[3] ?? "" }),
		}))
		.sort((left, right) => left.channel - right.channel);
	if (channels.length !== channelCount) {
		throw new Error("FFmpeg astats difference evidence is incomplete.");
	}
	for (const [index, { channel }] of channels.entries()) {
		if (channel !== index) {
			throw new Error("FFmpeg astats difference evidence is incomplete.");
		}
	}
	return {
		channels,
		exact: channels.every(
			({ peakDbfs, rmsDbfs }) =>
				peakDbfs === "negative-infinity" && rmsDbfs === "negative-infinity"
		),
	};
}

export function buildAudioSignalAnalysisArgs({
	mediaPath,
}: {
	mediaPath: string;
}): string[] {
	return [
		"-hide_banner",
		"-nostats",
		"-i",
		mediaPath,
		"-map",
		"0:a:0",
		"-af",
		"ebur128=peak=true:framelog=quiet,silencedetect=noise=-60dB:d=0.05",
		"-f",
		"null",
		"-",
	];
}

export function buildAudioDifferenceArgs({
	channelCount,
	channelLayout,
	leftPath,
	rightPath,
	sampleRateHz,
}: {
	channelCount: number;
	channelLayout: string;
	leftPath: string;
	rightPath: string;
	sampleRateHz: number;
}): string[] {
	const normalize =
		`asetpts=PTS-STARTPTS,aresample=${sampleRateHz}:async=0:first_pts=0,` +
		`aformat=sample_fmts=fltp:sample_rates=${sampleRateHz}:channel_layouts=${channelLayout}`;
	const panMappings: string[] = [];
	for (let index = 0; index < channelCount; index += 1) {
		panMappings.push(`c${index}=c${index}-c${index + channelCount}`);
	}
	const pan = panMappings.join("|");
	return [
		"-hide_banner",
		"-nostats",
		"-i",
		leftPath,
		"-i",
		rightPath,
		"-filter_complex",
		`[0:a:0]${normalize}[reference];[1:a:0]${normalize}[candidate];` +
			`[reference][candidate]amerge=inputs=2[merged];[merged]pan=${channelLayout}|${pan},` +
			"astats=metadata=0:reset=0:measure_perchannel=Peak_level+RMS_level:measure_overall=none[difference]",
		"-map",
		"[difference]",
		"-f",
		"null",
		"-",
	];
}

function levelDelta({
	left,
	right,
}: {
	left: number | "negative-infinity";
	right: number | "negative-infinity";
}): number | null {
	if (left === "negative-infinity" || right === "negative-infinity") {
		return left === right ? 0 : null;
	}
	return roundMetric({ value: Math.abs(left - right) });
}

function compareSilenceIntervals({
	left,
	right,
}: {
	left: AudioSilenceInterval[];
	right: AudioSilenceInterval[];
}): number | null {
	if (left.length !== right.length) return null;
	let maximum = 0;
	for (let index = 0; index < left.length; index += 1) {
		const leftInterval = left[index];
		const rightInterval = right[index];
		if (!leftInterval || !rightInterval) return null;
		maximum = Math.max(
			maximum,
			Math.abs(leftInterval.startSeconds - rightInterval.startSeconds),
			Math.abs(leftInterval.endSeconds - rightInterval.endSeconds)
		);
	}
	return roundMetric({ value: maximum });
}

export function evaluateAudioComparison({
	difference,
	leftSignal,
	leftStream,
	rightSignal,
	rightStream,
	thresholds,
}: {
	difference: AudioDifferenceEvidence | null;
	leftSignal: AudioSignalEvidence;
	leftStream: AudioStreamEvidence;
	rightSignal: AudioSignalEvidence;
	rightStream: AudioStreamEvidence;
	thresholds: AudioComparisonThresholds;
}): AudioComparisonChecks {
	const durationDeltaSeconds = roundMetric({
		value: Math.abs(leftStream.durationSeconds - rightStream.durationSeconds),
	});
	const integratedLoudnessDeltaLu = levelDelta({
		left: leftSignal.integratedLoudnessLufs,
		right: rightSignal.integratedLoudnessLufs,
	});
	const loudnessRangeDeltaLu = roundMetric({
		value: Math.abs(leftSignal.loudnessRangeLu - rightSignal.loudnessRangeLu),
	});
	const truePeakDeltaDb = levelDelta({
		left: leftSignal.truePeakDbfs,
		right: rightSignal.truePeakDbfs,
	});
	const silenceBoundaryMaximumDeltaSeconds = compareSilenceIntervals({
		left: leftSignal.silenceIntervals,
		right: rightSignal.silenceIntervals,
	});
	const differencePeakPass =
		difference !== null &&
		difference.channels.every(
			({ peakDbfs }) =>
				peakDbfs === "negative-infinity" ||
				peakDbfs <= thresholds.maxDifferencePeakDbfs
		);
	const differenceRmsPass =
		difference !== null &&
		difference.channels.every(
			({ rmsDbfs }) =>
				rmsDbfs === "negative-infinity" ||
				rmsDbfs <= thresholds.maxDifferenceRmsDbfs
		);
	return {
		channelsMatch:
			leftStream.channels === rightStream.channels &&
			leftStream.channelLayout === rightStream.channelLayout,
		differencePeakPass,
		differenceRmsPass,
		durationDeltaSeconds,
		durationPass: durationDeltaSeconds <= thresholds.maxDurationDeltaSeconds,
		integratedLoudnessDeltaLu,
		integratedLoudnessPass:
			integratedLoudnessDeltaLu !== null &&
			integratedLoudnessDeltaLu <= thresholds.maxIntegratedLoudnessDeltaLu,
		loudnessRangeDeltaLu,
		loudnessRangePass:
			loudnessRangeDeltaLu <= thresholds.maxLoudnessRangeDeltaLu,
		sampleRateMatch: leftStream.sampleRateHz === rightStream.sampleRateHz,
		silenceBoundaryMaximumDeltaSeconds,
		silencePass:
			silenceBoundaryMaximumDeltaSeconds !== null &&
			silenceBoundaryMaximumDeltaSeconds <=
				thresholds.maxSilenceBoundaryDeltaSeconds,
		truePeakDeltaDb,
		truePeakPass:
			truePeakDeltaDb !== null &&
			truePeakDeltaDb <= thresholds.maxTruePeakDeltaDb,
	};
}

export function audioComparisonChecksPass({
	checks,
}: {
	checks: AudioComparisonChecks;
}): boolean {
	return Object.entries(checks)
		.filter(([key]) => key.endsWith("Pass") || key.endsWith("Match"))
		.every(([, value]) => value === true);
}
