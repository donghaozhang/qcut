export function buildJianyingRawDecodeFilter({
	fps,
	width,
	height,
}: {
	fps: number;
	width: number;
	height: number;
}): string {
	return [
		`fps=${fps}`,
		"format=rgba",
		`scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
		`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
		"setsar=1",
	].join(",");
}
