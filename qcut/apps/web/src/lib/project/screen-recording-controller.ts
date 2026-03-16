import type {
	ScreenRecordingStatus,
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
} from "@/types/electron";
import { platform } from "@qcut/platform-core";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { analyzeForZoomSuggestions } from "@/lib/screen-recording/auto-zoom-analyzer";

const SCREEN_RECORDING_EVENT_NAME = "qcut:screen-recording-status";

const SCREEN_RECORDING_STATE = {
	IDLE: "idle",
	RECORDING: "recording",
} as const;

const DEFAULT_TIMESLICE_MS = 1000;

/** Target bitrate for screen capture MediaRecorder (5 Mbps — good for screen content). */
const SCREEN_CAPTURE_BITRATE = 5_000_000;

const MIME_TYPE_CANDIDATES = [
	"video/webm;codecs=vp9,opus",
	"video/webm;codecs=vp8,opus",
	"video/webm",
] as const;

interface LegacyDesktopCaptureMandatory {
	chromeMediaSource: "desktop";
	chromeMediaSourceId: string;
	maxFrameRate: number;
}

interface LegacyDesktopVideoConstraints extends MediaTrackConstraints {
	mandatory: LegacyDesktopCaptureMandatory;
}

interface ActiveRecordingRuntimeState {
	sessionId: string;
	sourceId: string;
	sourceName: string;
	filePath: string;
	startedAt: number;
	mimeType: string | null;
	mediaRecorder: MediaRecorder;
	mediaStream: MediaStream;
	chunkWriteQueue: Promise<void>;
	chunkWriteError: Error | null;
	bytesWritten: number;
}

interface ScreenRecordingStatusEventPayload {
	status: ScreenRecordingStatus;
}

type StatusListener = (status: ScreenRecordingStatus) => void;

let activeRecording: ActiveRecordingRuntimeState | null = null;
let isStopInProgress = false;

function getIdleStatus(): ScreenRecordingStatus {
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

/**
 * Normalize an unknown value into an Error instance.
 *
 * If `error` is already an `Error`, it is returned unchanged; otherwise a new `Error` is created from the value's string representation.
 *
 * @param error - Value to convert into an Error
 * @returns An `Error` instance representing `error`
 */
function toError({ error }: { error: unknown }): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(typeof error === "string" ? error : String(error));
}

/**
 * Accesses the platform-provided screen recording API.
 *
 * @returns The platform's `screenRecording` API object if available, otherwise `undefined`.
 */
function getRecordingApi() {
	return platform().screenRecording;
}

/**
 * Retrieve the platform screen recording API, throwing if it is not available.
 *
 * @returns The screen recording API implementation exposed by the platform.
 * @throws An Error if the screen recording API is not available in the current environment.
 */
function getRequiredRecordingApi() {
	const recordingApi = getRecordingApi();
	if (!recordingApi) {
		throw new Error("Screen recording API is unavailable in this environment");
	}
	return recordingApi;
}

function getLocalStatus(): ScreenRecordingStatus {
	if (!activeRecording) {
		return getIdleStatus();
	}

	return {
		state: SCREEN_RECORDING_STATE.RECORDING,
		recording: true,
		sessionId: activeRecording.sessionId,
		sourceId: activeRecording.sourceId,
		sourceName: activeRecording.sourceName,
		filePath: activeRecording.filePath,
		bytesWritten: activeRecording.bytesWritten,
		startedAt: activeRecording.startedAt,
		durationMs: Math.max(0, Date.now() - activeRecording.startedAt),
		mimeType: activeRecording.mimeType,
	};
}

function emitStatusChange(): void {
	try {
		if (typeof window === "undefined") {
			return;
		}

		const status = getLocalStatus();
		const eventPayload: ScreenRecordingStatusEventPayload = { status };
		window.dispatchEvent(
			new CustomEvent<ScreenRecordingStatusEventPayload>(
				SCREEN_RECORDING_EVENT_NAME,
				{ detail: eventPayload }
			)
		);
	} catch (error) {
		console.error("[ScreenRecording] Failed to emit status event:", error);
	}
}

