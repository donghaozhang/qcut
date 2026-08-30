import { Duplex } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createFilterLabFrameStream } from "./filter-lab-frame-stream.js";
import {
	filterLabEncodeArgs,
	startFilterLabFfmpeg,
	type FilterLabMediaInfo,
} from "./filter-lab-media.js";
import {
	createFilterLabNativeFrameRenderer,
	type FilterLabNativeRenderPlan,
} from "./filter-lab-native-frame-renderer.js";
import type { FilterLabRenderPlan } from "./filter-lab-render-plan.js";

type FilterLabFfmpegRenderPlan = Extract<
	FilterLabRenderPlan,
	{ kind: "ffmpeg" }
>;

type FilterLabPlanGroup =
	| { kind: "ffmpeg"; plans: FilterLabFfmpegRenderPlan[] }
	| { kind: "native"; plans: FilterLabNativeRenderPlan[] };

interface FilterLabRawStage {
	stream: Duplex;
	completion?: Promise<void>;
	process?: ReturnType<typeof startFilterLabFfmpeg>["process"];
	dispose?: () => Promise<void>;
}

function groupPlans({ plans }: { plans: FilterLabRenderPlan[] }) {
	const groups: FilterLabPlanGroup[] = [];
	for (const plan of plans) {
		const last = groups[groups.length - 1];
		if (plan.kind === "ffmpeg") {
			if (last?.kind === "ffmpeg") last.plans.push(plan);
			else groups.push({ kind: "ffmpeg", plans: [plan] });
			continue;
		}
		if (last?.kind === "native") last.plans.push(plan);
		else groups.push({ kind: "native", plans: [plan] });
	}
	return groups;
}

function namespacedLabel({
	label,
	inputLabel,
	prefix,
}: {
	label: string;
	inputLabel: string;
	prefix: string;
}) {
	if (label === "0:v" || label === "0:v:0") return inputLabel;
	if (/^\d+:[a-z]/i.test(label))
		throw new Error(
			"Filter pipeline graph requires an unsupported extra input."
		);
	return `${prefix}_${label.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function compileFilterLabFfmpegPipeline({
	plans,
	prefix = "filter_pipeline",
}: {
	plans: FilterLabFfmpegRenderPlan[];
	prefix?: string;
}): { filterGraph: string; outputLabel: string } {
	if (plans.length === 0)
		throw new Error("FFmpeg filter pipeline requires at least one plan.");
	const graphSteps: string[] = [];
	let inputLabel = "0:v:0";
	for (const [index, plan] of plans.entries()) {
		const stepPrefix = `${prefix}_${index}`;
		const filterGraph = plan.filterGraph.replace(
			/\[([^[\]]+)]/g,
			(_match, label: string) =>
				`[${namespacedLabel({ label, inputLabel, prefix: stepPrefix })}]`
		);
		const outputLabel = namespacedLabel({
			label: plan.outputLabel,
			inputLabel,
			prefix: stepPrefix,
		});
		if (!filterGraph.includes(`[${outputLabel}]`))
			throw new Error(
				"Filter pipeline graph does not expose its output label."
			);
		graphSteps.push(filterGraph);
		inputLabel = outputLabel;
	}
	return { filterGraph: graphSteps.join(";"), outputLabel: inputLabel };
}

function createFfmpegRawStage({
	plans,
	groupIndex,
	media,
	isImage,
	signal,
}: {
	plans: FilterLabFfmpegRenderPlan[];
	groupIndex: number;
	media: FilterLabMediaInfo;
	isImage: boolean;
	signal: AbortSignal;
}): FilterLabRawStage {
	const compiled = compileFilterLabFfmpegPipeline({
		plans,
		prefix: `filter_pipeline_${groupIndex}`,
	});
	const outputLabel = `filter_pipeline_${groupIndex}_rgba`;
	const task = startFilterLabFfmpeg({
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
			"-filter_complex",
			`${compiled.filterGraph};[${compiled.outputLabel}]format=rgba[${outputLabel}]`,
			"-map",
			`[${outputLabel}]`,
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
		signal,
	});
	return {
		stream: Duplex.from({
			readable: task.process.stdout,
			writable: task.process.stdin,
		}),
		completion: task.completion,
		process: task.process,
	};
}

function createNativeRawStage({
	plans,
	media,
	isImage,
	signal,
}: {
	plans: FilterLabNativeRenderPlan[];
	media: FilterLabMediaInfo;
	isImage: boolean;
	signal: AbortSignal;
}): FilterLabRawStage {
	const renderer = createFilterLabNativeFrameRenderer({
		plans,
		media,
		isImage,
		signal,
	});
	return {
		stream: Duplex.from(
			createFilterLabFrameStream({
				frameBytes: media.width * media.height * 4,
				renderFrame: renderer.renderFrame,
			})
		),
		dispose: renderer.dispose,
	};
}

export async function renderFilterLabPipelineMedia({
	input,
	output,
	isImage,
	media,
	plans,
	signal,
}: {
	input: string;
	output: string;
	isImage: boolean;
	media: FilterLabMediaInfo;
	plans: FilterLabRenderPlan[];
	signal: AbortSignal;
}): Promise<void> {
	if (plans.length === 0)
		throw new Error("Filter pipeline requires at least one render plan.");
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
	const groups = groupPlans({ plans });
	const stages = groups.map((group, groupIndex) =>
		group.kind === "ffmpeg"
			? createFfmpegRawStage({
					plans: group.plans,
					groupIndex,
					media,
					isImage,
					signal,
				})
			: createNativeRawStage({
					plans: group.plans,
					media,
					isImage,
					signal,
				})
	);
	decode.process.stdin.end();
	encode.process.stdout.resume();
	const transfer = pipeline(
		[
			decode.process.stdout,
			...stages.map(({ stream }) => stream),
			encode.process.stdin,
		],
		{ signal }
	);
	const onAbort = () => {
		for (const stage of stages) void stage.dispose?.().catch(() => {});
	};
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		await Promise.all([
			decode.completion,
			transfer,
			...stages.flatMap(({ completion }) => (completion ? [completion] : [])),
			encode.completion,
		]);
	} finally {
		signal.removeEventListener("abort", onAbort);
		decode.process.kill();
		encode.process.kill();
		decode.process.stdout.destroy();
		encode.process.stdin.destroy();
		for (const stage of stages) {
			stage.process?.kill();
			stage.stream.destroy();
		}
		await Promise.allSettled([
			decode.completion,
			transfer,
			...stages.flatMap(({ completion }) => (completion ? [completion] : [])),
			encode.completion,
			...stages.flatMap(({ dispose }) => (dispose ? [dispose()] : [])),
		]);
	}
}
