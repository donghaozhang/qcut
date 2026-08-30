import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFFmpegPath } from "../../ffmpeg/paths.js";
import type { ComposeOverlay, ComposeTransition } from "./compose-manifest.js";
import type { ResolvedComposeAudio } from "./compose-resolver.js";

const execFileAsync = promisify(execFile);

export interface ComposeTimelineClip {
	path: string;
	duration: number;
}

export interface MaterializedComposeOverlay {
	overlay: ComposeOverlay;
	path: string;
}

function ffmpegNumber({ value }: { value: number }): string {
	return Number(value.toFixed(6)).toString();
}

export async function runComposeFfmpeg({
	args,
	signal,
}: {
	args: string[];
	signal: AbortSignal;
}): Promise<void> {
	await execFileAsync(
		getFFmpegPath(),
		["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args],
		{ signal, timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 }
	);
}

export function buildComposeNormalizeArgs({
	input,
	output,
	trimIn,
	duration,
	width,
	height,
	fps,
	hasAudio,
}: {
	input: string;
	output: string;
	trimIn: number;
	duration: number;
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
}): string[] {
	const durationText = ffmpegNumber({ value: duration });
	const args = ["-i", input];
	if (!hasAudio) {
		args.push(
			"-f",
			"lavfi",
			"-t",
			durationText,
			"-i",
			"anullsrc=channel_layout=stereo:sample_rate=48000"
		);
	}
	const video = [
		`[0:v:0]trim=start=${ffmpegNumber({ value: trimIn })}:duration=${durationText}`,
		"setpts=PTS-STARTPTS",
		`scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
		`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
		"setsar=1",
		`fps=${fps}`,
		"format=yuv420p[vout]",
	].join(",");
	const audioInput = hasAudio ? "0:a:0" : "1:a:0";
	const audio = [
		`[${audioInput}]${hasAudio ? `atrim=start=${ffmpegNumber({ value: trimIn })}:duration=${durationText}` : "anull"}`,
		"asetpts=PTS-STARTPTS",
		"aresample=async=1:first_pts=0",
		"aformat=sample_rates=48000:channel_layouts=stereo",
		`apad=pad_dur=${durationText}`,
		`atrim=duration=${durationText}[aout]`,
	].join(",");
	args.push(
		"-filter_complex",
		`${video};${audio}`,
		"-map",
		"[vout]",
		"-map",
		"[aout]",
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-t",
		durationText,
		"-movflags",
		"+faststart",
		output
	);
	return args;
}

export function buildComposeTimelineArgs({
	clips,
	transitionsByCut,
	videoOutput,
	audioOutput,
	output,
}: {
	clips: ComposeTimelineClip[];
	transitionsByCut: Array<ComposeTransition | undefined>;
	videoOutput: string;
	audioOutput: string;
	output: string;
}): {
	videoArgs: string[];
	audioArgs: string[];
	muxArgs: string[];
	duration: number;
} {
	if (clips.length < 2) {
		throw new Error("Timeline join requires at least two clips.");
	}
	if (transitionsByCut.length !== clips.length - 1) {
		throw new Error(
			"Timeline transition count does not match clip boundaries."
		);
	}
	const inputs = clips.flatMap((clip) => ["-i", clip.path]);
	const videoFilters = clips.map(
		(_clip, index) => `[${index}:v:0]settb=AVTB,setpts=PTS-STARTPTS[v${index}]`
	);
	const audioFilters = clips.map(
		(_clip, index) =>
			`[${index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`
	);
	let videoLabel = "v0";
	let audioLabel = "a0";
	let duration = clips[0].duration;
	for (const [cutIndex, transition] of transitionsByCut.entries()) {
		const nextIndex = cutIndex + 1;
		const nextVideoLabel = `timeline_v${nextIndex}`;
		const nextAudioLabel = `timeline_a${nextIndex}`;
		if (transition) {
			const transitionDuration = ffmpegNumber({ value: transition.duration });
			const offset = ffmpegNumber({ value: duration - transition.duration });
			videoFilters.push(
				`[${videoLabel}][v${nextIndex}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}[${nextVideoLabel}]`
			);
			audioFilters.push(
				`[${audioLabel}][a${nextIndex}]acrossfade=d=${transitionDuration}:c1=tri:c2=tri[${nextAudioLabel}]`
			);
			duration += clips[nextIndex].duration - transition.duration;
		} else {
			videoFilters.push(
				`[${videoLabel}][v${nextIndex}]concat=n=2:v=1:a=0[${nextVideoLabel}]`
			);
			audioFilters.push(
				`[${audioLabel}][a${nextIndex}]concat=n=2:v=0:a=1[${nextAudioLabel}]`
			);
			duration += clips[nextIndex].duration;
		}
		videoLabel = nextVideoLabel;
		audioLabel = nextAudioLabel;
	}
	const durationText = ffmpegNumber({ value: duration });
	const videoArgs = [
		...inputs,
		"-filter_complex",
		videoFilters.join(";"),
		"-map",
		`[${videoLabel}]`,
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-an",
		"-t",
		durationText,
		videoOutput,
	];
	const audioArgs = [
		...inputs,
		"-filter_complex",
		audioFilters.join(";"),
		"-map",
		`[${audioLabel}]`,
		"-vn",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-t",
		durationText,
		audioOutput,
	];
	const muxArgs = [
		"-i",
		videoOutput,
		"-i",
		audioOutput,
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		"-c",
		"copy",
		"-t",
		durationText,
		"-movflags",
		"+faststart",
		output,
	];
	return { videoArgs, audioArgs, muxArgs, duration };
}

function buildStickerFilter({
	item,
	inputIndex,
	index,
	canvasWidth,
}: {
	item: MaterializedComposeOverlay;
	inputIndex: number;
	index: number;
	canvasWidth: number;
}): string {
	const { overlay } = item;
	const filters = [
		`[${inputIndex}:v:0]format=rgba`,
		`scale=${Math.max(1, Math.round(canvasWidth * overlay.transform.scale))}:-1`,
	];
	if (overlay.transform.rotation !== 0) {
		filters.push(
			`rotate=${ffmpegNumber({ value: (overlay.transform.rotation * Math.PI) / 180 })}:ow=rotw(iw):oh=roth(ih):c=none`
		);
	}
	if (overlay.opacity < 1) {
		filters.push(
			`colorchannelmixer=aa=${ffmpegNumber({ value: overlay.opacity })}`
		);
	}
	if (overlay.fadeIn > 0) {
		filters.push(
			`fade=t=in:st=0:d=${ffmpegNumber({ value: overlay.fadeIn })}:alpha=1`
		);
	}
	if (overlay.fadeOut > 0) {
		filters.push(
			`fade=t=out:st=${ffmpegNumber({ value: overlay.duration - overlay.fadeOut })}:d=${ffmpegNumber({ value: overlay.fadeOut })}:alpha=1`
		);
	}
	filters.push(
		`setpts=PTS-STARTPTS+${ffmpegNumber({ value: overlay.start })}/TB[sticker${index}]`
	);
	return filters.join(",");
}

function buildSoundFilter({
	item,
	inputIndex,
	index,
}: {
	item: ResolvedComposeAudio;
	inputIndex: number;
	index: number;
}): string {
	const filters = [
		`[${inputIndex}:a:0]atrim=start=${ffmpegNumber({ value: item.audio.trim.in })}:duration=${ffmpegNumber({ value: item.duration })}`,
		"asetpts=PTS-STARTPTS",
		"aresample=async=1:first_pts=0",
		"aformat=sample_rates=48000:channel_layouts=stereo",
		`volume=${ffmpegNumber({ value: item.audio.volume })}`,
	];
	if (item.audio.fadeIn > 0) {
		filters.push(
			`afade=t=in:st=0:d=${ffmpegNumber({ value: item.audio.fadeIn })}`
		);
	}
	if (item.audio.fadeOut > 0) {
		filters.push(
			`afade=t=out:st=${ffmpegNumber({ value: item.duration - item.audio.fadeOut })}:d=${ffmpegNumber({ value: item.audio.fadeOut })}`
		);
	}
	filters.push(
		`adelay=${Math.round(item.audio.start * 1000)}:all=1[sfx${index}]`
	);
	return filters.join(",");
}

export function buildComposeFinishingArgs({
	input,
	output,
	duration,
	canvasWidth,
	canvasHeight,
	fps,
	overlays,
	audio,
}: {
	input: string;
	output: string;
	duration: number;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	overlays: MaterializedComposeOverlay[];
	audio: ResolvedComposeAudio[];
}): string[] {
	if (overlays.length === 0 && audio.length === 0) {
		throw new Error("Finishing pass requires a sticker or sound effect.");
	}
	const args = ["-i", input];
	for (const item of overlays) {
		args.push(
			"-loop",
			"1",
			"-framerate",
			String(fps),
			"-t",
			ffmpegNumber({ value: item.overlay.duration }),
			"-i",
			item.path
		);
	}
	for (const item of audio) args.push("-i", item.sourcePath);
	const filters: string[] = [];
	let videoLabel = "0:v:0";
	if (overlays.length > 0) {
		filters.push("[0:v:0]setpts=PTS-STARTPTS[basev0]");
		videoLabel = "basev0";
		for (const [index, item] of overlays.entries()) {
			filters.push(
				buildStickerFilter({
					item,
					inputIndex: index + 1,
					index,
					canvasWidth,
				})
			);
			const outputLabel = `basev${index + 1}`;
			const x = Math.round(item.overlay.transform.x * canvasWidth);
			const y = Math.round(item.overlay.transform.y * canvasHeight);
			filters.push(
				`[${videoLabel}][sticker${index}]overlay=x=${x}:y=${y}:eof_action=pass:repeatlast=0:enable='between(t,${ffmpegNumber({ value: item.overlay.start })},${ffmpegNumber({ value: item.overlay.start + item.overlay.duration })})'[${outputLabel}]`
			);
			videoLabel = outputLabel;
		}
		filters.push(`[${videoLabel}]format=yuv420p[vout]`);
		videoLabel = "vout";
	}
	let audioLabel = "0:a:0";
	if (audio.length > 0) {
		filters.push(
			"[0:a:0]aresample=async=1:first_pts=0,aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[basea]"
		);
		for (const [index, item] of audio.entries()) {
			filters.push(
				buildSoundFilter({
					item,
					inputIndex: overlays.length + index + 1,
					index,
				})
			);
		}
		const labels = ["[basea]", ...audio.map((_item, index) => `[sfx${index}]`)];
		filters.push(
			`${labels.join("")}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
		);
		audioLabel = "aout";
	}
	args.push(
		"-filter_complex",
		filters.join(";"),
		"-map",
		overlays.length > 0 ? `[${videoLabel}]` : videoLabel,
		"-map",
		audio.length > 0 ? `[${audioLabel}]` : audioLabel
	);
	if (overlays.length > 0) {
		args.push(
			"-c:v",
			"libx264",
			"-preset",
			"fast",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p"
		);
	} else {
		args.push("-c:v", "copy");
	}
	if (audio.length > 0) args.push("-c:a", "aac", "-b:a", "192k");
	else args.push("-c:a", "copy");
	args.push(
		"-t",
		ffmpegNumber({ value: duration }),
		"-movflags",
		"+faststart",
		output
	);
	return args;
}
