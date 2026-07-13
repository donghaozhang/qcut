import type { WordItem } from "@/types/word-timeline";

export function getVisibleTimelineWords({
	overscanPixels = 240,
	pixelsPerSecond,
	scrollLeft,
	viewportWidth,
	words,
}: {
	overscanPixels?: number;
	pixelsPerSecond: number;
	scrollLeft: number;
	viewportWidth: number;
	words: WordItem[];
}) {
	const safePixelsPerSecond = Math.max(0.001, pixelsPerSecond);
	const startTime = Math.max(
		0,
		(scrollLeft - overscanPixels) / safePixelsPerSecond
	);
	const endTime =
		(scrollLeft + Math.max(0, viewportWidth) + overscanPixels) /
		safePixelsPerSecond;
	return words.filter(
		(word) =>
			word.type === "word" && word.end >= startTime && word.start <= endTime
	);
}

export function getTimelineWordGeometry({
	pixelsPerSecond,
	word,
}: {
	pixelsPerSecond: number;
	word: WordItem;
}) {
	return {
		left: Math.max(0, word.start) * pixelsPerSecond,
		width: Math.max(4, Math.max(0, word.end - word.start) * pixelsPerSecond),
	};
}
