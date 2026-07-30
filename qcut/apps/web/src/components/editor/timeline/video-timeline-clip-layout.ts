export function getVideoClipLaneHeights({
	trackHeight,
}: {
	trackHeight: number;
}): {
	headerHeight: number;
	filmstripHeight: number;
	waveformHeight: number;
} {
	const boundedTrackHeight = Math.max(1, Math.floor(trackHeight));
	const headerHeight = Math.min(
		18,
		Math.max(10, Math.round(boundedTrackHeight * 0.25))
	);
	const waveformHeight = Math.min(
		18,
		Math.max(8, Math.round(boundedTrackHeight * 0.22))
	);
	return {
		headerHeight,
		filmstripHeight: Math.max(
			1,
			boundedTrackHeight - headerHeight - waveformHeight
		),
		waveformHeight,
	};
}
