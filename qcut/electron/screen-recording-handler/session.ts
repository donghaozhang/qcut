import { desktopCapturer, session } from "electron";
import {
	SCREEN_RECORDING_STATE,
	type ActiveScreenRecordingSession,
	type ScreenRecordingStatus,
} from "./types.js";
import { log } from "./logger.js";

let activeSession: ActiveScreenRecordingSession | null = null;
let isDisplayMediaHandlerConfigured = false;

/**
 * Pre-resolved DesktopCapturerSource for the display media handler.
 * Stored before getDisplayMedia is called so the handler can respond
 * synchronously — async callbacks in setDisplayMediaRequestHandler
 * cause MediaRecorder to not receive frames in Electron 33+.
 */
let pendingCaptureSource: Electron.DesktopCapturerSource | null = null;

export function getActiveSession(): ActiveScreenRecordingSession | null {
	return activeSession;
}

export function setActiveSession(
	value: ActiveScreenRecordingSession | null
): void {
	activeSession = value;
}

export function setPendingCaptureSource(
	source: Electron.DesktopCapturerSource | null
): void {
	pendingCaptureSource = source;
}

export function setDisplayMediaHandlerConfigured(value: boolean): void {
	isDisplayMediaHandlerConfigured = value;
}

export function buildStatus(): ScreenRecordingStatus {
	if (!activeSession) {
		return {
			state: SCREEN_RECORDING_STATE.IDLE,
			recording: false,
			sessionId: null,
			sourceId: null,
			sourceName: null,
			filePath: null,
			bytesWritten: 0,
			startedAt: null,
			durationMs: 0,
			mimeType: null,
		};
	}

	const durationMs = Math.max(0, Date.now() - activeSession.startedAt);
	return {
		state: SCREEN_RECORDING_STATE.RECORDING,
		recording: true,
		sessionId: activeSession.sessionId,
		sourceId: activeSession.sourceId,
		sourceName: activeSession.sourceName,
		filePath: activeSession.filePath,
		bytesWritten: activeSession.bytesWritten,
		startedAt: activeSession.startedAt,
		durationMs,
		mimeType: activeSession.mimeType,
	};
}

export function ensureDisplayMediaHandlerConfigured(): void {
	if (isDisplayMediaHandlerConfigured) {
		return;
	}

	try {
		session.defaultSession.setDisplayMediaRequestHandler(
			(_request, callback) => {
				// Use pre-resolved source synchronously.
				// Calling the callback asynchronously (after await) causes
				// MediaRecorder to not receive frame data in Electron 33+.
				if (pendingCaptureSource) {
					const source = pendingCaptureSource;
					pendingCaptureSource = null;
					console.log(
						`[ScreenRecordingIPC] Display media handler: using pre-resolved source ${source.id} (sync)`
					);
					callback({ video: source });
					return;
				}

				// Fallback: check active session source synchronously
				if (!activeSession) {
					callback({});
					return;
				}

				log.warn(
					"[ScreenRecordingIPC] No pending capture source — falling back to async resolve"
				);

				// Async fallback (may not produce frames — kept for safety)
				desktopCapturer
					.getSources({
						types: ["window", "screen"],
						thumbnailSize: { width: 1, height: 1 },
						fetchWindowIcons: false,
					})
					.then((sources) => {
						const source = sources.find(
							(s) => s.id === activeSession?.sourceId
						);
						callback(source ? { video: source } : {});
					})
					.catch(() => {
						callback({});
					});
			},
			{ useSystemPicker: false }
		);

		isDisplayMediaHandlerConfigured = true;
	} catch (error) {
		log.error(
			"[ScreenRecordingIPC] Failed to configure display media handler:",
			error
		);
	}
}
