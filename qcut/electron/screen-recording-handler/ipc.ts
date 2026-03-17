import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import type {
	ScreenCaptureSource,
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	AppendScreenRecordingChunkOptions,
	AppendScreenRecordingChunkResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
	ForceStopScreenRecordingResult,
	ScreenRecordingStatus,
} from "./types.js";
import { resolveOutputPath, resolveOutputFormat } from "./path-utils.js";
import {
	buildCaptureFilePath,
	ensureParentDirectory,
	listCaptureSources,
	getCurrentWindowSourceId,
	pickSource,
	waitForStreamOpen,
	appendChunkToSession,
	closeStream,
	removeFileIfExists,
	getFileSize,
} from "./file-ops.js";
import { finalizeRecordingOutput, cleanupSessionFiles } from "./transcoder.js";
import {
	getActiveSession,
	setActiveSession,
	ensureDisplayMediaHandlerConfigured,
	buildStatus,
} from "./session.js";
import { CursorTelemetryRecorder, getCaptureRect } from "./cursor-telemetry.js";
import {
	writeCursorTelemetry,
	readCursorTelemetry,
} from "./cursor-telemetry-io.js";

const cursorRecorder = new CursorTelemetryRecorder();

async function discardActiveSession({
	sessionData,
}: {
	sessionData: NonNullable<ReturnType<typeof getActiveSession>>;
}): Promise<{
	filePath: string;
	bytesWritten: number;
	durationMs: number;
}> {
	try {
		const durationMs = Math.max(0, Date.now() - sessionData.startedAt);
		await sessionData.writeQueue;
		await closeStream({ fileStream: sessionData.fileStream });
		await cleanupSessionFiles({ sessionData });
		return {
			filePath: sessionData.filePath,
			bytesWritten: sessionData.bytesWritten,
			durationMs,
		};
	} catch (error: unknown) {
		throw new Error(
			`Failed to discard active screen recording session: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

export async function forceStopActiveScreenRecordingSession(): Promise<ForceStopScreenRecordingResult> {
	// Stop cursor telemetry before any file I/O
	let cursorTelemetryData = null;
	if (cursorRecorder.isRecording()) {
		cursorTelemetryData = cursorRecorder.stop();
	}

	const sessionToStop = getActiveSession();
	if (!sessionToStop) {
		return {
			success: true,
			wasRecording: false,
		};
	}

	// Clear session immediately to reject incoming chunks
	setActiveSession(null);

	const durationMs = Math.max(0, Date.now() - sessionToStop.startedAt);

	try {
		// Destroy the stream immediately — don't use end() which waits for
		// pending writes and hangs if the renderer is still sending chunks
		sessionToStop.fileStream.destroy();
		// Transcode whatever was written so far
		const finalPath = await finalizeRecordingOutput({
			sessionData: sessionToStop,
		});

		// Write cursor telemetry sidecar if available
		if (cursorTelemetryData && finalPath) {
			try {
				await writeCursorTelemetry(finalPath, cursorTelemetryData);
			} catch {
				// Sidecar write failure is non-fatal
			}
		}

		return {
			success: true,
			wasRecording: true,
			filePath: sessionToStop.filePath,
			bytesWritten: sessionToStop.bytesWritten,
			durationMs,
			discarded: false,
		};
	} catch {
		// Finalization failed — clean up temp files
		try {
			await cleanupSessionFiles({ sessionData: sessionToStop });
		} catch {
			// best-effort cleanup
		}
		return {
			success: true,
			wasRecording: true,
			filePath: sessionToStop.filePath,
			bytesWritten: sessionToStop.bytesWritten,
			durationMs,
			discarded: true,
		};
	}
}

export function setupScreenRecordingIPC(): void {
	ensureDisplayMediaHandlerConfigured();

	ipcMain.handle(
		"screen:getSources",
		async (event: IpcMainInvokeEvent): Promise<ScreenCaptureSource[]> => {
			try {
				const currentWindowSourceId = getCurrentWindowSourceId({ event });
				return await listCaptureSources({ currentWindowSourceId });
			} catch (error: unknown) {
				throw new Error(
					`Failed to fetch screen sources: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	);

	ipcMain.handle(
		"screen:startRecording",
		async (
			event: IpcMainInvokeEvent,
			options: StartScreenRecordingOptions = {}
		): Promise<StartScreenRecordingResult> => {
			let pendingStream: fs.WriteStream | null = null;
			let pendingOutputPath: string | null = null;
			let pendingCapturePath: string | null = null;
			let createdSession = false;

			try {
				if (getActiveSession()) {
					throw new Error("Screen recording is already active");
				}

				const currentWindowSourceId = getCurrentWindowSourceId({ event });
				const sources = await listCaptureSources({ currentWindowSourceId });
				const selectedSource = pickSource({
					sources,
					requestedSourceId: options.sourceId,
					currentWindowSourceId,
				});

				const sessionId = randomUUID();
				const outputPath = resolveOutputPath({
					filePath: options.filePath,
					fileName: options.fileName,
				});
				const outputFormat = resolveOutputFormat({ filePath: outputPath });
				const captureFilePath = buildCaptureFilePath({
					outputPath,
					sessionId,
					outputFormat,
				});

				pendingOutputPath = outputPath;
				pendingCapturePath = captureFilePath;

				await ensureParentDirectory({ filePath: captureFilePath });

				const fileStream = fs.createWriteStream(captureFilePath, {
					flags: "w",
				});
				pendingStream = fileStream;
				await waitForStreamOpen({ fileStream });

				const startedAt = Date.now();
				setActiveSession({
					sessionId,
					sourceId: selectedSource.id,
					sourceName: selectedSource.name,
					filePath: outputPath,
					captureFilePath,
					outputFormat,
					startedAt,
					bytesWritten: 0,
					ownerWebContentsId: event.sender.id,
					fileStream,
					mimeType: options.mimeType ?? null,
					writeQueue: Promise.resolve(),
				});
				createdSession = true;

				// Start cursor telemetry capture
				const captureRect = getCaptureRect(selectedSource.id);
				cursorRecorder.start(captureRect);

				return {
					sessionId,
					sourceId: selectedSource.id,
					sourceName: selectedSource.name,
					filePath: outputPath,
					startedAt,
					mimeType: options.mimeType ?? null,
				};
			} catch (error: unknown) {
				const currentSession = getActiveSession();
				if (createdSession && currentSession?.fileStream) {
					try {
						await closeStream({ fileStream: currentSession.fileStream });
					} catch {
						// best-effort stream cleanup
					}
				}

				if (
					pendingStream &&
					!pendingStream.closed &&
					!pendingStream.destroyed
				) {
					try {
						pendingStream.destroy();
					} catch {
						// best-effort stream cleanup
					}
				}

				if (createdSession && currentSession) {
					setActiveSession(null);
					await cleanupSessionFiles({ sessionData: currentSession });
				}

				if (pendingCapturePath) {
					await removeFileIfExists({ filePath: pendingCapturePath });
				}
				if (pendingOutputPath && pendingOutputPath !== pendingCapturePath) {
					await removeFileIfExists({ filePath: pendingOutputPath });
				}
				throw new Error(
					`Failed to start screen recording: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	);

	ipcMain.handle(
		"screen:appendChunk",
		async (
			event: IpcMainInvokeEvent,
			options: AppendScreenRecordingChunkOptions
		): Promise<AppendScreenRecordingChunkResult> => {
			try {
				const session = getActiveSession();
				if (!session) {
					throw new Error("No active screen recording session");
				}

				if (event.sender.id !== session.ownerWebContentsId) {
					throw new Error("Screen recording session owner mismatch");
				}

				if (options.sessionId !== session.sessionId) {
					throw new Error("Invalid screen recording session id");
				}

				const bytesWritten = await appendChunkToSession({
					sessionData: session,
					chunk: options.chunk,
				});

				return { bytesWritten };
			} catch (error: unknown) {
				throw new Error(
					`Failed to append recording chunk: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	);

	ipcMain.handle(
		"screen:stopRecording",
		async (
			event: IpcMainInvokeEvent,
			options: StopScreenRecordingOptions = {}
		): Promise<StopScreenRecordingResult> => {
			const sessionToStop = getActiveSession();
			if (!sessionToStop) {
				return {
					success: false,
					filePath: null,
					bytesWritten: 0,
					durationMs: 0,
					discarded: false,
					error: "No active screen recording session",
				};
			}

			try {
				if (event.sender.id !== sessionToStop.ownerWebContentsId) {
					throw new Error("Screen recording session owner mismatch");
				}

				if (
					options.sessionId &&
					options.sessionId !== sessionToStop.sessionId
				) {
					throw new Error("Invalid screen recording session id");
				}
				const shouldDiscard = options.discard ?? false;
				const durationMs = Math.max(0, Date.now() - sessionToStop.startedAt);

				// Stop cursor telemetry before draining file I/O
				let cursorTelemetryData = null;
				if (cursorRecorder.isRecording()) {
					cursorTelemetryData = cursorRecorder.stop();
				}

				await sessionToStop.writeQueue;
				await closeStream({ fileStream: sessionToStop.fileStream });

				let finalPath: string | null = sessionToStop.filePath;
				let finalizedBytes = sessionToStop.bytesWritten;
				if (shouldDiscard) {
					await cleanupSessionFiles({ sessionData: sessionToStop });
					finalPath = null;
				} else {
					finalPath = await finalizeRecordingOutput({
						sessionData: sessionToStop,
					});
					finalizedBytes = await getFileSize({ filePath: finalPath });

					// Write cursor telemetry sidecar alongside the video
					if (cursorTelemetryData && finalPath) {
						try {
							await writeCursorTelemetry(finalPath, cursorTelemetryData);
						} catch {
							// Sidecar write failure is non-fatal
						}
					}
				}

				setActiveSession(null);
				return {
					success: true,
					filePath: finalPath,
					bytesWritten: finalizedBytes || sessionToStop.bytesWritten,
					durationMs,
					discarded: shouldDiscard,
				};
			} catch (error: unknown) {
				const sessionToCleanup = getActiveSession();
				const isOwner =
					sessionToCleanup?.ownerWebContentsId === event.sender.id;

				if (isOwner && sessionToCleanup) {
					setActiveSession(null);
					try {
						await closeStream({ fileStream: sessionToCleanup.fileStream });
					} catch {
						// best-effort stream cleanup
					}
					await cleanupSessionFiles({ sessionData: sessionToCleanup });
				}

				throw new Error(
					`Failed to stop screen recording: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	);

	ipcMain.handle(
		"screen:forceStopRecording",
		async (): Promise<ForceStopScreenRecordingResult> => {
			return await forceStopActiveScreenRecordingSession();
		}
	);

	ipcMain.handle("screen:getStatus", (): ScreenRecordingStatus => {
		try {
			return buildStatus();
		} catch (error: unknown) {
			throw new Error(
				`Failed to fetch screen recording status: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	});

	ipcMain.handle(
		"screen:getCursorTelemetry",
		async (_event: IpcMainInvokeEvent, videoPath: string) => {
			return await readCursorTelemetry(videoPath);
		}
	);
}
