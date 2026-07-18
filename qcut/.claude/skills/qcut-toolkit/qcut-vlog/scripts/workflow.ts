import type { CleanSummary, SrtEntry, VlogOptions, VlogPaths } from "./types";

interface CutLike {
	start?: unknown;
	end?: unknown;
	reason?: unknown;
}

function roundMilliseconds({ value }: { value: number }): number {
	return Math.round(value * 1000) / 1000;
}

export function buildCleanArgs({
	options,
	paths,
}: {
	options: VlogOptions;
	paths: VlogPaths;
}): string[] {
	const args = [
		"edit",
		"clean-audio",
		"-i",
		paths.input,
		"-o",
		paths.outputDir,
		"--silence-threshold",
		String(options.silenceThreshold),
		"--keep-padding",
		String(options.keepPadding),
	];
	if (options.keepFillers) args.push("--no-remove-fillers");
	if (options.keepSilences) args.push("--no-remove-silences");
	if (options.analyzeOnly) args.push("--dry-run");
	args.push("--json");
	return args;
}

export function buildAudioExtractArgs({
	workingVideo,
	paths,
}: {
	workingVideo: string;
	paths: VlogPaths;
}): string[] {
	return [
		"-y",
		"-i",
		workingVideo,
		"-vn",
		"-acodec",
		"libmp3lame",
		"-q:a",
		"2",
		paths.cleanAudio,
	];
}

export function buildBackgroundArgs({
	options,
	paths,
	cleanVideo,
}: {
	options: VlogOptions;
	paths: VlogPaths;
	cleanVideo: string;
}): string[] {
	if (!options.background) {
		throw new Error("Background composition requires --background");
	}
	return [
		"edit",
		"person-cutout",
		"-i",
		cleanVideo,
		"--background",
		options.background,
		"--background-fit",
		options.backgroundFit,
		"--output-dir",
		paths.outputDir,
		"--cutout-output",
		paths.cutoutVideo,
		"--output",
		paths.editableVideo,
		"--force",
		"--json",
	];
}

export function buildTranscribeArgs({
	options,
	paths,
}: {
	options: VlogOptions;
	paths: VlogPaths;
}): string[] {
	const args = [
		"analyze",
		"transcribe",
		"-i",
		paths.cleanAudio,
		"-m",
		options.model,
		"--srt",
		"--srt-max-words",
		String(options.srtMaxWords),
		"--srt-max-duration",
		String(options.srtMaxDuration),
		"-o",
		paths.outputDir,
	];
	if (options.language) args.push("--language", options.language);
	args.push("--json");
	return args;
}

export function buildSubtitleArgs({
	options,
	paths,
	workingVideo,
}: {
	options: VlogOptions;
	paths: VlogPaths;
	workingVideo: string;
}): string[] {
	const args = [
		"edit",
		"subtitle-export",
		"-i",
		workingVideo,
		"-s",
		paths.srt,
		"--preset",
		options.preset,
	];
	if (options.style) args.push("--style", options.style);
	args.push("--output", paths.finalVideo, "--json");
	return args;
}

export function buildPreviewArgs({
	paths,
	previewTime,
}: {
	paths: VlogPaths;
	previewTime: number;
}): string[] {
	return [
		"-y",
		"-ss",
		previewTime.toFixed(3),
		"-i",
		paths.finalVideo,
		"-frames:v",
		"1",
		"-vf",
		"scale=720:-2",
		paths.previewImage,
	];
}

export function buildBackgroundPreviewArgs({
	paths,
	previewTime,
}: {
	paths: VlogPaths;
	previewTime: number;
}): string[] {
	return [
		"-y",
		"-ss",
		previewTime.toFixed(3),
		"-i",
		paths.editableVideo,
		"-frames:v",
		"1",
		"-vf",
		"scale=720:-2",
		paths.backgroundPreviewImage,
	];
}

function parseSrtTime({ value }: { value: string }): number {
	const match = value.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
	if (!match) throw new Error(`Invalid SRT timecode: ${value}`);
	return (
		Number(match[1]) * 3600 +
		Number(match[2]) * 60 +
		Number(match[3]) +
		Number(match[4]) / 1000
	);
}

export function parseSrtContent({ content }: { content: string }): SrtEntry[] {
	const entries: SrtEntry[] = [];
	const blocks = content.trim().split(/\r?\n\s*\r?\n/);
	for (const block of blocks) {
		const lines = block.split(/\r?\n/);
		if (lines.length < 3) continue;
		const timing = lines[1]?.match(
			/^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
		);
		if (!timing) continue;
		const text = lines.slice(2).join("\n").trim();
		if (!text) continue;
		entries.push({
			index: Number(lines[0]) || entries.length + 1,
			start: parseSrtTime({ value: timing[1] }),
			end: parseSrtTime({ value: timing[2] }),
			text,
		});
	}
	return entries;
}

function countReason({
	cuts,
	pattern,
}: {
	cuts: CutLike[];
	pattern: RegExp;
}): number {
	return cuts.filter(
		(cut) => typeof cut.reason === "string" && pattern.test(cut.reason)
	).length;
}

export function summarizeCleanMetadata({
	decisions,
	cuts,
	keeps,
}: {
	decisions: unknown;
	cuts: unknown;
	keeps: unknown;
}): CleanSummary {
	const decisionItems = Array.isArray(decisions) ? decisions : [];
	const cutItems = Array.isArray(cuts) ? (cuts as CutLike[]) : [];
	const keepItems = Array.isArray(keeps) ? keeps : [];
	const fillerCuts = countReason({ cuts: cutItems, pattern: /filler/i });
	const stutterCuts = countReason({
		cuts: cutItems,
		pattern: /stutter|repeat/i,
	});
	const silenceCuts = countReason({
		cuts: cutItems,
		pattern: /silence|pause/i,
	});
	const rawCutDuration = cutItems.reduce((total, cut) => {
		if (typeof cut.start !== "number" || typeof cut.end !== "number") {
			return total;
		}
		return total + Math.max(0, cut.end - cut.start);
	}, 0);
	return {
		decisions: decisionItems.length,
		cuts: cutItems.length,
		keeps: keepItems.length,
		fillerCuts,
		stutterCuts,
		silenceCuts,
		otherCuts: Math.max(
			0,
			cutItems.length - fillerCuts - stutterCuts - silenceCuts
		),
		rawCutDuration: roundMilliseconds({ value: rawCutDuration }),
	};
}

export function assertDurationParity({
	workingDuration,
	finalDuration,
	tolerance = 0.25,
}: {
	workingDuration: number;
	finalDuration: number;
	tolerance?: number;
}): number {
	const difference = Math.abs(workingDuration - finalDuration);
	if (difference > tolerance) {
		throw new Error(
			`Final duration differs from the caption source by ${difference.toFixed(3)}s`
		);
	}
	return roundMilliseconds({ value: difference });
}

export function getPreviewTime({ entries }: { entries: SrtEntry[] }): number {
	const first = entries[0];
	if (!first) throw new Error("SRT contains no subtitle entries");
	return roundMilliseconds({
		value: first.start + (first.end - first.start) / 2,
	});
}
