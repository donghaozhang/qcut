import type { JianyingDeflickerResult } from "@/types/electron/api-jianying-basic-video";

export interface JianyingPrivateDeflickerClientResult {
	file: File;
	runtime: JianyingDeflickerResult;
}

function outputFileName({ sourceName }: { sourceName: string }) {
	const extensionIndex = sourceName.lastIndexOf(".");
	const stem =
		extensionIndex > 0 ? sourceName.slice(0, extensionIndex) : sourceName;
	return `${stem}-deflicker.mp4`;
}

export async function exportJianyingPrivateDeflicker({
	file,
	onProgress,
	signal,
	sourcePath: explicitSourcePath,
	strength,
}: {
	file: File;
	onProgress?: (progress: { progress: number; status: string }) => void;
	signal?: AbortSignal;
	sourcePath?: string;
	strength: number;
}): Promise<JianyingPrivateDeflickerClientResult> {
	if (signal?.aborted) throw new DOMException("防闪烁已取消", "AbortError");
	const api = window.electronAPI?.jianyingBasicVideo;
	const readFile = window.electronAPI?.readFile;
	const getPathForFile = window.electronAPI?.getPathForFile;
	if (!api || !readFile || !getPathForFile) {
		throw new Error("本机剪映防闪烁需要 QCut 桌面版");
	}
	const sourcePath = explicitSourcePath ?? getPathForFile(file);
	if (!sourcePath) throw new Error("无法读取所选视频的本机路径");
	const taskId = crypto.randomUUID();
	const unsubscribeProgress = api.onProgress((update) => {
		if (update.taskId !== taskId) return;
		onProgress?.({ progress: update.progress, status: update.status });
	});
	const cancel = () => {
		void api.cancel({ taskId });
	};
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		const status = await api.inspect();
		if (!status.available) throw new Error(status.message);
		const result = await api.deflicker({ sourcePath, strength, taskId });
		if (signal?.aborted) throw new DOMException("防闪烁已取消", "AbortError");
		const bytes = await readFile(result.outputPath);
		if (!bytes) throw new Error("无法读取本机防闪烁输出");
		return {
			file: new File(
				[new Uint8Array(bytes)],
				outputFileName({ sourceName: file.name }),
				{
					type: "video/mp4",
				}
			),
			runtime: result,
		};
	} finally {
		signal?.removeEventListener("abort", cancel);
		unsubscribeProgress();
	}
}
