import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { resolveStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { debugError } from "@/lib/debug/debug-config";
import {
	createStickerMediaUrl,
	downloadStickerResource,
} from "@/lib/stickers/sticker-resource";
import {
	isAnimatedStickerAsset,
	isAnimatedStickerFile,
} from "@/lib/stickers/sticker-animation";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useStickersStore } from "@/stores/stickers-store";

interface StickerIdentity {
	collection: string;
	icon: string;
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

export function useStickerSelect() {
	const addMediaItem = useMediaStore((state) => state.addMediaItem);
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
	const objectUrlsRef = useRef<Set<string>>(new Set());

	const placeStickerOnTimeline = useCallback(
		async ({ mediaItemId }: { mediaItemId: string }): Promise<boolean> => {
			const stickerId = addOverlaySticker(mediaItemId, {
				position: { x: 50, y: 50 },
			});
			const sticker = useStickersOverlayStore
				.getState()
				.overlayStickers.get(stickerId);
			if (!sticker) return false;

			const [{ timelineStickerIntegration }, { usePlaybackStore }] =
				await Promise.all([
					import("@/lib/stickers/timeline-sticker-integration"),
					import("@/stores/editor/playback-store"),
				]);
			const result = await timelineStickerIntegration.addStickerToTimeline(
				sticker,
				usePlaybackStore.getState().currentTime,
				5
			);
			if (result.success) return true;
			removeOverlaySticker(stickerId);
			throw new Error(result.error ?? "Failed to add sticker to timeline");
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

			let createdObjectUrl: string | null = null;
			try {
				const downloaded = await prepareSticker({ iconId, name });
				const animatedSticker =
					isAnimatedStickerAsset({ asset: downloaded.asset }) &&
					(await isAnimatedStickerFile({ file: downloaded.file }));
				const mediaUrl = await createStickerMediaUrl({ blob: downloaded.blob });
				createdObjectUrl = mediaUrl.revoke ? mediaUrl.url : null;
				if (mediaUrl.revoke) objectUrlsRef.current.add(mediaUrl.url);
				const dimensions = await readImageDimensions({ url: mediaUrl.url });
				const mediaItemId = await addMediaItem(activeProject.id, {
					name: downloaded.file.name,
					type: "image",
					file: downloaded.file,
					url: mediaUrl.url,
					thumbnailUrl: mediaUrl.url,
					width: dimensions.width,
					height: dimensions.height,
					duration: 0,
					metadata: {
						source: "sticker-library",
						stickerAssetId: downloaded.asset.id,
						stickerAssetVersion: downloaded.asset.version,
						animatedSticker,
					},
				});
				await placeStickerOnTimeline({ mediaItemId });
				addRecentSticker(iconId, name);
				toast.success(`Added ${name} to timeline`);
				return mediaItemId;
			} catch (error) {
				debugError(`[StickerSelect] Error adding sticker ${iconId}:`, error);
				if (createdObjectUrl) {
					URL.revokeObjectURL(createdObjectUrl);
					objectUrlsRef.current.delete(createdObjectUrl);
				}
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
		]
	);

	const handleStickerUpload = useCallback(
		async ({ file }: { file: File }): Promise<string | undefined> => {
			if (!activeProject) {
				toast.error("No project selected");
				return;
			}
			if (!file.type.startsWith("image/")) {
				toast.error(`${file.name} is not an image file`);
				return;
			}

			const imageUrl = URL.createObjectURL(file);
			objectUrlsRef.current.add(imageUrl);
			try {
				const [dimensions, animatedSticker] = await Promise.all([
					readImageDimensions({ url: imageUrl }),
					isAnimatedStickerFile({ file }),
				]);
				const mediaItemId = await addMediaItem(activeProject.id, {
					name: file.name,
					type: "image",
					file,
					url: imageUrl,
					thumbnailUrl: imageUrl,
					width: dimensions.width,
					height: dimensions.height,
					duration: 0,
					metadata: {
						source: "sticker-upload",
						animatedSticker,
					},
				});
				await placeStickerOnTimeline({ mediaItemId });
				toast.success(`Added ${file.name} to timeline`);
				return mediaItemId;
			} catch (error) {
				URL.revokeObjectURL(imageUrl);
				objectUrlsRef.current.delete(imageUrl);
				toast.error(
					error instanceof Error ? error.message : "Failed to upload sticker"
				);
				return;
			}
		},
		[activeProject, addMediaItem, placeStickerOnTimeline]
	);

	const cleanupObjectUrls = useCallback(() => {
		for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
		objectUrlsRef.current.clear();
	}, []);

	return {
		handleStickerDownload,
		handleStickerSelect,
		handleStickerSelectToOverlay: handleStickerSelect,
		handleStickerUpload,
		cleanupObjectUrls,
		objectUrlsRef,
	};
}
