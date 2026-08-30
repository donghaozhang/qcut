import {
	probeStickerVideo,
	type VideoProbe,
} from "./sticker-lab-real-video-evidence";

const DURATION_TOLERANCE_SECONDS = 0.1;
const FRAME_RATE_TOLERANCE = 0.001;

export interface ExpectedStratifiedMedia {
	audioChannels: number;
	audioCodec: "aac";
	audioSampleRate: number;
	durationSeconds: number;
	frameRate: number;
	height?: number;
	videoCodec: "h264" | "hevc";
	width?: number;
}

export interface VerifiedStratifiedMedia {
	audioChannels: number;
	audioCodec: string;
	audioSampleRate: number;
	durationSeconds: number;
	frameRate: number;
	height: number;
	videoCodec: string;
	width: number;
}

function parseFrameRate({ value }: { value: string | undefined }): number {
	if (!value) return Number.NaN;
	const [numerator = "0", denominator = "0"] = value.split("/");
	const denominatorValue = Number(denominator);
	if (denominatorValue === 0) return Number.NaN;
	return Number(numerator) / denominatorValue;
}

function requireClose({
	actual,
	expected,
	label,
	tolerance,
}: {
	actual: number;
	expected: number;
	label: string;
	tolerance: number;
}): void {
	if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
		throw new Error(
			`${label} is ${String(actual)}, expected ${expected} +/- ${tolerance}`
		);
	}
}

export function verifyStratifiedMediaProbe({
	expected,
	probe,
}: {
	expected: ExpectedStratifiedMedia;
	probe: VideoProbe;
}): VerifiedStratifiedMedia {
	const video = probe.streams?.find(({ codec_type }) => codec_type === "video");
	const audio = probe.streams?.find(({ codec_type }) => codec_type === "audio");
	if (!video) throw new Error("Media evidence has no video stream");
	if (!audio) throw new Error("Media evidence has no audio stream");
	if (video.codec_name !== expected.videoCodec) {
		throw new Error(
			`Video codec is ${video.codec_name ?? "missing"}, expected ${expected.videoCodec}`
		);
	}
	if (audio.codec_name !== expected.audioCodec) {
		throw new Error(
			`Audio codec is ${audio.codec_name ?? "missing"}, expected ${expected.audioCodec}`
		);
	}
	if (audio.channels !== expected.audioChannels) {
		throw new Error(
			`Audio channel count is ${String(audio.channels)}, expected ${expected.audioChannels}`
		);
	}
	const audioSampleRate = Number(audio.sample_rate);
	if (audioSampleRate !== expected.audioSampleRate) {
		throw new Error(
			`Audio sample rate is ${String(audio.sample_rate)}, expected ${expected.audioSampleRate}`
		);
	}
	if (expected.width !== undefined && video.width !== expected.width) {
		throw new Error(
			`Video width is ${String(video.width)}, expected ${expected.width}`
		);
	}
	if (expected.height !== undefined && video.height !== expected.height) {
		throw new Error(
			`Video height is ${String(video.height)}, expected ${expected.height}`
		);
	}
	const frameRate = parseFrameRate({ value: video.avg_frame_rate });
	requireClose({
		actual: frameRate,
		expected: expected.frameRate,
		label: "Video frame rate",
		tolerance: FRAME_RATE_TOLERANCE,
	});
	const durationSeconds = Number(probe.format?.duration);
	requireClose({
		actual: durationSeconds,
		expected: expected.durationSeconds,
		label: "Media duration",
		tolerance: DURATION_TOLERANCE_SECONDS,
	});
	if (!(video.width && video.height)) {
		throw new Error("Media evidence has incomplete video dimensions");
	}
	return {
		audioChannels: audio.channels,
		audioCodec: audio.codec_name,
		audioSampleRate,
		durationSeconds,
		frameRate,
		height: video.height,
		videoCodec: video.codec_name,
		width: video.width,
	};
}

export async function inspectStratifiedMediaFile({
	expected,
	filePath,
}: {
	expected: ExpectedStratifiedMedia;
	filePath: string;
}): Promise<VerifiedStratifiedMedia> {
	const probe = await probeStickerVideo({ filePath });
	return verifyStratifiedMediaProbe({ expected, probe });
}
