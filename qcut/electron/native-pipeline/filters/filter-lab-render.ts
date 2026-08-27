import { pipeline } from "node:stream/promises";
import {
	createJianyingFilterLocalRenderSession,
	type JianyingFilterLocalRenderSession,
} from "../../jianying-filter-local-runtime/render.js";
import { createFilterLabFrameStream } from "./filter-lab-frame-stream.js";
import {
	filterLabEncodeArgs,
	runFilterLabFfmpeg,
	startFilterLabFfmpeg,
	type FilterLabMediaInfo,
} from "./filter-lab-media.js";
import type { FilterLabRenderPlan } from "./filter-lab-render-plan.js";

export interface FilterLabRenderMediaOptions {
	input: string;
	output: string;
	isImage: boolean;
	media: FilterLabMediaInfo;
	plan: FilterLabRenderPlan;
	signal: AbortSignal;
}

function restoreAlphaAndIntensity({
	source,
	rendered,
	intensity,
}: {
	source: Uint8Array;
	rendered: Uint8Array;
	intensity: number;
}): Uint8Array {
	if (source.length !== rendered.length)
		throw new Error("Native frame dimensions changed.");
	const weight = intensity / 100;
	const output = new Uint8Array(rendered.length);
	for (let index = 0; index < output.length; index += 1) {
		output[index] =
			index % 4 === 3
				? source[index]
				: Math.round(
						source[index] + (rendered[index] - source[index]) * weight
					);
	}
	return output;
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
	let session: JianyingFilterLocalRenderSession | undefined;
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
		renderFrame: async ({ rgba, index }) => {
			signal.throwIfAborted();
			if (!session) {
				session = await createJianyingFilterLocalRenderSession({
					resourceId: plan.evidence.resourceId,
					packagePath: plan.packagePath,
					width: media.width,
					height: media.height,
					bootstrapRgba: rgba,
					runtime: plan.runtime,
					mode: plan.mode,
					intensity: plan.evidence.intensity,
					captureFace: plan.captureFace,
				});
			}
			signal.throwIfAborted();
			const result = await session.render({
				rgba,
				timestampSeconds: isImage ? 0 : index / media.frameRate,
			});
			if (plan.mode === "portrait" && !result.mask)
				throw new Error("Native skin segmentation did not return a mask.");
			return restoreAlphaAndIntensity({
				source: rgba,
				rendered: result.rgba,
				intensity: plan.mode === "portrait" ? plan.evidence.intensity : 100,
			});
		},
	});
	const transfer = pipeline(
		decode.process.stdout,
		frames,
		encode.process.stdin,
		{ signal }
	);
	const onAbort = () => {
		void session?.dispose().catch(() => {});
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
		await session?.dispose();
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
