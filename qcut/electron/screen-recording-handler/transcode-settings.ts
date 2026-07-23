const SCREEN_RECORDING_CRF = "17";
const SCREEN_RECORDING_PRESET = "fast";

export function buildScreenRecordingTranscodeArgs({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}): string[] {
	return [
		"-y",
		"-i",
		inputPath,
		"-c:v",
		"libx264",
		"-preset",
		SCREEN_RECORDING_PRESET,
		"-crf",
		SCREEN_RECORDING_CRF,
		"-pix_fmt",
		"yuv420p",
		"-r",
		"30",
		"-vsync",
		"cfr",
		"-movflags",
		"+faststart",
		outputPath,
	];
}
