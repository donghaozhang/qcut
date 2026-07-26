import type { MaterializedSticker } from "./sticker-asset-materializer.js";

export interface StickerOverlayVideoProbe {
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
}

export interface ResolvedStickerOverlay extends MaterializedSticker {
	soundEffectPath?: string;
}

function ffmpegNumber({ value }: { value: number }): string {
	return Number(value.toFixed(3)).toString();
}

function stickerFilter({
	sticker,
	inputIndex,
	outputLabel,
}: {
	sticker: ResolvedStickerOverlay;
	inputIndex: number;
	outputLabel: string;
}): string {
	const { item } = sticker;
	const filters = [
		`[${inputIndex}:v]format=rgba`,
		item.height
			? `scale=${item.width}:${item.height}`
			: `scale=${item.width}:-1`,
	];
	if (item.rotation !== 0) {
		const radians = ffmpegNumber({ value: (item.rotation * Math.PI) / 180 });
		filters.push(`rotate=${radians}:ow=rotw(iw):oh=roth(ih):c=none`);
	}
	if (item.opacity < 1) {
		filters.push(
			`colorchannelmixer=aa=${ffmpegNumber({ value: item.opacity })}`
		);
	}
	if (item.fadeIn > 0) {
		filters.push(
			`fade=t=in:st=0:d=${ffmpegNumber({ value: item.fadeIn })}:alpha=1`
		);
	}
	if (item.fadeOut > 0) {
		filters.push(
			`fade=t=out:st=${ffmpegNumber({
				value: item.duration - item.fadeOut,
			})}:d=${ffmpegNumber({ value: item.fadeOut })}:alpha=1`
		);
	}
	filters.push(
		`setpts=PTS-STARTPTS+${ffmpegNumber({ value: item.startTime })}/TB[${outputLabel}]`
	);
	return filters.join(",");
}

function soundEffectFilter({
	sticker,
	inputIndex,
	outputLabel,
}: {
	sticker: ResolvedStickerOverlay;
	inputIndex: number;
	outputLabel: string;
}): string {
	const soundEffect = sticker.item.soundEffect;
	if (!(soundEffect && sticker.soundEffectPath)) {
		throw new Error("Sound effect input is missing");
	}
	const filters = [
		`[${inputIndex}:a]atrim=start=${ffmpegNumber({
			value: soundEffect.trimStart,
		})}${soundEffect.duration ? `:duration=${ffmpegNumber({ value: soundEffect.duration })}` : ""}`,
		"asetpts=PTS-STARTPTS",
		"aformat=sample_rates=48000:channel_layouts=stereo",
		`volume=${ffmpegNumber({ value: soundEffect.volume })}`,
	];
	if (soundEffect.duration && soundEffect.duration > 0.08) {
		const fadeDuration = Math.min(0.08, soundEffect.duration / 3);
		filters.push(
			`afade=t=in:st=0:d=${ffmpegNumber({ value: fadeDuration })}`,
			`afade=t=out:st=${ffmpegNumber({
				value: soundEffect.duration - fadeDuration,
			})}:d=${ffmpegNumber({ value: fadeDuration })}`
		);
	}
	filters.push(
		`adelay=${Math.round(sticker.item.startTime * 1000)}:all=1[${outputLabel}]`
	);
	return filters.join(",");
}

export function buildStickerOverlayFfmpegArgs({
	input,
	output,
	probe,
	stickers,
}: {
	input: string;
	output: string;
	probe: StickerOverlayVideoProbe;
	stickers: ResolvedStickerOverlay[];
}): string[] {
	if (stickers.length === 0) {
		throw new Error("At least one sticker is required");
	}

	const args = ["-hide_banner", "-y", "-i", input];
	for (const sticker of stickers) {
		args.push(
			"-loop",
			"1",
			"-framerate",
			"30",
			"-t",
			ffmpegNumber({ value: sticker.item.duration }),
			"-i",
			sticker.path
		);
	}

	const soundEffects = stickers.filter(
		(sticker) => sticker.item.soundEffect && sticker.soundEffectPath
	);
	for (const soundEffect of soundEffects) {
		args.push("-i", soundEffect.soundEffectPath as string);
	}

	const filters = ["[0:v]setpts=PTS-STARTPTS[basev0]"];
	let previousVideoLabel = "basev0";
	for (const [index, sticker] of stickers.entries()) {
		const stickerLabel = `sticker${index}`;
		const outputLabel = `basev${index + 1}`;
		filters.push(
			stickerFilter({
				sticker,
				inputIndex: index + 1,
				outputLabel: stickerLabel,
			})
		);
		filters.push(
			`[${previousVideoLabel}][${stickerLabel}]overlay=x=${ffmpegNumber({
				value: sticker.item.x,
			})}:y=${ffmpegNumber({
				value: sticker.item.y,
			})}:eof_action=pass:repeatlast=0:enable='between(t,${ffmpegNumber({
				value: sticker.item.startTime,
			})},${ffmpegNumber({
				value: sticker.item.startTime + sticker.item.duration,
			})})'[${outputLabel}]`
		);
		previousVideoLabel = outputLabel;
	}
	filters.push(`[${previousVideoLabel}]format=yuv420p[vout]`);

	if (soundEffects.length > 0) {
		filters.push(
			probe.hasAudio
				? "[0:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS[basea]"
				: `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${ffmpegNumber(
						{ value: probe.duration }
					)},asetpts=PTS-STARTPTS[basea]`
		);
		const audioLabels = ["[basea]"];
		for (const [index, sticker] of soundEffects.entries()) {
			const label = `sfx${index}`;
			filters.push(
				soundEffectFilter({
					sticker,
					inputIndex: stickers.length + index + 1,
					outputLabel: label,
				})
			);
			audioLabels.push(`[${label}]`);
		}
		filters.push(
			`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
		);
	}

	args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
	if (soundEffects.length > 0) {
		args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
	} else if (probe.hasAudio) {
		args.push("-map", "0:a:0", "-c:a", "copy");
	}
	args.push(
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
		"-t",
		ffmpegNumber({ value: probe.duration }),
		output
	);
	return args;
}
