import { platform } from "@qcut/platform-core";
import type { AudioWaveformPeaks } from "./audio-waveform-cache";

export function canDecodeNativeAudioWaveform(): boolean {
	try {
		return typeof platform().ffmpeg.extractAudioWaveform === "function";
	} catch {
		return false;
	}
}

export async function decodeNativeAudioWaveform({
	sourcePath,
	duration,
	peakCount = 4_096,
}: {
	sourcePath: string;
	duration: number;
	peakCount?: number;
}): Promise<AudioWaveformPeaks> {
	const result = await platform().ffmpeg.extractAudioWaveform({
		sourcePath,
		duration,
		peakCount,
	});
	return {
		duration: result.duration,
		values:
			result.values instanceof Float32Array
				? result.values
				: new Float32Array(result.values),
	};
}
