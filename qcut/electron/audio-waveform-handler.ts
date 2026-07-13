import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type {
	AudioWaveformOptions,
	AudioWaveformResult,
} from "./ffmpeg/types.js";
import { extractAudioWaveform } from "./ffmpeg/audio-waveform.js";

export function setupAudioWaveformHandlers(): void {
	ipcMain.handle(
		"ffmpeg-extract-audio-waveform",
		async (
			_event: IpcMainInvokeEvent,
			options: AudioWaveformOptions
		): Promise<AudioWaveformResult> => extractAudioWaveform({ options })
	);
}
