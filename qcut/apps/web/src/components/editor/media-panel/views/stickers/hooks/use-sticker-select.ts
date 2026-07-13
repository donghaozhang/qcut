import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersStore } from "@/stores/stickers-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { downloadIconSvg, createSvgBlob } from "@/lib/stickers/iconify-api";
import { resolveIconifyStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { useAssetLibraryStore } from "@/stores/asset-library-store";

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
	const addMediaItem = useMediaStore((s) => s.addMediaItem);
	const activeProject = useProjectStore((s) => s.activeProject);
	const addRecentSticker = useStickersStore((s) => s.addRecentSticker);
	const addOverlaySticker = useStickersOverlayStore((s) => s.addOverlaySticker);
	const removeOverlaySticker = useStickersOverlayStore(
		(state) => state.removeOverlaySticker
	);
	const updateRuntimeState = useAssetLibraryStore(
		(state) => state.updateRuntimeState
	);

	// Track object URLs for cleanup
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

	const handleStickerSelect = useCallback(
		async (iconId: string, name: string): Promise<string | undefined> => {
			debugLog(`[StickerSelect] Starting selection for ${iconId} (${name})`);

			if (!activeProject) {
				debugError("[StickerSelect] No project selected");
				toast.error("No project selected");
				return;
			}

			// DEBUG: Log activeProject.id
			console.log(
				`[StickerSelect] activeProject.id = ${activeProject.id}, iconId = ${iconId}`
			);

			let createdObjectUrl: string | null = null;
			try {
				// Download the actual SVG content with transparency
				const [collection, icon] = iconId.split(":");

				if (!collection || !icon) {
					debugError(`[StickerSelect] Invalid sticker ID format: ${iconId}`);
					toast.error("Invalid sticker ID format");
					return;
				}
				const asset = resolveIconifyStickerAssetEntry({
					collectionPrefix: collection,
					icon,
				});
				updateRuntimeState({
					asset,
					patch: {
						downloadStatus: "downloading",
						cacheStatus: "caching",
						progress: 0.1,
						error: undefined,
					},
				});

				debugLog(`[StickerSelect] Downloading SVG for ${collection}:${icon}`);
				const svgContent = await downloadIconSvg(collection, icon, {
					// No color specified to maintain transparency
					width: 512,
					height: 512,
				});
				debugLog(
					`[StickerSelect] SVG downloaded, length: ${svgContent.length}`
				);

				if (!svgContent || svgContent.trim().length === 0) {
					throw new Error("Empty SVG content");
				}

				// Create a Blob from the downloaded SVG content
				const svgBlob = createSvgBlob(svgContent);

				const svgFile = new File([svgBlob], `${name}.svg`, {
					type: "image/svg+xml;charset=utf-8",
				});
				debugLog(
					`[StickerSelect] Created SVG file: ${svgFile.name}, size: ${svgFile.size}`
				);

				// For Electron (file:// protocol), use data URL instead of blob URL
				let imageUrl: string;

				if (window.location.protocol === "file:") {
					// Use URL-encoded data URL to support non-ASCII SVG content
					const encoded = encodeURIComponent(svgContent);
					imageUrl = `data:image/svg+xml;charset=utf-8,${encoded}`;
					debugLog(
						`[StickerSelect] Using data URL (Electron), length: ${imageUrl.length}`
					);
				} else {
					// Use blob URL for web environment
					createdObjectUrl = URL.createObjectURL(svgBlob);
					imageUrl = createdObjectUrl;
					objectUrlsRef.current.add(imageUrl);
					debugLog(`[StickerSelect] Using blob URL (Web): ${imageUrl}`);
				}

				const mediaItem = {
					name: `${name}.svg`,
					type: "image" as const,
					file: svgFile,
					url: imageUrl,
					thumbnailUrl: imageUrl,
					width: 512,
					height: 512,
					duration: 0,
				};
				debugLog("[StickerSelect] Adding media item:", mediaItem);

				const mediaItemId = await addMediaItem(activeProject.id, mediaItem);
				debugLog(`[StickerSelect] Media item added with ID: ${mediaItemId}`);
				await placeStickerOnTimeline({ mediaItemId });
				updateRuntimeState({
					asset,
					patch: {
						downloadStatus: "downloaded",
						cacheStatus: "cached",
						progress: 1,
						cacheKey: mediaItemId,
						error: undefined,
					},
				});

				// Add to recent stickers
				addRecentSticker(iconId, name);

				toast.success(`Added ${name} to timeline`);

				// Return the media item ID for potential overlay use
				return mediaItemId;
			} catch (error) {
				debugError(`[StickerSelect] Error adding sticker ${iconId}:`, error);
				const [collection, icon] = iconId.split(":");
				if (collection && icon) {
					updateRuntimeState({
						asset: resolveIconifyStickerAssetEntry({
							collectionPrefix: collection,
							icon,
						}),
						patch: {
							downloadStatus: "failed",
							cacheStatus: "failed",
							progress: 0,
							error: error instanceof Error ? error.message : "Download failed",
						},
					});
				}
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
			updateRuntimeState,
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
				const dimensions = await readImageDimensions({ url: imageUrl });
				const mediaItemId = await addMediaItem(activeProject.id, {
					name: file.name,
					type: "image",
					file,
					url: imageUrl,
					thumbnailUrl: imageUrl,
					width: dimensions.width,
					height: dimensions.height,
					duration: 0,
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
		for (const url of objectUrlsRef.current) {
			URL.revokeObjectURL(url);
		}
		objectUrlsRef.current.clear();
	}, []);

	return {
		handleStickerSelect,
		handleStickerSelectToOverlay: handleStickerSelect,
		handleStickerUpload,
		cleanupObjectUrls,
		objectUrlsRef,
	};
}
