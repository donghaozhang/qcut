export function buildVideoFitFilter({
	fitMode,
	width,
	height,
}: {
	fitMode: "cover" | "contain" | "fill";
	width: number;
	height: number;
}): string {
	if (fitMode === "contain") {
		return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
	}
	if (fitMode === "fill") return `scale=${width}:${height}`;
	return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}
