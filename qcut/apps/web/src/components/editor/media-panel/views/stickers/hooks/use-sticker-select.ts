import { useCallback } from "react";
import { toast } from "sonner";
import {
	parseDirectGifRuntimeDescriptor,
	type StickerRuntimeDescriptor,
	StickerRuntimeError,
} from "@qcut/editor-core/sticker-lab";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { debugError } from "@/lib/debug/debug-config";
import { extractVideoMetadataFromUrl } from "@/lib/media/video-metadata";
import {
	createStickerMediaUrl,
	downloadStickerResource,
} from "@/lib/stickers/sticker-resource";
import {
	isAnimatedStickerAsset,
	isAnimatedStickerFile,
} from "@/lib/stickers/sticker-animation";
import type { StickerReferenceUsageMetadata } from "@/lib/stickers/local-sticker-reference";
import {
	registerStickerRuntimePackageResources,
	rollbackStickerRuntimePackageResources,
} from "@/lib/stickers/sticker-runtime-project-import";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useMediaStore } from "@/stores/media/media-store";
import type { MediaType } from "@/stores/media/media-store-types";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useStickersStore } from "@/stores/stickers-store";

interface StickerIdentity {
	collection: string;
	icon: string;
}

function isProjectActive({ projectId }: { projectId: string }): boolean {
	return useProjectStore.getState().activeProject?.id === projectId;
}

function assertProjectActive({ projectId }: { projectId: string }): void {
	if (!isProjectActive({ projectId })) {
		throw new Error("Active project changed while adding sticker");
	}
}

function parseStickerIdentity({ iconId }: { iconId: string }): StickerIdentity {
	const separatorIndex = iconId.indexOf(":");
	if (separatorIndex <= 0 || separatorIndex === iconId.length - 1) {
		throw new Error(`Invalid sticker ID: ${iconId}`);
	}
	return {
		collection: iconId.slice(0, separatorIndex),
		icon: iconId.slice(separatorIndex + 1),
	};
}

function readImageDimensions({
	url,
}: {
	url: string;
}): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () =>
			resolve({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => resolve({ width: 512, height: 512 });
		image.src = url;
	});
}

async function readStickerMediaMetadata({
	mediaType,
	url,
}: {
	mediaType: Exclude<MediaType, "audio">;
	url: string;
}): Promise<{ duration: number; height: number; width: number }> {
	if (mediaType === "image") {
		return { ...(await readImageDimensions({ url })), duration: 0 };
	}
	const metadata = await extractVideoMetadataFromUrl(url);
	return {
		duration: metadata.duration ?? 0,
		height: metadata.height,
		width: metadata.width,
	};
}

export function buildStickerUploadMetadata({
	animatedSticker,
	metadata,
	stickerRuntime,
	stickerRuntimeResources,
}: {
	animatedSticker: boolean;
	metadata?: StickerReferenceUsageMetadata;
	stickerRuntime?: StickerRuntimeDescriptor;
	stickerRuntimeResources?: Record<string, string>;
}): Record<string, unknown> {
	return {
		source: metadata ? "sticker-lab" : "sticker-upload",
		animatedSticker,
		...(stickerRuntime ? { stickerRuntime } : {}),
		...(stickerRuntimeResources &&
		Object.keys(stickerRuntimeResources).length > 0
			? { stickerRuntimeResources }
			: {}),
		...metadata,
	};
}

export async function parseStickerFileRuntime({
	animatedSticker,
	file,
}: {
	animatedSticker: boolean;
	file: File;
}): Promise<StickerRuntimeDescriptor | undefined> {
	const isGif =
		file.type === "image/gif" || file.name.toLocaleLowerCase().endsWith(".gif");
	if (!animatedSticker || !isGif) return;
	const bytes = new Uint8Array(await file.arrayBuffer());
	try {
		return parseDirectGifRuntimeDescriptor({ bytes });
	} catch (error) {
		if (error instanceof StickerRuntimeError) {
			debugError(
				`[StickerSelect] Skipping GIF runtime metadata for ${file.name}:`,
				error
			);
			return;
		}
		throw error;
	}
}

