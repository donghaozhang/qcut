import { debugError, debugLog, debugWarn } from "@/lib/debug/debug-config";
import { platform } from "@qcut/platform-core";
import { MediaItem } from "@/stores/media/media-store";
import { TimelineTrack } from "@/types/timeline";
import {
	detectAudioSources,
	extractAudioFileInputs,
} from "../export-cli/sources";
import { AudioFileInput } from "../export-cli/types";

/** Hydrate missing audio media items from storage so they can be exported. */
export async function resolveAudioPreparationInputs({
	mediaItems,
	tracks,
}: {
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
}): Promise<{
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
}> {
	try {
		const mergedMediaById = new Map<string, MediaItem>();

		for (const mediaItem of mediaItems) {
			mergedMediaById.set(mediaItem.id, mediaItem);
		}

		const referencedMediaIds = new Set<string>();
		for (const track of tracks) {
			if (track.type !== "media" && track.type !== "audio") {
				continue;
			}

			for (const element of track.elements) {
				if (element.type !== "media") {
					continue;
				}
				referencedMediaIds.add(element.mediaId);
			}
		}

		const unresolvedMediaIds = Array.from(referencedMediaIds).filter((id) => {
			const mediaItem = mergedMediaById.get(id);
			if (!mediaItem) {
				return true;
			}

			const hasLocalPath = typeof mediaItem.localPath === "string";
			const hasFile = !!mediaItem.file && mediaItem.file.size > 0;
			const hasUrl =
				typeof mediaItem.url === "string" && mediaItem.url.length > 0;
			return !hasLocalPath && !hasFile && !hasUrl;
		});

		if (unresolvedMediaIds.length === 0) {
			return {
				mediaItems: Array.from(mergedMediaById.values()),
				tracks,
			};
		}

		const { useProjectStore } = await import("@/stores/project-store");
		const projectId = useProjectStore.getState().activeProject?.id;
		if (!projectId) {
			debugWarn(
				"[CLIExportEngine] Cannot hydrate missing audio media items without an active project ID"
			);
			return {
				mediaItems: Array.from(mergedMediaById.values()),
				tracks,
			};
		}

		const { storageService } = await import("@/lib/storage/storage-service");
		const hydratedItems = await Promise.all(
			unresolvedMediaIds.map(async (mediaId) => {
				try {
					return await storageService.loadMediaItem(projectId, mediaId);
				} catch (error) {
					debugWarn(
						`[CLIExportEngine] Failed to hydrate media item ${mediaId} from storage:`,
						error
					);
					return null;
				}
			})
		);

		for (const hydratedItem of hydratedItems) {
			if (!hydratedItem) {
				continue;
			}
			mergedMediaById.set(hydratedItem.id, hydratedItem);
		}

		return {
			mediaItems: Array.from(mergedMediaById.values()),
			tracks,
		};
	} catch (error) {
		debugWarn(
			"[CLIExportEngine] Failed to build audio preparation inputs, using in-memory snapshot:",
			error
		);
		return {
			mediaItems,
			tracks,
		};
	}
}

/** Extract and persist audio files from timeline tracks for FFmpeg export. */
export async function prepareAudioFilesForExport({
	fileExists,
	invokeIfAvailable,
	mediaItems,
	sessionId,
	tracks,
}: {
	fileExists: ({ filePath }: { filePath: string }) => Promise<boolean>;
	invokeIfAvailable: ({
		args,
		channel,
	}: {
		args?: unknown[];
		channel: string;
	}) => Promise<unknown | null>;
	mediaItems: MediaItem[];
	sessionId: string | null;
	tracks: TimelineTrack[];
}): Promise<AudioFileInput[]> {
	try {
		if (!platform().isElectron) {
			return [];
		}

		debugLog("[CLIExportEngine] Audio preparation inputs:", {
			mediaItemsCount: mediaItems.length,
			trackCount: tracks.length,
		});

		const results = await extractAudioFileInputs(
			tracks,
			mediaItems,
			sessionId,
			{
				fileExists: async (filePath: string): Promise<boolean> => {
					try {
						return await fileExists({ filePath });
					} catch (error) {
						debugWarn(
							`[CLIExportEngine] Failed to verify file existence for ${filePath}:`,
							error
						);
						return false;
					}
				},
				saveTemp: async ({
					audioData,
					filename,
				}: {
					audioData: ArrayBuffer;
					filename: string;
				}): Promise<{ success: boolean; path?: string; error?: string }> => {
					try {
						try {
							const path = await platform().audio.saveTemp(
								new Uint8Array(audioData),
								filename
							);
							if (typeof path === "string" && path.length > 0) {
								return {
									success: true,
									path,
								};
							}
						} catch {
							// audio.saveTemp not available, fall through to IPC fallback
						}

						const result = await invokeIfAvailable({
							channel: "save-audio-for-export",
							args: [{ audioData, filename }],
						});
						const parsedResult =
							result && typeof result === "object"
								? (result as {
										success?: boolean;
										path?: string;
										error?: string;
									})
								: null;

						if (!parsedResult) {
							return {
								success: false,
								error: "No available API to persist audio temp file",
							};
						}

						return {
							success: parsedResult.success === true,
							path: parsedResult.path,
							error: parsedResult.error,
						};
					} catch (error) {
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				},
			},
			debugLog
		);

		if (results.length === 0) {
			const audioSources = detectAudioSources(tracks, mediaItems);
			if (audioSources.hasAudio) {
				debugWarn(
					"[CLIExportEngine] Audio sources detected in timeline but none were resolved to exportable files",
					{
						embeddedVideoAudioCount: audioSources.embeddedVideoAudioCount,
						overlayAudioCount: audioSources.overlayAudioCount,
					}
				);
			}
		}

		debugLog(
			`[CLIExportEngine] Prepared ${results.length} audio files for export`
		);
		return results;
	} catch (error) {
		debugError("[CLIExportEngine] Error preparing audio files:", error);
		return [];
	}
}
