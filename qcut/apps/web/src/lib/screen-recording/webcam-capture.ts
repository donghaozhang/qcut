/**
 * Webcam capture service — manages getUserMedia for PiP webcam overlay.
 */

export interface WebcamCaptureConfig {
	deviceId?: string;
	width?: number;
	height?: number;
	frameRate?: number;
}

export interface WebcamCaptureResult {
	stream: MediaStream;
	video: HTMLVideoElement;
	cleanup: () => void;
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FRAME_RATE = 30;

/**
 * Start webcam capture and return a playing HTMLVideoElement.
 * The video element can be passed directly to the export compositor.
 */
export async function startWebcamCapture(
	config: WebcamCaptureConfig = {}
): Promise<WebcamCaptureResult> {
	const constraints: MediaStreamConstraints = {
		video: {
			width: { ideal: config.width ?? DEFAULT_WIDTH },
			height: { ideal: config.height ?? DEFAULT_HEIGHT },
			frameRate: { ideal: config.frameRate ?? DEFAULT_FRAME_RATE },
			...(config.deviceId ? { deviceId: { exact: config.deviceId } } : {}),
		},
		audio: false,
	};

	const stream = await navigator.mediaDevices.getUserMedia(constraints);

	const video = document.createElement("video");
	video.srcObject = stream;
	video.muted = true;
	video.playsInline = true;

	const stopTracks = () => {
		for (const track of stream.getTracks()) {
			track.stop();
		}
	};

	try {
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => resolve();
			video.onerror = () => reject(new Error("Failed to load webcam video"));
		});

		await video.play();
	} catch (err) {
		video.srcObject = null;
		stopTracks();
		throw err;
	}

	const cleanup = () => {
		video.pause();
		video.srcObject = null;
		stopTracks();
	};

	return { stream, video, cleanup };
}

/** List available video input devices. */
export async function getVideoDevices(): Promise<MediaDeviceInfo[]> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((d) => d.kind === "videoinput");
}