export function useStickerSelect() {
	const addMediaItem = useMediaStore((state) => state.addMediaItem);
	const removeMediaItem = useMediaStore((state) => state.removeMediaItem);
	const activeProject = useProjectStore((state) => state.activeProject);
	const addRecentSticker = useStickersStore((state) => state.addRecentSticker);
	const addOverlaySticker = useStickersOverlayStore(
		(state) => state.addOverlaySticker
	);
	const removeOverlaySticker = useStickersOverlayStore(
		(state) => state.removeOverlaySticker
	);
	const updateRuntimeState = useAssetLibraryStore(
		(state) => state.updateRuntimeState
	);

	const revokeUnownedMediaUrl = useCallback(({ url }: { url: string }) => {
		const mediaOwnsUrl = useMediaStore
			.getState()
			.mediaItems.some((item) => item.url === url || item.thumbnailUrl === url);
		if (!mediaOwnsUrl) URL.revokeObjectURL(url);
	}, []);

	const rollbackMediaItem = useCallback(
		async ({
			mediaItemId,
			projectId,
		}: {
			mediaItemId: string;
			projectId: string;
		}) => {
			try {
				await removeMediaItem(projectId, mediaItemId);
			} catch (error) {
				debugError("[StickerSelect] Failed to roll back media item", error);
			}
		},
		[removeMediaItem]
	);

	const placeStickerOnTimeline = useCallback(
		async ({
			mediaItemId,
			projectId,
			stickerRuntime,
		}: {
			mediaItemId: string;
			projectId: string;
			stickerRuntime?: StickerRuntimeDescriptor;
		}): Promise<boolean> => {
			assertProjectActive({ projectId });
			const stickerId = addOverlaySticker(mediaItemId, {
				position: { x: 50, y: 50 },
			});
			const sticker = useStickersOverlayStore
				.getState()
				.overlayStickers.get(stickerId);
			if (!sticker) {
				removeOverlaySticker(stickerId);
				return false;
			}

			try {
				const [{ timelineStickerIntegration }, { usePlaybackStore }] =
					await Promise.all([
						import("@/lib/stickers/timeline-sticker-integration"),
						import("@/stores/editor/playback-store"),
					]);
				assertProjectActive({ projectId });
				const result = await timelineStickerIntegration.addStickerToTimeline(
					sticker,
					usePlaybackStore.getState().currentTime,
					5,
					() => isProjectActive({ projectId }),
					stickerRuntime
				);
				if (result.success) return true;
				throw new Error(result.error ?? "Failed to add sticker to timeline");
			} catch (error) {
				removeOverlaySticker(stickerId);
				throw error;
			}
		},
		[addOverlaySticker, removeOverlaySticker]
	);

	const prepareSticker = useCallback(
		async ({ iconId, name }: { iconId: string; name: string }) => {
			const { collection, icon } = parseStickerIdentity({ iconId });
			const pendingAsset = resolveStickerAssetEntry({
				collectionPrefix: collection,
				icon,
			});
			updateRuntimeState({
				asset: pendingAsset,
				patch: {
					downloadStatus:
						pendingAsset.delivery === "remote" ? "downloading" : "not-required",
					cacheStatus:
						pendingAsset.delivery === "remote" ? "caching" : "cached",
					progress: pendingAsset.delivery === "remote" ? 0 : 1,
					error: undefined,
				},
			});

			try {
				const downloaded = await downloadStickerResource({
					collection,
					icon,
					name,
					onProgress: ({ progress }) =>
						updateRuntimeState({
							asset: pendingAsset,
							patch: { progress },
						}),
				});
				updateRuntimeState({
					asset: downloaded.asset,
					patch: {
						downloadStatus:
							downloaded.asset.delivery === "remote"
								? "downloaded"
								: "not-required",
						cacheStatus: "cached",
						progress: 1,
						cacheKey: downloaded.cacheKey,
						error: undefined,
					},
				});
				return downloaded;
			} catch (error) {
				updateRuntimeState({
					asset: pendingAsset,
					patch: {
						downloadStatus: "failed",
						cacheStatus: "failed",
						progress: 0,
						error:
							error instanceof Error
								? error.message
								: "Sticker download failed",
					},
				});
				throw error;
			}
		},
		[updateRuntimeState]
	);

	const handleStickerDownload = useCallback(
		async (iconId: string, name: string): Promise<boolean> => {
			try {
				await prepareSticker({ iconId, name });
				toast.success(`${name} is available offline`);
				return true;
			} catch (error) {
				debugError(`[StickerSelect] Failed to download ${iconId}:`, error);
				toast.error("Failed to download sticker");
				return false;
			}
		},
		[prepareSticker]
	);

	const handleStickerSelect = useCallback(
		async (iconId: string, name: string): Promise<string | undefined> => {
			if (!activeProject) {
				toast.error("No project selected");
				return;
			}
			const projectId = activeProject.id;

			let createdObjectUrl: string | null = null;
			let mediaItemId: string | null = null;
			let createdRuntimeResourceIds: string[] = [];
			try {
				const downloaded = await prepareSticker({ iconId, name });
				assertProjectActive({ projectId });
				const runtimeRegistration = downloaded.runtimePackage
					? await registerStickerRuntimePackageResources({
							addMediaItem,
							asset: downloaded.asset,
							existingMediaItems: useMediaStore.getState().mediaItems,
							projectId,
							removeMediaItem,
							runtimePackage: downloaded.runtimePackage,
						})
					: undefined;
				createdRuntimeResourceIds = runtimeRegistration?.createdMediaIds ?? [];
				const animatedSticker =
					downloaded.runtimePackage !== undefined ||
					(isAnimatedStickerAsset({ asset: downloaded.asset }) &&
						(await isAnimatedStickerFile({ file: downloaded.file })));
				const stickerRuntime =
					downloaded.runtimePackage?.descriptor ??
					(await parseStickerFileRuntime({
						animatedSticker,
						file: downloaded.file,
					}));
				const mediaType =
					downloaded.runtimePackage?.primaryMediaType ?? "image";
				const mediaUrl = await createStickerMediaUrl({ blob: downloaded.blob });
				createdObjectUrl = mediaUrl.revoke ? mediaUrl.url : null;
				const mediaMetadata = await readStickerMediaMetadata({
					mediaType,
					url: mediaUrl.url,
				});
				assertProjectActive({ projectId });
				mediaItemId = await addMediaItem(projectId, {
					name: downloaded.file.name,
					type: mediaType,
					file: downloaded.file,
					url: mediaUrl.url,
					...(mediaType === "image" ? { thumbnailUrl: mediaUrl.url } : {}),
					width: mediaMetadata.width,
					height: mediaMetadata.height,
					duration: mediaMetadata.duration,
					metadata: {
						source: "sticker-library",
						stickerAssetId: downloaded.asset.id,
						stickerAssetVersion: downloaded.asset.version,
						animatedSticker,
						...(stickerRuntime ? { stickerRuntime } : {}),
						...(runtimeRegistration &&
						Object.keys(runtimeRegistration.resourceMediaIds).length > 0
							? {
									stickerRuntimeResources: runtimeRegistration.resourceMediaIds,
								}
							: {}),
					},
				});
				assertProjectActive({ projectId });
				const didPlaceSticker = await placeStickerOnTimeline({
					mediaItemId,
					projectId,
					stickerRuntime,
				});
				if (!didPlaceSticker) {
					throw new Error("Failed to add sticker to timeline");
				}
				addRecentSticker(iconId, name);
				toast.success(`Added ${name} to timeline`);
				return mediaItemId;
			} catch (error) {
				debugError(`[StickerSelect] Error adding sticker ${iconId}:`, error);
				if (mediaItemId) {
					await rollbackMediaItem({
						mediaItemId,
						projectId,
					});
				} else if (createdObjectUrl) {
					revokeUnownedMediaUrl({ url: createdObjectUrl });
				}
				await rollbackStickerRuntimePackageResources({
					mediaIds: createdRuntimeResourceIds,
					projectId,
					removeMediaItem,
				});
				toast.error("Failed to add sticker to project");
				return;
			}
		},
		[
			activeProject,
			addMediaItem,
			addRecentSticker,
			placeStickerOnTimeline,
			prepareSticker,
			removeMediaItem,
			revokeUnownedMediaUrl,
			rollbackMediaItem,
		]
	);

	const handleStickerUpload = useCallback(
		async ({
			file,
			metadata,
		}: {
			file: File;
			metadata?: StickerReferenceUsageMetadata;
		}): Promise<string | undefined> => {
			if (!activeProject) {
				toast.error("No project selected");
				return;
			}
			const projectId = activeProject.id;
			if (!file.type.startsWith("image/")) {
				toast.error(`${file.name} is not an image file`);
				return;
			}

			const mediaUrl = await createStickerMediaUrl({ blob: file });
			const imageUrl = mediaUrl.url;
			let mediaItemId: string | null = null;
			try {
				const [dimensions, animatedSticker] = await Promise.all([
					readImageDimensions({ url: imageUrl }),
					isAnimatedStickerFile({ file }),
				]);
				const stickerRuntime = await parseStickerFileRuntime({
					animatedSticker,
					file,
				});
				assertProjectActive({ projectId });
				mediaItemId = await addMediaItem(projectId, {
					name: file.name,
					type: "image",
					file,
					url: imageUrl,
					thumbnailUrl: imageUrl,
					width: dimensions.width,
					height: dimensions.height,
					duration: 0,
					metadata: buildStickerUploadMetadata({
						animatedSticker,
						metadata,
						stickerRuntime,
					}),
				});
				assertProjectActive({ projectId });
				const didPlaceSticker = await placeStickerOnTimeline({
					mediaItemId,
					projectId,
					stickerRuntime,
				});
				if (!didPlaceSticker) {
					throw new Error("Failed to add sticker to timeline");
				}
				toast.success(`Added ${file.name} to timeline`);
				return mediaItemId;
			} catch (error) {
				if (mediaItemId) {
					await rollbackMediaItem({
						mediaItemId,
						projectId,
					});
				} else if (mediaUrl.revoke) {
					revokeUnownedMediaUrl({ url: imageUrl });
				}
				toast.error(
					error instanceof Error ? error.message : "Failed to upload sticker"
				);
				return;
			}
		},
		[
			activeProject,
			addMediaItem,
			placeStickerOnTimeline,
			revokeUnownedMediaUrl,
			rollbackMediaItem,
		]
	);

	return {
		handleStickerDownload,
		handleStickerSelect,
		handleStickerSelectToOverlay: handleStickerSelect,
		handleStickerUpload,
	};
}
