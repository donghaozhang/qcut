const MIN_SEEK_TIMEOUT_MS = 500;
const MAX_SEEK_TIMEOUT_MS = 2_000;
const HAVE_CURRENT_DATA_READY_STATE = 2;
const SEEK_TIME_EPSILON_SECONDS = 0.000_001;

function hasDecodedVideoFrame({ video }: { video: HTMLVideoElement }): boolean {
	return (
		video.readyState >= HAVE_CURRENT_DATA_READY_STATE &&
		video.videoWidth > 0 &&
		video.videoHeight > 0
	);
}

function normalizeSeekTime({
	timeSeconds,
	videoDurationSeconds,
}: {
	timeSeconds: number;
	videoDurationSeconds: number;
}): number {
	if (!(Number.isFinite(videoDurationSeconds) && videoDurationSeconds >= 0)) {
		return timeSeconds;
	}
	return Math.min(timeSeconds, videoDurationSeconds);
}

function isAtRequestedFrame({
	timeSeconds,
	video,
}: {
	timeSeconds: number;
	video: HTMLVideoElement;
}): boolean {
	return Math.abs(video.currentTime - timeSeconds) <= SEEK_TIME_EPSILON_SECONDS;
}

function seekTimeoutMs({
	fromSeconds,
	timeSeconds,
	videoDurationSeconds,
}: {
	fromSeconds: number;
	timeSeconds: number;
	videoDurationSeconds: number;
}): number {
	const safeDurationSeconds =
		Number.isFinite(videoDurationSeconds) && videoDurationSeconds > 0
			? videoDurationSeconds
			: 0;
	const adaptiveTimeout = Math.max(
		MIN_SEEK_TIMEOUT_MS,
		Math.min(MAX_SEEK_TIMEOUT_MS, safeDurationSeconds * 30)
	);
	const seekDistanceRatio =
		safeDurationSeconds > 0
			? Math.abs(fromSeconds - timeSeconds) / safeDurationSeconds
			: 0;
	return adaptiveTimeout * (1 + seekDistanceRatio * 2);
}

export function seekExportVideoFrame({
	frameRate,
	timeSeconds,
	video,
}: {
	frameRate: number;
	timeSeconds: number;
	video: HTMLVideoElement;
}): Promise<void> {
	if (!(Number.isFinite(timeSeconds) && timeSeconds >= 0)) {
		return Promise.reject(
			new Error("Video seek time must be finite and non-negative")
		);
	}
	if (!(Number.isFinite(frameRate) && frameRate > 0)) {
		return Promise.reject(
			new Error("Video export frame rate must be positive")
		);
	}
	const normalizedTimeSeconds = normalizeSeekTime({
		timeSeconds,
		videoDurationSeconds: video.duration,
	});
	if (
		!video.seeking &&
		hasDecodedVideoFrame({ video }) &&
		isAtRequestedFrame({ timeSeconds: normalizedTimeSeconds, video })
	) {
		return Promise.resolve();
	}

	const fromSeconds = video.currentTime;
	const timeoutMs = seekTimeoutMs({
		fromSeconds,
		timeSeconds: normalizedTimeSeconds,
		videoDurationSeconds: video.duration,
	});
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			clearTimeout(timeoutId);
			video.removeEventListener("error", onError);
			video.removeEventListener("seeked", onSeeked);
		};
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (error) {
				reject(error);
				return;
			}
			resolve();
		};
		const onError = () => finish(new Error("Failed to seek video frame"));
		const onSeeked = () => {
			if (!hasDecodedVideoFrame({ video })) {
				finish(new Error("Video seek completed without a decoded frame"));
				return;
			}
			if (!isAtRequestedFrame({ timeSeconds: normalizedTimeSeconds, video })) {
				finish(new Error("Video seek completed at the wrong frame"));
				return;
			}
			finish();
		};
		const timeoutId = setTimeout(
			() =>
				finish(
					new Error(`Video seek timed out after ${timeoutMs.toFixed(0)}ms`)
				),
			timeoutMs
		);

		video.addEventListener("error", onError);
		video.addEventListener("seeked", onSeeked);
		video.currentTime = normalizedTimeSeconds;
		if (
			!video.seeking &&
			hasDecodedVideoFrame({ video }) &&
			isAtRequestedFrame({ timeSeconds: normalizedTimeSeconds, video })
		) {
			queueMicrotask(onSeeked);
		}
	});
}
