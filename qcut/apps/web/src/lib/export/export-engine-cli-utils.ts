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

/**
 * Retrieve the platform's optional Electron IPC `invoke` function if present.
 *
 * Returns the `invoke` function exposed by the platform API, or `null` when the function is not present or cannot be accessed.
 *
 * @returns The platform IPC `invoke` function, or `null` if unavailable or access fails.
 */
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

/**
 * Invoke an IPC channel through the platform's optional invoke function when available.
 *
 * @param channel - The IPC channel name to invoke
 * @param args - Optional arguments to pass to the invoked channel
 * @returns The result returned by the invoked channel, or `null` if the invoke function is unavailable or the call fails
 */
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

/**
 * Retrieve file metadata (including size) for the specified path via the platform API.
 *
 * @param filePath - The path to the file to inspect
 * @returns The file info object containing a numeric `size`, or `null` if unavailable, invalid, or an error occurred
 */
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
