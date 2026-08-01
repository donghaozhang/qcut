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
	x,
	y,
}: {
	fontPath: string;
	fontSize: number;
	text: string;
	x: string;
	y: string;
}): string {
	const options = [
		fontFileOption({ fontPath }),
		`text='${escapeFilterValue({ value: text })}'`,
		`fontsize=${fontSize}`,
		"fontcolor=white",
		"borderw=3",
		"bordercolor=black@0.65",
		`x=${x}`,
		`y=${y}`,
	];
	return `drawtext=${options.join(":")}`;
}

function buildClipFilters({
	clipLabel,
	clipOffsetFrames,
	fontPath,
	plate,
}: {
	clipLabel: string;
	clipOffsetFrames: number;
	fontPath: string;
	plate: "a" | "b";
}): string {
	const labels = CAPCUT_E2E_FIXTURE_SPEC.labels;
	const asymmetricPlateMarkers =
		plate === "a"
			? [
					"drawbox=x=42:y=138:w=174:h=92:color=0xFF3B30@0.92:t=fill",
					"drawbox=x=iw-282:y=ih-176:w=236:h=108:color=0x34C759@0.92:t=fill",
				]
			: [
					"drawbox=x=iw-226:y=138:w=184:h=92:color=0xAF52DE@0.92:t=fill",
					"drawbox=x=46:y=ih-190:w=252:h=122:color=0xFF9500@0.92:t=fill",
				];
	const ordinalExpression = `%{eif:n+${clipOffsetFrames}:d:3}`;
	return [
		...asymmetricPlateMarkers,
		drawTextFilter({
			fontPath,
			fontSize: 64,
			text: labels.title,
			x: "(w-text_w)/2",
			y: "120",
		}),
		drawTextFilter({
			fontPath,
			fontSize: 108,
			text: clipLabel,
			x: "(w-text_w)/2",
			y: "(h-text_h)/2",
		}),
		drawTextFilter({
			fontPath,
			fontSize: 34,
			text: labels.safety,
			x: "(w-text_w)/2",
			y: "h-text_h-72",
		}),
		`drawbox=x=0:y=0:w=iw:h=${CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration.ordinalStrip.height}:color=black@1:t=fill`,
		drawTextFilter({
			fontPath,
			fontSize: 44,
			text: `${labels.ordinal} ${ordinalExpression}`,
			x: "48",
			y: "24",
		}),
		drawTextFilter({
			fontPath,
			fontSize: 44,
			text: clipLabel,
			x: "w-text_w-48",
			y: "24",
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
	const framesPerClip = spec.clipDurationSeconds * spec.fps;
	const clipA = buildClipFilters({
		clipLabel: spec.labels.clipA,
		clipOffsetFrames: 0,
		fontPath: asciiFontPath,
		plate: "a",
	});
	const clipB = buildClipFilters({
		clipLabel: spec.labels.clipB,
		clipOffsetFrames: framesPerClip,
		fontPath: asciiFontPath,
		plate: "b",
	});
	const freezeFirstFrame = `trim=end_frame=1,loop=loop=${framesPerClip - 1}:size=1:start=0,setpts=N/(${spec.fps}*TB)`;
	const filterComplex = [
		`[0:v]${freezeFirstFrame},${clipA},format=yuv420p[clip-a]`,
		`[1:v]${freezeFirstFrame},${clipB},format=yuv420p[clip-b]`,
		"[clip-a][clip-b]concat=n=2:v=1:a=0[video]",
	].join(";");
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		`${spec.patterns.clipA}=size=${size}:rate=${spec.fps}:duration=1`,
		"-f",
		"lavfi",
		"-i",
		`${spec.patterns.clipB}=size=${size}:rate=${spec.fps}:duration=1`,
		"-filter_complex",
		filterComplex,
		"-map",
		"[video]",
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"0",
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
			x: "(w-text_w)/2",
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
	cropRegion,
	frameIndex,
	inputPath,
	outputPath,
}: {
	cropRegion?: { height: number; width: number; x: number; y: number };
	frameIndex: number;
	inputPath: string;
	outputPath: string;
}): string[] {
	const cropFilter = cropRegion
		? `,crop=${cropRegion.width}:${cropRegion.height}:${cropRegion.x}:${cropRegion.y}`
		: "";
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		inputPath,
		"-vf",
		`select=eq(n\\,${frameIndex})${cropFilter}`,
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
