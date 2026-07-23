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
import {
	startAudioCapture,
	mergeAudioIntoStream,
	type AudioCaptureResult,
} from "@/lib/screen-recording/audio-capture";
import { waitForFirstRecordingChunk } from "@/lib/project/screen-recording-readiness";
import {
	normalizeScreenRecordingQualityPreset,
	resolveContainedCaptureRect,
	resolveScreenRecordingQuality,
	type ScreenRecordingQualityPreset,
} from "@/lib/project/screen-recording-quality";
import {
	normalizeScreenRecordingCaptureMode,
	type ScreenRecordingCaptureMode,
} from "@/lib/project/screen-recording-capture-mode";
import { useScreenRecordingPreferencesStore } from "@/stores/screen-recording-preferences-store";
import {
	usePreviewModeStore,
	type PreviewMode,
} from "@/stores/preview-mode-store";

const SCREEN_RECORDING_EVENT_NAME = "qcut:screen-recording-status";

const SCREEN_RECORDING_STATE = {
	IDLE: "idle",
	RECORDING: "recording",
} as const;

const DEFAULT_TIMESLICE_MS = 250;

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
	firstChunkAt: number | null;
	captureWidth: number;
	captureHeight: number;
	frameRate: number;
	videoBitsPerSecond: number;
	meetsFullHd: boolean;
	sourceWidth: number;
	sourceHeight: number;
	outputWidth: number;
	outputHeight: number;
	qualityPreset: ScreenRecordingQualityPreset;
	captureMode: ScreenRecordingCaptureMode;
	isUpscaled: boolean;
	previewRestoreState: PreviewCaptureRestoreState | null;
	audioCleanup: (() => void) | null;
	canvasCleanup: (() => void) | null;
}

interface PreviewCaptureRestoreState {
	previewMode: PreviewMode;
	isPreviewExpanded: boolean;
}

