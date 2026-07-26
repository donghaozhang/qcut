export const MIN_MEDIA_PLAYBACK_RATE = 0.1;
export const MAX_MEDIA_PLAYBACK_RATE = 10;

export function clampMediaPlaybackRate({
	rate,
}: {
	rate: number | undefined;
}): number {
	return Math.min(
		MAX_MEDIA_PLAYBACK_RATE,
		Math.max(MIN_MEDIA_PLAYBACK_RATE, rate ?? 1)
	);
}
