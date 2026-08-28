export function usesOriginalAudioFallbackForGeneratedMask({
	generatedMaskHasAudio,
	hasDerivedAudio,
	hasGeneratedMaskSource,
}: {
	generatedMaskHasAudio: boolean | undefined;
	hasDerivedAudio: boolean;
	hasGeneratedMaskSource: boolean;
}): boolean {
	if (!hasGeneratedMaskSource || hasDerivedAudio) return false;
	return generatedMaskHasAudio !== false;
}
