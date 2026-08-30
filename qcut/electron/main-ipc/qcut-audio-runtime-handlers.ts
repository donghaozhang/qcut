import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { AudioSettings } from "../ffmpeg/audio-settings.js";
import {
	QCUT_AUDIO_RUNTIME_CACHE_STATS_CHANNEL,
	QCUT_AUDIO_RUNTIME_CANCEL_CHANNEL,
	QCUT_AUDIO_RUNTIME_CLEAR_CACHE_CHANNEL,
	QCUT_AUDIO_RUNTIME_PROCESS_CHANNEL,
	QCUT_AUDIO_RUNTIME_STATUS_CHANNEL,
	type QcutAudioProcessRequest,
} from "../qcut-audio-runtime-contract.js";
import {
	clearQcutAudioCache,
	getQcutAudioCacheStats,
} from "../qcut-audio-runtime/cache.js";
import { inspectQcutAudioRuntime } from "../qcut-audio-runtime/capabilities.js";
import {
	cancelQcutAudioProcess,
	processQcutAudio,
} from "../qcut-audio-runtime/process.js";

function parseProcessRequest({
	value,
}: {
	value: unknown;
}): QcutAudioProcessRequest {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("QCut audio process request must be an object");
	}
	const requestId = Reflect.get(value, "requestId");
	const sourcePath = Reflect.get(value, "sourcePath");
	const audio = Reflect.get(value, "audio");
	if (typeof requestId !== "string") {
		throw new Error("QCut audio requestId must be a string");
	}
	if (typeof sourcePath !== "string") {
		throw new Error("QCut audio sourcePath must be a string");
	}
	if (typeof audio !== "object" || audio === null || Array.isArray(audio)) {
		throw new Error("QCut audio settings must be an object");
	}
	return { requestId, sourcePath, audio: audio as AudioSettings };
}

export function registerQcutAudioRuntimeHandlers(): void {
	ipcMain.handle(QCUT_AUDIO_RUNTIME_STATUS_CHANNEL, () =>
		inspectQcutAudioRuntime()
	);
	ipcMain.handle(QCUT_AUDIO_RUNTIME_CACHE_STATS_CHANNEL, () =>
		getQcutAudioCacheStats()
	);
	ipcMain.handle(QCUT_AUDIO_RUNTIME_CLEAR_CACHE_CHANNEL, () =>
		clearQcutAudioCache()
	);
	ipcMain.handle(
		QCUT_AUDIO_RUNTIME_PROCESS_CHANNEL,
		async (_event: IpcMainInvokeEvent, value: unknown) =>
			processQcutAudio({ request: parseProcessRequest({ value }) })
	);
	ipcMain.handle(
		QCUT_AUDIO_RUNTIME_CANCEL_CHANNEL,
		(_event: IpcMainInvokeEvent, value: unknown) => {
			if (typeof value !== "string" || value.length === 0) {
				throw new Error("QCut audio cancel requestId must be a string");
			}
			return cancelQcutAudioProcess({ requestId: value });
		}
	);
}