export interface ScreenRecordingCaptureOptions {
	captureMode?: string;
	qualityPreset?: string;
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
		captureWidth: activeRecording.captureWidth,
		captureHeight: activeRecording.captureHeight,
		frameRate: activeRecording.frameRate,
		videoBitsPerSecond: activeRecording.videoBitsPerSecond,
		meetsFullHd: activeRecording.meetsFullHd,
		sourceWidth: activeRecording.sourceWidth,
		sourceHeight: activeRecording.sourceHeight,
		outputWidth: activeRecording.outputWidth,
		outputHeight: activeRecording.outputHeight,
		qualityPreset: activeRecording.qualityPreset,
		captureMode: activeRecording.captureMode,
		isUpscaled: activeRecording.isUpscaled,
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

async function waitForPreviewCaptureSurface(): Promise<void> {
	const timeoutAt = Date.now() + 2500;
	while (Date.now() < timeoutAt) {
		if (document.querySelector('[data-testid="fullscreen-preview"]')) {
			await new Promise<void>((resolve) => {
				window.setTimeout(resolve, 150);
			});
			return;
		}
		await new Promise<void>((resolve) => {
			window.setTimeout(resolve, 50);
		});
	}
	throw new Error("Preview could not enter fullscreen before recording");
}

async function prepareCaptureSurface({
	captureMode,
}: {
	captureMode: ScreenRecordingCaptureMode;
}): Promise<PreviewCaptureRestoreState | null> {
	if (captureMode !== "preview") {
		return null;
	}

	const previewStore = usePreviewModeStore.getState();
	const restoreState: PreviewCaptureRestoreState = {
		previewMode: previewStore.previewMode,
		isPreviewExpanded: previewStore.isPreviewExpanded,
	};
	previewStore.setPreviewMode("video");
	previewStore.setPreviewExpanded({ expanded: true });
	try {
		await waitForPreviewCaptureSurface();
		return restoreState;
	} catch (error) {
		previewStore.setPreviewMode(restoreState.previewMode);
		previewStore.setPreviewExpanded({
			expanded: restoreState.isPreviewExpanded,
		});
		throw error;
	}
}

function restoreCaptureSurface({
	restoreState,
}: {
	restoreState: PreviewCaptureRestoreState | null;
}): void {
	if (!restoreState) {
		return;
	}

	const previewStore = usePreviewModeStore.getState();
	previewStore.setPreviewMode(restoreState.previewMode);
	previewStore.setPreviewExpanded({
		expanded: restoreState.isPreviewExpanded,
	});
}

async function getDisplayMediaStream(
	requestAudio: boolean
): Promise<MediaStream> {
	try {
		if (!navigator.mediaDevices?.getDisplayMedia) {
			throw new Error("getDisplayMedia is unavailable");
		}

		return await navigator.mediaDevices.getDisplayMedia({
			video: {
				frameRate: { ideal: 30, max: 30 },
			},
			audio: requestAudio,
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
	requestAudio = false,
}: {
	sourceId: string;
	requestAudio?: boolean;
}): Promise<MediaStream> {
	try {
		return await getDisplayMediaStream(requestAudio);
	} catch (displayMediaError) {
		console.warn(
			"[ScreenRecording] getDisplayMedia failed, falling back to getUserMedia:",
			displayMediaError
		);
	}

	return await getLegacyDesktopMediaStream({ sourceId });
}

/**
 * Pipe a getDisplayMedia stream through a canvas to produce a stream that
 * MediaRecorder can encode. Electron 40+ (Chromium 134) produces 0-byte blobs
 * when MediaRecorder is given a getDisplayMedia stream directly.
 */
function createCanvasStream({
	mediaStream,
	frameRate = 30,
	outputWidth,
	outputHeight,
}: {
	mediaStream: MediaStream;
	frameRate?: number;
	outputWidth?: number;
	outputHeight?: number;
}): {
	stream: MediaStream;
	cleanup: () => void;
} | null {
	try {
		const videoTrack = mediaStream.getVideoTracks()[0];
		if (!videoTrack) return null;

		const settings = videoTrack.getSettings();
		const sourceWidth = settings.width ?? 1920;
		const sourceHeight = settings.height ?? 1080;
		const width = outputWidth ?? sourceWidth;
		const height = outputHeight ?? sourceHeight;
		const captureRect = resolveContainedCaptureRect({
			sourceWidth,
			sourceHeight,
			outputWidth: width,
			outputHeight: height,
		});

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		const video = document.createElement("video");
		video.srcObject = mediaStream;
		video.muted = true;
		video.playsInline = true;
		video.play().catch(() => {});

		let rafId: number | null = null;
		const intervalMs = Math.round(1000 / frameRate);

		// Use captureStream(0) for manual frame control — we push frames
		// explicitly after each drawImage. captureStream(fps) relies on
		// "content changes" detection which misses setTimeout-driven draws.
		const canvasStream = canvas.captureStream(0);
		const canvasTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & {
			requestFrame?: () => void;
		};

		const drawFrame = (): void => {
			if (video.readyState >= video.HAVE_CURRENT_DATA) {
				ctx.fillStyle = "#000000";
				ctx.fillRect(0, 0, width, height);
				ctx.drawImage(
					video,
					captureRect.x,
					captureRect.y,
					captureRect.width,
					captureRect.height
				);
				canvasTrack?.requestFrame?.();
			}
			rafId = window.setTimeout(drawFrame, intervalMs) as unknown as number;
		};
		drawFrame();

		const cleanup = (): void => {
			if (rafId !== null) {
				clearTimeout(rafId);
				rafId = null;
			}
			video.pause();
			video.srcObject = null;
		};

		return { stream: canvasStream, cleanup };
	} catch (error) {
		console.warn("[ScreenRecording] Canvas stream proxy failed:", error);
		return null;
	}
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
	capture = {},
}: {
	options?: StartScreenRecordingOptions;
	capture?: ScreenRecordingCaptureOptions;
} = {}): Promise<StartScreenRecordingResult> {
	let startResult: StartScreenRecordingResult | null = null;
	let mediaStream: MediaStream | null = null;
	let audioResult: AudioCaptureResult | null = null;
	let canvasStream: ReturnType<typeof createCanvasStream> = null;
	let mediaRecorder: MediaRecorder | null = null;
	let runtimeState: ActiveRecordingRuntimeState | null = null;
	let previewRestoreState: PreviewCaptureRestoreState | null = null;

	try {
		if (activeRecording) {
			throw new Error("Screen recording is already active");
		}

		const recordingPreferences = useScreenRecordingPreferencesStore.getState();
		const captureMode = normalizeScreenRecordingCaptureMode({
			value: capture.captureMode ?? recordingPreferences.captureMode,
		});
		const qualityPreset = normalizeScreenRecordingQualityPreset({
			value: capture.qualityPreset ?? recordingPreferences.qualityPreset,
		});
		previewRestoreState = await prepareCaptureSurface({ captureMode });

		const recordingApi = getRequiredRecordingApi();
		const mimeType = selectMimeType();

		startResult = await recordingApi.start({
			...options,
			mimeType: options.mimeType ?? mimeType ?? undefined,
		});

		// Read audio config from store
		const enhancementStore = useScreenRecordingEnhancementStore.getState();
		const wantSystemAudio = enhancementStore.systemAudioEnabled;
		const wantMic = enhancementStore.micEnabled;

		mediaStream = await getCaptureStream({
			sourceId: startResult.sourceId,
			requestAudio: wantSystemAudio,
		});

		// Mix audio if mic or system audio is enabled
		let recordingStream: MediaStream = mediaStream;

		if (wantMic || wantSystemAudio) {
			try {
				audioResult = await startAudioCapture(
					{
						micEnabled: wantMic,
						systemAudioEnabled: wantSystemAudio,
						micDeviceId: enhancementStore.micDeviceId ?? undefined,
						micGainBoost: enhancementStore.micGain,
					},
					mediaStream
				);
				recordingStream = mergeAudioIntoStream(mediaStream, audioResult.stream);
			} catch (audioError) {
				console.warn(
					"[ScreenRecording] Audio capture failed, continuing without audio:",
					audioError
				);
			}
		}

		const captureSettings =
			mediaStream.getVideoTracks()[0]?.getSettings() ?? {};
		const recordingQuality = resolveScreenRecordingQuality({
			width: captureSettings.width,
			height: captureSettings.height,
			frameRate: captureSettings.frameRate,
			preset: qualityPreset,
		});

		// Electron 40+ (Chromium 134): MediaRecorder produces 0-byte blobs from
		// getDisplayMedia streams directly. Workaround: pipe video through a canvas
		// with captureStream(0) + manual requestFrame() calls.
		canvasStream = createCanvasStream({
			mediaStream: recordingStream,
			frameRate: recordingQuality.frameRate,
			outputWidth: recordingQuality.width,
			outputHeight: recordingQuality.height,
		});

		let streamForRecorder: MediaStream;
		if (canvasStream) {
			streamForRecorder = canvasStream.stream;
		} else {
			streamForRecorder = recordingStream;
		}

		const mediaRecorderOptions: MediaRecorderOptions = {
			videoBitsPerSecond: recordingQuality.videoBitsPerSecond,
		};
		if (!canvasStream) {
			const resolvedMimeType = options.mimeType ?? mimeType;
			if (resolvedMimeType) {
				mediaRecorderOptions.mimeType = resolvedMimeType;
			}
		}

		const recordingMediaRecorder = new MediaRecorder(
			streamForRecorder,
			mediaRecorderOptions
		);
		mediaRecorder = recordingMediaRecorder;

		const recordingRuntimeState: ActiveRecordingRuntimeState = {
			sessionId: startResult.sessionId,
			sourceId: startResult.sourceId,
			sourceName: startResult.sourceName,
			filePath: startResult.filePath,
			startedAt: startResult.startedAt,
			mimeType: startResult.mimeType,
			mediaRecorder: recordingMediaRecorder,
			mediaStream,
			chunkWriteQueue: Promise.resolve(),
			chunkWriteError: null,
			bytesWritten: 0,
			firstChunkAt: null,
			captureWidth: recordingQuality.width,
			captureHeight: recordingQuality.height,
			frameRate: recordingQuality.frameRate,
			videoBitsPerSecond: recordingQuality.videoBitsPerSecond,
			meetsFullHd: recordingQuality.meetsFullHd,
			sourceWidth: recordingQuality.sourceWidth,
			sourceHeight: recordingQuality.sourceHeight,
			outputWidth: recordingQuality.width,
			outputHeight: recordingQuality.height,
			qualityPreset,
			captureMode,
			isUpscaled: recordingQuality.isUpscaled,
			previewRestoreState,
			audioCleanup: audioResult?.cleanup ?? null,
			canvasCleanup: canvasStream?.cleanup ?? null,
		};
		runtimeState = recordingRuntimeState;

		recordingMediaRecorder.ondataavailable = (event: BlobEvent): void => {
			appendChunk({ recordingState: recordingRuntimeState, event });
		};

		recordingMediaRecorder.onerror = (event: Event): void => {
			console.error("[ScreenRecording] MediaRecorder runtime error:", event);
		};

		const captureStartedAt = Date.now();
		recordingMediaRecorder.start(DEFAULT_TIMESLICE_MS);
		activeRecording = recordingRuntimeState;
		emitStatusChange();

		const readiness = await waitForFirstRecordingChunk({
			getSnapshot: () => ({
				bytesWritten: recordingRuntimeState.bytesWritten,
				error: recordingRuntimeState.chunkWriteError,
				recorderState: recordingMediaRecorder.state,
			}),
		});
		recordingRuntimeState.firstChunkAt = readiness.readyAt;

		return {
			...startResult,
			firstChunkAt: readiness.readyAt,
			captureStartedAt,
			readyAt: readiness.readyAt,
			bytesWritten: readiness.bytesWritten,
			captureWidth: recordingQuality.width,
			captureHeight: recordingQuality.height,
			frameRate: recordingQuality.frameRate,
			videoBitsPerSecond: recordingQuality.videoBitsPerSecond,
			meetsFullHd: recordingQuality.meetsFullHd,
			sourceWidth: recordingQuality.sourceWidth,
			sourceHeight: recordingQuality.sourceHeight,
			outputWidth: recordingQuality.width,
			outputHeight: recordingQuality.height,
			qualityPreset,
			captureMode,
			isUpscaled: recordingQuality.isUpscaled,
		};
	} catch (error) {
		const startError = toError({ error });

		if (mediaRecorder && mediaRecorder.state !== "inactive") {
			try {
				await waitForRecorderStop({ mediaRecorder });
				await runtimeState?.chunkWriteQueue;
			} catch {
				// The main-process discard below remains the cleanup authority.
			}
		}
		if (canvasStream?.cleanup) {
			try {
				canvasStream.cleanup();
			} catch {
				// Ignore cleanup errors
			}
		}
		if (audioResult?.cleanup) {
			try {
				audioResult.cleanup();
			} catch {
				// Ignore cleanup errors
			}
		}
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
		restoreCaptureSurface({ restoreState: previewRestoreState });
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
				const sidecarApi = getRecordingApi();
				const telemetry = await sidecarApi?.getCursorTelemetry?.(
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
		if (recordingState.canvasCleanup) {
			try {
				recordingState.canvasCleanup();
			} catch {
				// Ignore canvas cleanup errors
			}
		}
		if (recordingState.audioCleanup) {
			try {
				recordingState.audioCleanup();
			} catch {
				// Ignore audio cleanup errors
			}
		}
		stopMediaTracks({ mediaStream: recordingState.mediaStream });
		restoreCaptureSurface({
			restoreState: recordingState.previewRestoreState,
		});
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
		const remoteStatus = await recordingApi.getStatus();
		const localStatus = getLocalStatus();
		if (!localStatus.recording) {
			return remoteStatus;
		}
		return {
			...remoteStatus,
			...localStatus,
			bytesWritten: Math.max(
				remoteStatus.bytesWritten,
				localStatus.bytesWritten
			),
		};
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
