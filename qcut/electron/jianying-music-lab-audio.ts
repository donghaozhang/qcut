import { execFile } from "node:child_process";
import { getFFprobePath } from "./ffmpeg/paths.js";

let ffprobePathPromise: Promise<string> | null = null;

export interface JianyingMusicAudioProbeResult {
	codecName: string;
	durationSeconds: number;
	fileExtension: "m4a" | "mp3";
}

function asRecord({ value }: { value: unknown }) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

async function resolveFFprobePath() {
	if (!ffprobePathPromise) ffprobePathPromise = getFFprobePath();
	try {
		return await ffprobePathPromise;
	} catch (error) {
		ffprobePathPromise = null;
		throw error;
	}
}

export function detectJianyingMusicMimeType({
	bytes,
}: {
	bytes: Uint8Array;
}): "audio/mp4" | "audio/mpeg" {
	const hasIsoBaseMediaSignature =
		bytes.byteLength >= 8 &&
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70;
	return hasIsoBaseMediaSignature ? "audio/mp4" : "audio/mpeg";
}

export async function probeJianyingMusicAudio({
	filePath,
}: {
	filePath: string;
}): Promise<JianyingMusicAudioProbeResult> {
	const ffprobePath = await resolveFFprobePath();
	const stdout = await new Promise<string>((resolve, reject) => {
		execFile(
			ffprobePath,
			[
				"-v",
				"error",
				"-select_streams",
				"a:0",
				"-show_entries",
				"stream=codec_name:format=duration,format_name",
				"-of",
				"json",
				filePath,
			],
			{ maxBuffer: 1024 * 1024, timeout: 15_000, windowsHide: true },
			(error, commandStdout, commandStderr) => {
				if (error) {
					reject(
						new Error(
							`ffprobe failed: ${String(commandStderr).trim().slice(0, 240)}`
						)
					);
					return;
				}
				resolve(commandStdout);
			}
		);
	});
	const parsed: unknown = JSON.parse(stdout);
	const record = asRecord({ value: parsed });
	const streams = Array.isArray(record?.streams) ? record.streams : [];
	const stream = asRecord({ value: streams[0] });
	const format = asRecord({ value: record?.format });
	const codecName =
		typeof stream?.codec_name === "string" ? stream.codec_name : "";
	const formatName =
		typeof format?.format_name === "string" ? format.format_name : "";
	const durationSeconds = Number(format?.duration ?? 0);
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("ffprobe did not find a valid audio duration");
	}
	if (codecName === "mp3") {
		return { codecName, durationSeconds, fileExtension: "mp3" };
	}
	if (
		codecName === "aac" &&
		formatName.split(",").some((name) => name === "m4a" || name === "mp4")
	) {
		return { codecName, durationSeconds, fileExtension: "m4a" };
	}
	throw new Error("ffprobe found an unsupported audio codec or container");
}
