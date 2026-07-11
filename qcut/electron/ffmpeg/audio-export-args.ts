import type { AudioExportOptions } from "./types";
import { buildTimelineAudioFilters } from "./audio-filter-graph";

export function buildStandaloneAudioExportArgs({
	options,
}: {
	options: AudioExportOptions;
}): string[] {
	const audioGraph = buildTimelineAudioFilters({
		audioFiles: options.audioFiles,
		audioStartIndex: 0,
		fps: 30,
	});
	return [
		"-y",
		...options.audioFiles.flatMap((file) => ["-i", file.path]),
		...(audioGraph.filterSteps.length > 0
			? ["-filter_complex", audioGraph.filterSteps.join(";")]
			: []),
		"-map",
		audioGraph.mapAudio ?? "0:a",
		"-t",
		String(options.duration),
		"-vn",
		"-c:a",
		"libmp3lame",
		"-b:a",
		`${options.bitrate}k`,
		"-ar",
		String(options.sampleRate),
		"-ac",
		String(options.channels ?? 2),
		options.outputPath,
	];
}
