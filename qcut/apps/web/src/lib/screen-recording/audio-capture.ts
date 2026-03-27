/**
 * Audio capture service for screen recording.
 * Captures microphone and/or system audio, mixes them into a single stream.
 *
 * Uses browser APIs (getUserMedia, AudioContext) as a cross-platform baseline.
 * Native backends (ScreenCaptureKit, WASAPI) can be added later for higher quality.
 */

export interface AudioCaptureConfig {
	micEnabled: boolean;
	systemAudioEnabled: boolean;
	micDeviceId?: string;
	/** Gain boost for microphone to balance with system audio (default 1.4) */
	micGainBoost?: number;
}

export interface AudioCaptureResult {
	/** Mixed audio stream (mic + system) ready for MediaRecorder */
	stream: MediaStream;
	/** Call to stop all tracks and disconnect audio nodes */
	cleanup: () => void;
}

/** Default mic gain boost (from Recordly's browser fallback) */
const DEFAULT_MIC_GAIN_BOOST = 1.4;

/**
 * Start audio capture with optional microphone and system audio.
 *
 * System audio comes from the display media stream (the `audio: true` constraint
 * in `getDisplayMedia`). The caller should pass the display stream's audio tracks
 * here if system audio is enabled.
 *
 * @param config - Audio capture configuration
 * @param displayStream - Optional display media stream containing system audio tracks
 * @returns Mixed audio stream and cleanup function
 */
export async function startAudioCapture(
	config: AudioCaptureConfig,
	displayStream?: MediaStream,
): Promise<AudioCaptureResult> {
	const cleanupFns: (() => void)[] = [];
	const audioContext = new AudioContext();
	const destination = audioContext.createMediaStreamDestination();

	cleanupFns.push(() => {
		audioContext.close().catch(() => {});
	});

	// Microphone capture
	if (config.micEnabled) {
		const micConstraints: MediaStreamConstraints = {
			audio: config.micDeviceId
				? { deviceId: { exact: config.micDeviceId } }
				: true,
		};

		const micStream = await navigator.mediaDevices.getUserMedia(
			micConstraints,
		);
		cleanupFns.push(() => {
			for (const track of micStream.getTracks()) track.stop();
		});

		const micSource = audioContext.createMediaStreamSource(micStream);
		const micGain = audioContext.createGain();
		micGain.gain.value = config.micGainBoost ?? DEFAULT_MIC_GAIN_BOOST;

		micSource.connect(micGain);
		micGain.connect(destination);

		cleanupFns.push(() => {
			micSource.disconnect();
			micGain.disconnect();
		});
	}

	// System audio capture (from display stream)
	if (config.systemAudioEnabled && displayStream) {
		const audioTracks = displayStream.getAudioTracks();
		if (audioTracks.length > 0) {
			const systemStream = new MediaStream(audioTracks);
			const systemSource =
				audioContext.createMediaStreamSource(systemStream);
			systemSource.connect(destination);

			cleanupFns.push(() => {
				systemSource.disconnect();
			});
		}
	}

	const cleanup = () => {
		// Run in reverse order
		for (let i = cleanupFns.length - 1; i >= 0; i--) {
			try {
				cleanupFns[i]();
			} catch {
				// Ignore cleanup errors
			}
		}
	};

	return {
		stream: destination.stream,
		cleanup,
	};
}

/**
 * Enumerate available audio input devices.
 */
export async function getAudioInputDevices(): Promise<
	{ deviceId: string; label: string }[]
> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices
		.filter((d) => d.kind === "audioinput")
		.map((d) => ({
			deviceId: d.deviceId,
			label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
		}));
}

/**
 * Merge an audio stream into a video-only MediaStream.
 * Returns a new stream with both video and audio tracks.
 */
export function mergeAudioIntoStream(
	videoStream: MediaStream,
	audioStream: MediaStream,
): MediaStream {
	const merged = new MediaStream();

	for (const track of videoStream.getVideoTracks()) {
		merged.addTrack(track);
	}
	for (const track of audioStream.getAudioTracks()) {
		merged.addTrack(track);
	}

	return merged;
}