function selectMimeType(): string | null {
	try {
		for (const mimeType of MIME_TYPE_CANDIDATES) {
			if (MediaRecorder.isTypeSupported(mimeType)) {
				return mimeType;
			}
		}
		return null;
	} catch {
		return null;
	}
}

async function getDisplayMediaStream(): Promise<MediaStream> {
	try {
		if (!navigator.mediaDevices?.getDisplayMedia) {
			throw new Error("getDisplayMedia is unavailable");
		}

		return await navigator.mediaDevices.getDisplayMedia({
			video: {
				frameRate: { ideal: 30, max: 30 },
			},
			audio: false,
		});
	} catch (error) {
		throw new Error(
			`Failed to capture display media: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

async function getLegacyDesktopMediaStream({
	sourceId,
}: {
	sourceId: string;
}): Promise<MediaStream> {
	try {
		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error("getUserMedia is unavailable");
		}

		const legacyVideoConstraints: LegacyDesktopVideoConstraints = {
			mandatory: {
				chromeMediaSource: "desktop",
				chromeMediaSourceId: sourceId,
				maxFrameRate: 30,
			},
		};

		return await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: legacyVideoConstraints as unknown as MediaTrackConstraints,
		});
	} catch (error) {
		throw new Error(
			`Failed to capture legacy desktop media: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

async function getCaptureStream({
	sourceId,
}: {
	sourceId: string;
}): Promise<MediaStream> {
	try {
		return await getDisplayMediaStream();
	} catch (displayMediaError) {
		console.warn(
			"[ScreenRecording] getDisplayMedia failed, falling back to getUserMedia:",
			displayMediaError
		);
	}

	return await getLegacyDesktopMediaStream({ sourceId });
}

function stopMediaTracks({ mediaStream }: { mediaStream: MediaStream }): void {
	try {
		for (const track of mediaStream.getTracks()) {
			track.stop();
		}
	} catch (error) {
		console.error("[ScreenRecording] Failed to stop media tracks:", error);
	}
}

/** MediaRecorder.stop() emits synchronously — 10s is generous. */
const RECORDER_STOP_TIMEOUT_MS = 10_000;

async function waitForRecorderStop({
	mediaRecorder,
}: {
	mediaRecorder: MediaRecorder;
}): Promise<void> {
	try {
		if (mediaRecorder.state === "inactive") {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				console.warn(
					"[ScreenRecording] MediaRecorder stop timed out after",
					RECORDER_STOP_TIMEOUT_MS,
					"ms, forcing inactive"
				);
				resolve();
			}, RECORDER_STOP_TIMEOUT_MS);

			const handleStop = (): void => {
				cleanup();
				resolve();
			};
			const handleError = (event: Event): void => {
				cleanup();
				reject(new Error(`MediaRecorder error: ${event.type}`));
			};
			const cleanup = (): void => {
				clearTimeout(timer);
				mediaRecorder.removeEventListener("stop", handleStop);
				mediaRecorder.removeEventListener("error", handleError);
			};

			mediaRecorder.addEventListener("stop", handleStop);
			mediaRecorder.addEventListener("error", handleError);
			mediaRecorder.stop();
		});
	} catch (error) {
		throw new Error(
			`Failed to stop MediaRecorder: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function appendChunk({
	recordingState,
	event,
}: {
	recordingState: ActiveRecordingRuntimeState;
	event: BlobEvent;
}): void {
	try {
		// Queue assignment must happen synchronously so stop waits the final chunk.
		const nextChunkWrite = recordingState.chunkWriteQueue
			.catch(() => {
				// keep queue chain alive; chunkWriteError is checked during stop
			})
			.then(async () => {
				try {
					if (!event.data || event.data.size === 0) {
						return;
					}

					const recordingApi = getRequiredRecordingApi();
					const chunkArrayBuffer = await event.data.arrayBuffer();
					const chunkBytes = new Uint8Array(chunkArrayBuffer);
					const appendResult = await recordingApi.appendChunk({
						sessionId: recordingState.sessionId,
						chunk: chunkBytes,
					});
					recordingState.bytesWritten = appendResult.bytesWritten;
				} catch (error) {
					const chunkError = toError({ error });
					recordingState.chunkWriteError = chunkError;
				}
			});

		recordingState.chunkWriteQueue = nextChunkWrite;
	} catch (error) {
		const chunkError = toError({ error });
		recordingState.chunkWriteError = chunkError;
		console.error("[ScreenRecording] Failed to enqueue chunk:", chunkError);
	}
}

export async function startScreenRecording({
	options = {},
}: {
	options?: StartScreenRecordingOptions;
} = {}): Promise<StartScreenRecordingResult> {
	let startResult: StartScreenRecordingResult | null = null;
	let mediaStream: MediaStream | null = null;

	try {
		if (activeRecording) {
			throw new Error("Screen recording is already active");
		}

		const recordingApi = getRequiredRecordingApi();
		const mimeType = selectMimeType();

		startResult = await recordingApi.start({
			...options,
			mimeType: options.mimeType ?? mimeType ?? undefined,
		});

		mediaStream = await getCaptureStream({ sourceId: startResult.sourceId });

		const recorderOptions: MediaRecorderOptions = {
			videoBitsPerSecond: SCREEN_CAPTURE_BITRATE,
		};
		const resolvedMimeType = options.mimeType ?? mimeType;
		if (resolvedMimeType) {
			recorderOptions.mimeType = resolvedMimeType;
		}

		const mediaRecorder = new MediaRecorder(mediaStream, recorderOptions);

		const runtimeState: ActiveRecordingRuntimeState = {
			sessionId: startResult.sessionId,
			sourceId: startResult.sourceId,
			sourceName: startResult.sourceName,
			filePath: startResult.filePath,
			startedAt: startResult.startedAt,
			mimeType: startResult.mimeType,
			mediaRecorder,
			mediaStream,
			chunkWriteQueue: Promise.resolve(),
			chunkWriteError: null,
			bytesWritten: 0,
		};

		mediaRecorder.ondataavailable = (event: BlobEvent): void => {
			appendChunk({ recordingState: runtimeState, event });
		};

		mediaRecorder.onerror = (event: Event): void => {
			console.error("[ScreenRecording] MediaRecorder runtime error:", event);
		};

		mediaRecorder.start(DEFAULT_TIMESLICE_MS);
		activeRecording = runtimeState;
		emitStatusChange();

		return startResult;
	} catch (error) {
		const startError = toError({ error });

		if (mediaStream) {
			stopMediaTracks({ mediaStream });
		}

		if (startResult?.sessionId) {
			try {
				const recordingApi = getRequiredRecordingApi();
				await recordingApi.stop({
					sessionId: startResult.sessionId,
					discard: true,
				});
			} catch (cleanupError) {
				console.error(
					"[ScreenRecording] Failed to cleanup partial session:",
					cleanupError
				);
			}
		}

		activeRecording = null;
		emitStatusChange();
		throw new Error(`Failed to start screen recording: ${startError.message}`);
	}
}

export async function stopScreenRecording({
	options = {},
}: {
	options?: StopScreenRecordingOptions;
} = {}): Promise<StopScreenRecordingResult> {
	if (!activeRecording) {
		try {
			const recordingApi = getRecordingApi();
			if (!recordingApi) {
				return {
					success: true,
					filePath: null,
					bytesWritten: 0,
					durationMs: 0,
					discarded: true,
				};
			}

			const remoteStatus = await recordingApi.getStatus();
			if (!remoteStatus.recording) {
				return {
					success: true,
					filePath: null,
					bytesWritten: 0,
					durationMs: 0,
					discarded: true,
				};
			}

			return await recordingApi.stop({
				discard: options.discard,
			});
		} catch (error) {
			const stopError = toError({ error });
			throw new Error(
				`Failed to stop screen recording without local runtime state: ${stopError.message}`
			);
		}
	}

	if (isStopInProgress) {
		throw new Error("Screen recording stop is already in progress");
	}

	const recordingState = activeRecording;
	isStopInProgress = true;

	try {
		const recordingApi = getRequiredRecordingApi();

		await waitForRecorderStop({ mediaRecorder: recordingState.mediaRecorder });

		try {
			await recordingState.chunkWriteQueue;
		} catch {
			// chunkWriteError is handled below
		}

		const shouldDiscard = Boolean(
			options.discard || recordingState.chunkWriteError
		);

		const stopResult = await recordingApi.stop({
			sessionId: recordingState.sessionId,
			discard: shouldDiscard,
		});

		if (recordingState.chunkWriteError) {
			throw recordingState.chunkWriteError;
		}

		// Load cursor telemetry sidecar after successful stop
		const store = useScreenRecordingEnhancementStore.getState();
		// Clear previous telemetry before loading new data
		store.setCursorTelemetry(null);
		store.setZoomRegions([]);
		if (stopResult.filePath) {
			try {
				const recordingApi = getRecordingApi();
				const telemetry = await recordingApi?.getCursorTelemetry?.(
					stopResult.filePath
				);
				if (telemetry) {
					store.setCursorTelemetry(telemetry);

					// Auto-generate zoom suggestions from telemetry
					const suggestions = analyzeForZoomSuggestions(
						telemetry,
						store.autoZoomConfig
					);
					store.setZoomRegions(suggestions);
				}
			} catch {
				// Non-fatal: enhancements work without telemetry
			}
		}

		return stopResult;
	} catch (error) {
		const stopError = toError({ error });
		try {
			const recordingApi = getRequiredRecordingApi();
			await recordingApi.stop({
				sessionId: recordingState.sessionId,
				discard: true,
			});
		} catch (cleanupError) {
			console.error(
				"[ScreenRecording] Failed to cleanup after stop error:",
				cleanupError
			);
		}
		throw new Error(`Failed to stop screen recording: ${stopError.message}`);
	} finally {
		stopMediaTracks({ mediaStream: recordingState.mediaStream });
		activeRecording = null;
		isStopInProgress = false;
		emitStatusChange();
	}
}

export async function getScreenRecordingStatus(): Promise<ScreenRecordingStatus> {
	try {
		const recordingApi = getRecordingApi();
		if (!recordingApi) {
			return getLocalStatus();
		}
		return await recordingApi.getStatus();
	} catch (error) {
		console.error("[ScreenRecording] Failed to fetch recording status:", error);
		return getLocalStatus();
	}
}

export function getCachedScreenRecordingStatus(): ScreenRecordingStatus {
	try {
		return getLocalStatus();
	} catch {
		return getIdleStatus();
	}
}

export function subscribeToScreenRecordingStatus({
	listener,
}: {
	listener: StatusListener;
}): () => void {
	const handleStatusEvent = (event: Event): void => {
		try {
			const customEvent =
				event as CustomEvent<ScreenRecordingStatusEventPayload>;
			const nextStatus = customEvent.detail?.status ?? getLocalStatus();
			listener(nextStatus);
		} catch (error) {
			console.error("[ScreenRecording] Failed to handle status event:", error);
		}
	};

	try {
		window.addEventListener(SCREEN_RECORDING_EVENT_NAME, handleStatusEvent);
	} catch (error) {
		console.error(
			"[ScreenRecording] Failed to subscribe to status events:",
			error
		);
	}

	return () => {
		try {
			window.removeEventListener(
				SCREEN_RECORDING_EVENT_NAME,
				handleStatusEvent
			);
		} catch (error) {
			console.error(
				"[ScreenRecording] Failed to unsubscribe status events:",
				error
			);
		}
	};
}

export function registerScreenRecordingE2EBridge(): void {
	try {
		if (typeof window === "undefined") {
			return;
		}

		window.qcutScreenRecording = {
			start: async (options?: StartScreenRecordingOptions) =>
				await startScreenRecording({ options }),
			stop: async (options?: StopScreenRecordingOptions) =>
				await stopScreenRecording({ options }),
			status: async () => await getScreenRecordingStatus(),
		};
	} catch (error) {
		console.error("[ScreenRecording] Failed to register E2E bridge:", error);
	}
}
