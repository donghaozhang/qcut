const MAXIMUM_CONTINUOUS_FRAME_GAP_SECONDS = 1;
const TIMESTAMP_EPSILON_SECONDS = 0.001;

export function isPortraitTrackingDiscontinuity({
	previousTimestampSeconds,
	requestedTimestampSeconds,
}: {
	previousTimestampSeconds: number | null;
	requestedTimestampSeconds: number;
}) {
	if (previousTimestampSeconds === null) return false;
	const gap = requestedTimestampSeconds - previousTimestampSeconds;
	return (
		gap < -TIMESTAMP_EPSILON_SECONDS ||
		gap > MAXIMUM_CONTINUOUS_FRAME_GAP_SECONDS
	);
}

export function canMapPortraitDetection({
	requestedFaceCount,
	detectionSourceKey,
	requestSourceKey,
	detectionFrameNumber,
	requestFrameNumber,
	detectionFrameHash,
	requestFrameHash,
}: {
	requestedFaceCount: number;
	detectionSourceKey?: string;
	requestSourceKey?: string;
	detectionFrameNumber?: number;
	requestFrameNumber?: number;
	detectionFrameHash?: string;
	requestFrameHash: string;
}) {
	if (requestedFaceCount === 0) return false;
	if (detectionSourceKey && requestSourceKey) {
		if (detectionSourceKey !== requestSourceKey) return false;
		if (
			detectionFrameNumber !== undefined &&
			requestFrameNumber !== undefined
		) {
			return detectionFrameNumber === requestFrameNumber;
		}
	}
	return detectionFrameHash === requestFrameHash;
}
