import type { MediaMaskTrackingSample } from "@/lib/video/media-mask-tracking";
import type { PersonCutoutMaskOptions } from "./person-cutout-mask";
import type {
	JianyingPersonCutoutRenderResult,
	TemattingOutputBlendImplementation,
} from "@/types/electron/api-jianying-person-cutout";

export type PersonCutoutExecutionMetadata = Pick<
	JianyingPersonCutoutRenderResult,
	| "didModelRouteFallback"
	| "modelRoute"
	| "pipelineId"
	| "provider"
	| "refinementProvider"
	| "requestedModelRoute"
>;

export interface JianyingPersonCutoutClientResult
	extends PersonCutoutExecutionMetadata {
	blendImplementation: TemattingOutputBlendImplementation;
	blob: Blob;
	width: number;
	height: number;
	duration: number;
	frameRate: number;
	frameCount: number;
	codec: "vp9";
	hasAudio: boolean;
	nativeMetalCanary?: JianyingPersonCutoutRenderResult["nativeMetalCanary"];
	trackingSamples: MediaMaskTrackingSample[];
}

function throwIfAborted({ signal }: { signal?: AbortSignal }) {
	if (signal?.aborted) throw new DOMException("人物抠像已取消", "AbortError");
}

export async function exportJianyingPersonCutout({
	file,
	sourcePath: explicitSourcePath,
	settings,
	onProgress,
	signal,
}: {
	file: File;
	sourcePath?: string;
	settings: PersonCutoutMaskOptions;
	onProgress?: (progress: { progress: number; status: string }) => void;
	signal?: AbortSignal;
}): Promise<JianyingPersonCutoutClientResult> {
	throwIfAborted({ signal });
	const api = window.electronAPI?.jianyingPersonCutout;
	const readFile = window.electronAPI?.readFile;
	const getPathForFile = window.electronAPI?.getPathForFile;
	if (!api || !readFile || !getPathForFile) {
		throw new Error("精细抠像需要 QCut 桌面版");
	}
	const sourcePath = explicitSourcePath ?? getPathForFile(file);
	if (!sourcePath) throw new Error("无法读取所选视频");
	const taskId = crypto.randomUUID();
	const unsubscribeProgress = api.onProgress((update) => {
		if (update.taskId !== taskId) return;
		onProgress?.({ progress: update.progress, status: update.status });
	});
	const cancel = () => {
		void api.cancel({ taskId });
	};
	signal?.addEventListener("abort", cancel, { once: true });
	onProgress?.({ progress: 3, status: "正在加载精细抠像..." });
	try {
		const runtime = await api.inspect();
		if (!runtime.available) throw new Error(runtime.message);
		throwIfAborted({ signal });
		onProgress?.({ progress: 8, status: "正在精细抠除背景..." });
		const result = await api.render({ sourcePath, settings, taskId });
		if (!result) {
			throwIfAborted({ signal });
			throw new Error("人物抠像未返回结果");
		}
		try {
			throwIfAborted({ signal });
			onProgress?.({ progress: 94, status: "正在准备抠像结果..." });
			const bytes = await readFile(result.outputPath);
			if (!bytes) throw new Error("无法读取精细抠像结果");
			throwIfAborted({ signal });
			onProgress?.({ progress: 100, status: "人物抠像已完成" });
			return {
				blendImplementation: result.blendImplementation,
				didModelRouteFallback: result.didModelRouteFallback,
				blob: new Blob([new Uint8Array(bytes)], { type: "video/webm" }),
				width: result.width,
				height: result.height,
				duration: result.duration,
				frameRate: result.frameRate,
				frameCount: result.frameCount,
				codec: result.codec,
				hasAudio: result.hasAudio,
				modelRoute: result.modelRoute,
				nativeMetalCanary: result.nativeMetalCanary,
				pipelineId: result.pipelineId,
				provider: result.provider,
				refinementProvider: result.refinementProvider,
				requestedModelRoute: result.requestedModelRoute,
				trackingSamples: [],
			};
		} finally {
			await api.release({ outputPath: result.outputPath });
		}
	} finally {
		signal?.removeEventListener("abort", cancel);
		unsubscribeProgress();
	}
}
