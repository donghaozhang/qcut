import type { TextParityCanvas } from "./text-parity-plan";

function ffmpegColor({ color }: { color: string }): string {
	return `0x${color.slice(1)}`;
}

function decimal({ value }: { value: number }): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(6);
}

export function buildTextCompositeCommand({
	ffmpegPath,
	framePattern,
	outputPath,
	canvas,
	placement,
	frameRate,
	frameCount,
}: {
	ffmpegPath: string;
	framePattern: string;
	outputPath: string;
	canvas: TextParityCanvas;
	placement: { x: number; y: number };
	frameRate: number;
	frameCount: number;
}): string[] {
	const durationSeconds = frameCount / frameRate;
	const overlay = [
		`x=${decimal({ value: placement.x })}`,
		`y=${decimal({ value: placement.y })}`,
		"eval=init",
		"eof_action=pass",
		"shortest=1",
	].join(":");
	return [
		ffmpegPath,
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=${ffmpegColor({ color: canvas.backgroundColor })}:s=${canvas.width}x${canvas.height}:r=${frameRate}:d=${durationSeconds}`,
		"-framerate",
		String(frameRate),
		"-start_number",
		"0",
		"-i",
		framePattern,
		"-filter_complex",
		`[0:v]format=rgba[background];[1:v]format=rgba[text];[background][text]overlay=${overlay},format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709[video]`,
		"-map",
		"[video]",
		"-frames:v",
		String(frameCount),
		"-fps_mode",
		"cfr",
		"-an",
		"-sn",
		"-dn",
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"0",
		"-color_range",
		"tv",
		"-colorspace",
		"bt709",
		"-color_trc",
		"bt709",
		"-color_primaries",
		"bt709",
		"-movflags",
		"+faststart",
		outputPath,
	];
}
