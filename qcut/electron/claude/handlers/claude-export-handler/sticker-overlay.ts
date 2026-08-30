import type { StickerOverlay } from "./types.js";

export interface StickerOverlayPass {
	args: string[];
	filterComplex: string;
}

export function buildStickerOverlayPass({
	inputPath,
	outputPath,
	stickerOverlays,
	codec,
	bitrate,
}: {
	inputPath: string;
	outputPath: string;
	stickerOverlays: StickerOverlay[];
	codec: string;
	bitrate: string;
}): StickerOverlayPass {
	if (stickerOverlays.length === 0) {
		throw new Error("Sticker overlay pass requires at least one sticker");
	}

	const args = ["-y", "-i", inputPath];
	for (const sticker of stickerOverlays) {
		args.push(
			"-stream_loop",
			"-1",
			"-t",
			String(sticker.endTime),
			"-i",
			sticker.sourcePath
		);
	}

	const filterSteps: string[] = [];
	let currentLabel = "0:v";
	for (const [index, sticker] of stickerOverlays.entries()) {
		const inputIndex = index + 1;
		const scaledLabel = `stk_s${index}`;
		let preparedLabel = scaledLabel;
		filterSteps.push(
			`[${inputIndex}:v]scale=${sticker.width}:${sticker.height}[${scaledLabel}]`
		);

		if (sticker.rotation !== 0) {
			const rotatedLabel = `stk_r${index}`;
			filterSteps.push(
				`[${preparedLabel}]rotate=${sticker.rotation}*PI/180:c=none[${rotatedLabel}]`
			);
			preparedLabel = rotatedLabel;
		}

		if (sticker.opacity < 1) {
			const alphaLabel = `stk_a${index}`;
			filterSteps.push(
				`[${preparedLabel}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${sticker.opacity}*alpha(X,Y)'[${alphaLabel}]`
			);
			preparedLabel = alphaLabel;
		}

		const outputLabel = `stk_o${index}`;
		filterSteps.push(
			`[${currentLabel}][${preparedLabel}]overlay=x=${sticker.x}:y=${sticker.y}:enable='between(t,${sticker.startTime},${sticker.endTime})'[${outputLabel}]`
		);
		currentLabel = outputLabel;
	}

	const filterComplex = filterSteps.join(";");
	args.push(
		"-filter_complex",
		filterComplex,
		"-map",
		`[${currentLabel}]`,
		"-map",
		"0:a?",
		"-c:v",
		codec,
		"-preset",
		"medium",
		"-b:v",
		bitrate,
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"copy",
		"-movflags",
		"+faststart",
		outputPath
	);

	return { args, filterComplex };
}
