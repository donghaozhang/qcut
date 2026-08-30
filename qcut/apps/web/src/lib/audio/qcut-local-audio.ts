import { platform } from "@qcut/platform-core";
import type { MediaAudioSettings } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { createDefaultMediaAudioSettings } from "./audio-properties";
import type {
	QcutAudioProcessRequest,
	QcutAudioProcessResult,
} from "../../../../../electron/qcut-audio-runtime-contract";

async function resolveQcutAudioSourcePath({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): Promise<string> {
	if (mediaItem.localPath) {
		try {
			const info = await platform().files.getFileInfo(mediaItem.localPath);
			if (info && !info.isDirectory) return mediaItem.localPath;
		} catch {}
	}
	if (mediaItem.file?.size > 0) {
		const nativePath = platform().getPathForFile(mediaItem.file);
		if (nativePath) return nativePath;
		return await platform().audio.saveTemp(
			new Uint8Array(await mediaItem.file.arrayBuffer()),
			mediaItem.name
		);
	}
	throw new Error(
		`Unable to read ${mediaItem.name} for local audio processing`
	);
}

/**
 * Runs processLocal while honoring the caller's AbortSignal: an abort asks the
 * main process to kill the FFmpeg job for this requestId and rejects
 * immediately instead of waiting for the orphaned render.
 */
async function invokeProcessLocal({
	api,
	request,
	signal,
}: {
	api: {
		processLocal: (
			request: QcutAudioProcessRequest
		) => Promise<QcutAudioProcessResult>;
		cancelLocal?: (requestId: string) => Promise<boolean>;
	};
	request: QcutAudioProcessRequest;
	signal?: AbortSignal;
}): Promise<QcutAudioProcessResult> {
	if (!signal) return api.processLocal(request);
	let removeAbortListener = () => {};
	const cancelled = new Promise<never>((_, reject) => {
		const onAbort = () => {
			void api.cancelLocal?.(request.requestId).catch(() => {});
			reject(new DOMException("Audio processing cancelled", "AbortError"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		removeAbortListener = () => signal.removeEventListener("abort", onAbort);
	});
	try {
		return await Promise.race([api.processLocal(request), cancelled]);
	} finally {
		removeAbortListener();
	}
}

export function localDenoiseSettings({
	settings,
}: {
	settings: MediaAudioSettings;
}): MediaAudioSettings {
	const local = createDefaultMediaAudioSettings();
	return {
		...local,
		denoise: {
			...local.denoise,
			enabled: true,
			amount: Math.max(65, settings.denoise.amount),
			noiseFloorDb: settings.denoise.noiseFloorDb,
			mode: "realtime",
		},
	};
}

export async function processQcutLocalDenoise({
	mediaItem,
	settings,
	requestId,
	signal,
}: {
	mediaItem: MediaItem;
	settings: MediaAudioSettings;
	requestId: string;
	signal?: AbortSignal;
}): Promise<QcutAudioProcessResult> {
	if (signal?.aborted)
		throw new DOMException("Audio processing cancelled", "AbortError");
	const api = window.electronAPI?.audio;
	if (!api?.processLocal || !api.inspectLocalRuntime) {
		throw new Error("QCut local audio processing requires QCut Desktop");
	}
	const runtime = await api.inspectLocalRuntime();
	const denoise = runtime.features.find(
		(feature) => feature.id === "spectral-denoise"
	);
	if (!runtime.independentFromJianying || denoise?.status !== "ready") {
		throw new Error(denoise?.reason ?? "QCut local denoise is not available");
	}
	const sourcePath = await resolveQcutAudioSourcePath({ mediaItem });
	if (signal?.aborted)
		throw new DOMException("Audio processing cancelled", "AbortError");
	const result = await invokeProcessLocal({
		api,
		request: {
			requestId,
			sourcePath,
			audio: localDenoiseSettings({ settings }),
		},
		signal,
	});
	if (signal?.aborted)
		throw new DOMException("Audio processing cancelled", "AbortError");
	return result;
}
