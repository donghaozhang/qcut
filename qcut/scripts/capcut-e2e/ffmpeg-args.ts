import { CAPCUT_E2E_FIXTURE_SPEC } from "./spec.js";

function escapeFilterValue({ value }: { value: string }): string {
	return value
		.replaceAll("\\", "/")
		.replaceAll(":", "\\:")
		.replaceAll("'", "\\'");
}

function fontFileOption({ fontPath }: { fontPath: string }): string {
	return `fontfile='${escapeFilterValue({ value: fontPath })}'`;
}

function drawTextFilter({
	fontPath,
	fontSize,
	text,
	y,
}: {
	fontPath: string;
	fontSize: number;
	text: string;
	y: string;
}): string {
	const options = [
		fontFileOption({ fontPath }),
		`text='${escapeFilterValue({ value: text })}'`,
		`fontsize=${fontSize}`,
		"fontcolor=white",
		"borderw=3",
		"bordercolor=black@0.65",
		"x=(w-text_w)/2",
		`y=${y}`,
	];
	return `drawtext=${options.join(":")}`;
}

function buildClipFilters({
	clipLabel,
	fontPath,
}: {
	clipLabel: string;
	fontPath: string;
}): string {
	const labels = CAPCUT_E2E_FIXTURE_SPEC.labels;
	return [
		drawTextFilter({
			fontPath,
			fontSize: 64,
			text: labels.title,
			y: "120",
		}),
		drawTextFilter({
			fontPath,
			fontSize: 108,
			text: clipLabel,
			y: "(h-text_h)/2",
		}),
		drawTextFilter({
			fontPath,
			fontSize: 34,
			text: labels.safety,
			y: "h-text_h-72",
		}),
	].join(",");
}

export function buildSourceVideoArgs({
	asciiFontPath,
	outputPath,
}: {
	asciiFontPath: string;
	outputPath: string;
}): string[] {
	const spec = CAPCUT_E2E_FIXTURE_SPEC;
	const size = `${spec.width}x${spec.height}`;
	const clipA = buildClipFilters({
		clipLabel: spec.labels.clipA,
		fontPath: asciiFontPath,
	});
	const clipB = buildClipFilters({
		clipLabel: spec.labels.clipB,
		fontPath: asciiFontPath,
	});
	const filterComplex = [
		`[0:v]${clipA},format=yuv420p[clip-a]`,
		`[1:v]${clipB},format=yuv420p[clip-b]`,
		"[clip-a][clip-b]concat=n=2:v=1:a=0[video]",
	].join(";");
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		`${spec.patterns.clipA}=size=${size}:rate=${spec.fps}:duration=${spec.clipDurationSeconds}`,
		"-f",
		"lavfi",
		"-i",
		`${spec.patterns.clipB}=size=${size}:rate=${spec.fps}:duration=${spec.clipDurationSeconds}`,
		"-filter_complex",
		filterComplex,
		"-map",
		"[video]",
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-r",
		String(spec.fps),
		"-an",
		"-movflags",
		"+faststart",
		"-map_metadata",
		"-1",
		"-y",
		outputPath,
	];
}

export function buildSourceAudioArgs({
	outputPath,
}: {
	outputPath: string;
}): string[] {
	const spec = CAPCUT_E2E_FIXTURE_SPEC;
	const filterComplex = [
		`[0:a]aformat=sample_fmts=s16:sample_rates=${spec.audio.sampleRateHz}:channel_layouts=mono[audio-a]`,
		`[1:a]aformat=sample_fmts=s16:sample_rates=${spec.audio.sampleRateHz}:channel_layouts=mono[audio-b]`,
		"[audio-a][audio-b]concat=n=2:v=0:a=1[audio]",
	].join(";");
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${spec.audio.clipAFrequencyHz}:sample_rate=${spec.audio.sampleRateHz}:duration=${spec.clipDurationSeconds}`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${spec.audio.clipBFrequencyHz}:sample_rate=${spec.audio.sampleRateHz}:duration=${spec.clipDurationSeconds}`,
		"-filter_complex",
		filterComplex,
		"-map",
		"[audio]",
		"-vn",
		"-c:a",
		"pcm_s16le",
		"-ar",
		String(spec.audio.sampleRateHz),
		"-ac",
		String(spec.audio.channels),
		"-map_metadata",
		"-1",
		"-f",
		"wav",
		"-y",
		outputPath,
	];
}

export function buildCjkProofArgs({
	cjkFontPath,
	outputPath,
}: {
	cjkFontPath: string;
	outputPath: string;
}): string[] {
	const spec = CAPCUT_E2E_FIXTURE_SPEC;
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		`color=c=0x111827:s=${spec.width}x${spec.height}:r=1:d=1`,
		"-vf",
		drawTextFilter({
			fontPath: cjkFontPath,
			fontSize: 112,
			text: spec.cjkProofText,
			y: "(h-text_h)/2",
		}),
		"-frames:v",
		"1",
		"-threads",
		"1",
		"-y",
		outputPath,
	];
}

export function buildFrameExtractionArgs({
	frameIndex,
	inputPath,
	outputPath,
}: {
	frameIndex: number;
	inputPath: string;
	outputPath: string;
}): string[] {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		inputPath,
		"-vf",
		`select=eq(n\\,${frameIndex})`,
		"-frames:v",
		"1",
		"-fps_mode",
		"vfr",
		"-threads",
		"1",
		"-y",
		outputPath,
	];
}
