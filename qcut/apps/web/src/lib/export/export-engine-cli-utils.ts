import { debugWarn } from "@/lib/debug/debug-config";
import { platform } from "@qcut/platform-core";

export type ElectronInvoke = (
	channel: string,
	...args: unknown[]
) => Promise<unknown>;

export interface FileInfoLike {
	size: number;
}

export interface AudioValidationLike {
	error?: string;
	hasAudio?: boolean;
	duration?: number;
	info?: {
		streams?: unknown[];
	};
	valid?: boolean;
}

/** Get the optional Electron IPC invoke function, or null if unavailable. */
export function getOptionalInvoke(): ElectronInvoke | null {
	try {
		const p = platform() as unknown as { invoke?: ElectronInvoke };
		if (typeof p.invoke === "function") {
			return p.invoke;
		}
		return null;
	} catch (error) {
		debugWarn("[CLIExportEngine] Failed to access optional invoke API:", error);
		return null;
	}
}

/** Invoke an Electron IPC channel if available, returning null on failure or absence. */
export async function invokeIfAvailable({
	args = [],
	channel,
}: {
	args?: unknown[];
	channel: string;
}): Promise<unknown | null> {
	try {
		const invoke = getOptionalInvoke();
		if (!invoke) {
			return null;
		}
		return await invoke(channel, ...args);
	} catch (error) {
		debugWarn(
			`[CLIExportEngine] Optional invoke call failed for channel ${channel}:`,
			error
		);
		return null;
	}
}

/** Get file size info via platform API, returning null if unavailable. */
export async function getFileInfo({
	filePath,
}: {
	filePath: string;
}): Promise<FileInfoLike | null> {
	try {
		const fileInfo = await platform().files.getFileInfo(filePath);
		if (!fileInfo || typeof fileInfo.size !== "number") {
			return null;
		}
		return fileInfo;
	} catch {
		return null;
	}
}

/** Check if a file exists via Electron API with legacy fallback. */
export async function fileExists({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	try {
		const fileInfo = await getFileInfo({ filePath });
		if (fileInfo && fileInfo.size >= 0) {
			return true;
		}

		const legacyExists = await invokeIfAvailable({
			channel: "file-exists",
			args: [filePath],
		});
		return legacyExists === true;
	} catch (error) {
		debugWarn(
			`[CLIExportEngine] Failed to determine file existence for ${filePath}:`,
			error
		);
		return false;
	}
}

/** Validate an audio file using ffprobe via Electron IPC. */
export async function validateAudioWithFfprobe({
	filePath,
}: {
	filePath: string;
}): Promise<AudioValidationLike | null> {
	try {
		const validation = await invokeIfAvailable({
			channel: "validate-audio-file",
			args: [filePath],
		});
		if (!validation || typeof validation !== "object") {
			return null;
		}

		return validation as AudioValidationLike;
	} catch (error) {
		debugWarn(
			`[CLIExportEngine] Failed to run optional ffprobe validation for ${filePath}:`,
			error
		);
		return null;
	}
}
