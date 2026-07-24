import {
	BrowserWindow,
	desktopCapturer,
	type IpcMainInvokeEvent,
} from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	SCREEN_RECORDING_OUTPUT_FORMAT,
	SCREEN_SOURCE_TYPE,
	type ActiveScreenRecordingSession,
	type ScreenCaptureSource,
	type ScreenRecordingOutputFormat,
	type ScreenSourceType,
} from "./types.js";

export function buildCaptureFilePath({
	outputPath,
	sessionId,
	outputFormat,
}: {
	outputPath: string;
	sessionId: string;
	outputFormat: ScreenRecordingOutputFormat;
}): string {
	try {
		if (outputFormat === SCREEN_RECORDING_OUTPUT_FORMAT.WEBM) {
			return outputPath;
		}

		const parsedPath = path.parse(outputPath);
		const captureFilename = `${parsedPath.name}-${sessionId}.capture.webm`;
		return path.join(parsedPath.dir, captureFilename);
	} catch {
		return `${outputPath}.${sessionId}.capture.webm`;
	}
}

export async function ensureParentDirectory({
	filePath,
}: {
	filePath: string;
}): Promise<void> {
	try {
		const parentDirectory = path.dirname(filePath);
		await fs.promises.mkdir(parentDirectory, { recursive: true });
	} catch (error: unknown) {
		throw new Error(
			`Failed to create output directory: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function mapSourceType({ sourceId }: { sourceId: string }): ScreenSourceType {
	if (sourceId.startsWith("screen:")) {
		return SCREEN_SOURCE_TYPE.SCREEN;
	}
	return SCREEN_SOURCE_TYPE.WINDOW;
}

export async function listCaptureSources({
	currentWindowSourceId,
}: {
	currentWindowSourceId: string | null;
}): Promise<ScreenCaptureSource[]> {
	try {
		const sources = await desktopCapturer.getSources({
			types: ["window", "screen"],
			thumbnailSize: { width: 1, height: 1 },
			fetchWindowIcons: false,
		});

		return sources.map((source) => ({
			id: source.id,
			name: source.name,
			type: mapSourceType({ sourceId: source.id }),
			displayId: source.display_id,
			isCurrentWindow:
				Boolean(currentWindowSourceId) && source.id === currentWindowSourceId,
		}));
	} catch (error: unknown) {
		throw new Error(
			`Failed to list capture sources: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

export function getCurrentWindowSourceId({
	event,
}: {
	event: IpcMainInvokeEvent;
}): string | null {
	try {
		const browserWindow = BrowserWindow.fromWebContents(event.sender);
		if (!browserWindow) {
			return null;
		}
		return browserWindow.getMediaSourceId();
	} catch {
		return null;
	}
}

export function pickSource({
	sources,
	requestedSourceId,
	currentWindowSourceId,
}: {
	sources: ScreenCaptureSource[];
	requestedSourceId?: string;
	currentWindowSourceId: string | null;
}): ScreenCaptureSource {
	if (requestedSourceId) {
		const explicitSource = sources.find(
			(source) => source.id === requestedSourceId
		);
		if (explicitSource) {
			return explicitSource;
		}
		throw new Error(`Capture source not found: ${requestedSourceId}`);
	}

	if (currentWindowSourceId) {
		const currentWindowSource = sources.find(
			(source) => source.id === currentWindowSourceId
		);
		if (currentWindowSource) {
			return currentWindowSource;
		}
	}

	const preferredWindowSource = sources.find(
		(source) => source.type === SCREEN_SOURCE_TYPE.WINDOW
	);
	if (preferredWindowSource) {
		return preferredWindowSource;
	}

	const fallbackSource = sources[0];
	if (fallbackSource) {
		return fallbackSource;
	}

	throw new Error("No screen capture sources are available");
}

export async function waitForStreamOpen({
	fileStream,
}: {
	fileStream: fs.WriteStream;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const handleOpen = (): void => {
			cleanup();
			resolve();
		};
		const handleError = (error: Error): void => {
			cleanup();
			reject(error);
		};
		const cleanup = (): void => {
			fileStream.off("open", handleOpen);
			fileStream.off("error", handleError);
		};
		fileStream.once("open", handleOpen);
		fileStream.once("error", handleError);
	});
}

async function writeChunk({
	sessionData,
	chunk,
}: {
	sessionData: ActiveScreenRecordingSession;
	chunk: Uint8Array;
}): Promise<void> {
	const chunkBuffer = Buffer.from(chunk);
	await new Promise<void>((resolve, reject) => {
		sessionData.fileStream.write(chunkBuffer, (error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

export async function appendChunkToSession({
	sessionData,
	chunk,
}: {
	sessionData: ActiveScreenRecordingSession;
	chunk: Uint8Array;
}): Promise<number> {
	try {
		const queueHead = sessionData.writeQueue.catch(() => {
			// Keep queue usable even after prior append failure.
		});

		const writeTask = queueHead.then(async () => {
			await writeChunk({ sessionData, chunk });
			sessionData.bytesWritten += chunk.byteLength;
			if (chunk.byteLength > 0) {
				const writtenAt = Date.now();
				if (sessionData.firstChunkAt === null) {
					sessionData.firstChunkAt = writtenAt;
				}
				sessionData.lastChunkAt = writtenAt;
				sessionData.chunkCount += 1;
			}
		});

		sessionData.writeQueue = writeTask;
		await writeTask;
		return sessionData.bytesWritten;
	} catch (error: unknown) {
		throw new Error(
			`Failed to append session chunk: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

export async function closeStream({
	fileStream,
}: {
	fileStream: fs.WriteStream;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const handleError = (error: Error): void => {
			cleanup();
			reject(error);
		};
		const handleClose = (): void => {
			cleanup();
			resolve();
		};
		const cleanup = (): void => {
			fileStream.off("error", handleError);
			fileStream.off("close", handleClose);
		};

		fileStream.once("error", handleError);
		fileStream.once("close", handleClose);
		fileStream.end();
	});
}

export async function removeFileIfExists({
	filePath,
}: {
	filePath: string;
}): Promise<void> {
	try {
		await fs.promises.access(filePath, fs.constants.F_OK);
		await fs.promises.unlink(filePath);
	} catch {
		// nothing to do if file does not exist
	}
}

export async function moveFile({
	sourcePath,
	targetPath,
}: {
	sourcePath: string;
	targetPath: string;
}): Promise<void> {
	try {
		await fs.promises.rename(sourcePath, targetPath);
	} catch (error: unknown) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError?.code !== "EXDEV") {
			throw new Error(
				`Failed to move file: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		await fs.promises.copyFile(sourcePath, targetPath);
		await fs.promises.unlink(sourcePath);
	}
}

export async function getFileSize({
	filePath,
}: {
	filePath: string;
}): Promise<number> {
	try {
		const fileStats = await fs.promises.stat(filePath);
		return fileStats.size;
	} catch {
		return 0;
	}
}
