import { syncProjectMediaIfNeeded } from "@/lib/claude-bridge/claude-timeline-bridge-helpers";
import { type MediaItem, useMediaStore } from "@/stores/media/media-store";
import type { AIPipelineResult } from "@/types/electron";

export async function resolveGeneratedMedia({
	result,
	projectId,
}: {
	result: AIPipelineResult;
	projectId: string;
}): Promise<MediaItem | undefined> {
	const resultLocations = new Set(
		[result.importedPath, result.outputPath].filter(
			(location): location is string => Boolean(location)
		)
	);
	const findMedia = () =>
		useMediaStore
			.getState()
			.mediaItems.find(
				(item) =>
					item.id === result.mediaId ||
					[item.localPath, item.originalUrl, item.url].some(
						(location) => location && resultLocations.has(location)
					)
			);
	const imported = findMedia();
	if (imported) return imported;
	await syncProjectMediaIfNeeded({ projectId });
	return findMedia();
}

export function generatedMediaUrl({
	media,
	result,
}: {
	media: MediaItem;
	result: AIPipelineResult;
}): string | undefined {
	return (
		media.localPath ??
		media.originalUrl ??
		media.url ??
		result.importedPath ??
		result.outputPath
	);
}
