import { pipeline } from "node:stream/promises";
import { createFilterLabFrameStream } from "./filter-lab-frame-stream.js";
import {
	filterLabEncodeArgs,
	runFilterLabFfmpeg,
	startFilterLabFfmpeg,
	type FilterLabMediaInfo,
} from "./filter-lab-media.js";
import { createFilterLabNativeFrameRenderer } from "./filter-lab-native-frame-renderer.js";
import type { FilterLabRenderPlan } from "./filter-lab-render-plan.js";

export interface FilterLabRenderMediaOptions {
	input: string;
	output: string;
	isImage: boolean;
	media: FilterLabMediaInfo;
	plan: FilterLabRenderPlan;
	signal: AbortSignal;
}

async function renderNativeMedia({
	input,
	output,
	isImage,
	media,
	plan,
	signal,
}: FilterLabRenderMediaOptions & {
	plan: Extract<FilterLabRenderPlan, { kind: "native" }>;
}): Promise<void> {
	const frameRenderer = createFilterLabNativeFrameRenderer({
		plans: [plan],
		isImage,
		media,
		signal,
	});
	const decode = startFilterLabFfmpeg({
		args: [
			"-i",
			input,
			"-map",
			"0:v:0",
			...(isImage
				? ["-frames:v", "1"]
				: ["-t", String(media.duration), "-vf", `fps=${media.frameRate}`]),
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
		signal,
	});
	const encode = startFilterLabFfmpeg({
		args: [
			"-f",
			"rawvideo",
			"-pixel_format",
			"rgba",
			"-video_size",
			`${media.width}x${media.height}`,
			"-framerate",
			String(isImage ? 1 : media.frameRate),
			"-i",
			"pipe:0",
			...(isImage ? [] : ["-i", input]),
			"-map",
			"0:v:0",
			...(isImage ? [] : ["-map", "1:a?"]),
			...filterLabEncodeArgs({ isImage, duration: media.duration }),
			output,
		],
		signal,
	});
	decode.process.stdin.end();
	encode.process.stdout.resume();
	const frames = createFilterLabFrameStream({
		frameBytes: media.width * media.height * 4,
		renderFrame: frameRenderer.renderFrame,
	});
	const transfer = pipeline(
		decode.process.stdout,
		frames,
		encode.process.stdin,
		{ signal }
	);
	const onAbort = () => {
		void frameRenderer.dispose().catch(() => {});
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		await Promise.all([decode.completion, transfer, encode.completion]);
	} finally {
		signal.removeEventListener("abort", onAbort);
		decode.process.kill();
		encode.process.kill();
		frames.destroy();
		decode.process.stdout.destroy();
		encode.process.stdin.destroy();
		await Promise.allSettled([decode.completion, transfer, encode.completion]);
		await frameRenderer.dispose();
	}
}

export async function renderFilterLabMedia({
	input,
	output,
	isImage,
	media,
	plan,
	signal,
}: FilterLabRenderMediaOptions): Promise<void> {
	if (plan.kind === "native") {
		await renderNativeMedia({ input, output, isImage, media, plan, signal });
		return;
	}
	const frameRateGraph = isImage
		? plan.filterGraph
		: `${plan.filterGraph};[${plan.outputLabel}]fps=${media.frameRate}[filter_cfr]`;
	await runFilterLabFfmpeg({
		args: [
			"-i",
			input,
			"-filter_complex",
			frameRateGraph,
			"-map",
			`[${isImage ? plan.outputLabel : "filter_cfr"}]`,
			...(isImage ? [] : ["-map", "0:a?"]),
			...filterLabEncodeArgs({ isImage, duration: media.duration }),
			output,
		],
		signal,
	});
}
