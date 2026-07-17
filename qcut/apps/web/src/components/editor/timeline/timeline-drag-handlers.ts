import { useCallback, useRef, useState } from "react";
import { createObjectURL } from "@/lib/media/blob-manager";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { toast } from "sonner";
import type { DragData } from "@/types/timeline";
import type { MediaItem, MediaStore } from "@/stores/media/media-store-types";
import {
	AUDIO_LIBRARY_DRAG_MIME,
	parseAudioLibraryDrag,
} from "@/lib/audio/audio-library-drag";
import { useSoundsStore } from "@/stores/media/sounds-store";

interface UseDragHandlersParams {
	mediaItems: MediaItem[];
	addMediaItem: MediaStore["addMediaItem"] | undefined;
	activeProject: { id: string } | null;
}

interface DragProps {
	onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
	onDrop: (e: React.DragEvent<HTMLDivElement>) => Promise<void>;
}

interface UseDragHandlersReturn {
	isDragOver: boolean;
	isProcessing: boolean;
	progress: number;
	dragProps: DragProps;
}

function isDropOfTimelineElement({ e }: { e: React.DragEvent }): boolean {
	return e.dataTransfer.types.includes("application/x-timeline-element");
}

export function useDragHandlers({
	mediaItems,
	addMediaItem,
	activeProject,
}: UseDragHandlersParams): UseDragHandlersReturn {
	const [isDragOver, setIsDragOver] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const dragCounterRef = useRef(0);

	const handleDragEnter = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			if (isDropOfTimelineElement({ e })) {
				return;
			}
			dragCounterRef.current += 1;
			if (!isDragOver) {
				setIsDragOver(true);
			}
		},
		[isDragOver]
	);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		if (isDropOfTimelineElement({ e })) {
			return;
		}
		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) {
			setIsDragOver(false);
		}
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setIsDragOver(false);
			dragCounterRef.current = 0;

			if (isDropOfTimelineElement({ e })) {
				return;
			}
			const audioLibraryData = e.dataTransfer.getData(AUDIO_LIBRARY_DRAG_MIME);
			if (audioLibraryData) {
				const payload = parseAudioLibraryDrag({ value: audioLibraryData });
				if (!payload) {
					toast.error("Invalid audio library item");
					return;
				}
				const beatAlignment =
					useTimelineStore.getState().snappingEnabled && payload.sound.bpm
						? "nearest"
						: undefined;
				await useSoundsStore.getState().addSoundToTimeline({
					sound: payload.sound,
					kind: payload.kind,
					...(beatAlignment ? { beatAlignment } : {}),
				});
				return;
			}

			const itemData = e.dataTransfer.getData("application/x-media-item");
			if (itemData) {
				try {
					const dragData: DragData = JSON.parse(itemData);

					if (dragData.type === "text") {
						useTimelineStore.getState().addTextToNewTrack(dragData);
						return;
					}

					if (dragData.type === "markdown") {
						useTimelineStore.getState().addMarkdownToNewTrack(dragData);
						return;
					}

					if (dragData.type === "sticker") {
						try {
							const { useStickersStore } = await import(
								"@/stores/stickers-store"
							);
							const { downloadSticker } = useStickersStore.getState();

							const parts = dragData.iconName.split(":");
							if (parts.length !== 2) {
								toast.error("Invalid sticker identifier format");
								return;
							}
							const [collection, icon] = parts;
							const blob = await downloadSticker(collection, icon);

							if (blob && activeProject) {
								const fileName = `${dragData.iconName.replace(":", "-")}.svg`;
								const file = new File([blob], fileName, {
									type: "image/svg+xml",
								});

								const mediaItem: Omit<MediaItem, "id"> = {
									name: dragData.iconName.replace(":", "-"),
									type: "image",
									file,
									url: createObjectURL(file, "timeline-sticker-drop"),
									width: 200,
									height: 200,
									duration: 5,
									ephemeral: false,
								};

								if (addMediaItem) {
									const newItemId = await addMediaItem(
										activeProject.id,
										mediaItem
									);

									// Create overlay sticker at center position
									const { useStickersOverlayStore } = await import(
										"@/stores/stickers-overlay-store"
									);
									const stickerId = useStickersOverlayStore
										.getState()
										.addOverlaySticker(newItemId, {
											position: { x: 50, y: 50 },
										});

									// Add as StickerElement to timeline (not MediaElement)
									const { timelineStickerIntegration } = await import(
										"@/lib/stickers/timeline-sticker-integration"
									);
									const sticker = useStickersOverlayStore
										.getState()
										.overlayStickers.get(stickerId);
									if (sticker) {
										const currentTime = usePlaybackStore.getState().currentTime;
										await timelineStickerIntegration.addStickerToTimeline(
											sticker,
											currentTime,
											5 // 5 second default duration
										);
									}
								}
							}
						} catch (error) {
							console.error("Error handling sticker drop:", error);
							toast.error("Failed to add sticker to timeline");
						}
						return;
					}

					const mediaItem = mediaItems.find((item) => item.id === dragData.id);
					if (!mediaItem) {
						toast.error("Media item not found");
						return;
					}
					useTimelineStore.getState().addMediaToNewTrack(mediaItem);
				} catch (error) {
					console.error("Error parsing dropped item data:", error);
					toast.error("Failed to add item to timeline");
				}
				return;
			}

			if (e.dataTransfer.files?.length > 0) {
				if (!activeProject) {
					toast.error("No active project");
					return;
				}

				const droppedFiles = Array.from(e.dataTransfer.files);
				const markdownFiles = droppedFiles.filter((file) =>
					file.name.toLowerCase().endsWith(".md")
				);

				if (markdownFiles.length > 0) {
					try {
						for (const markdownFile of markdownFiles) {
							const markdownContent = await markdownFile.text();
							const currentTime = usePlaybackStore.getState().currentTime;
							useTimelineStore.getState().addMarkdownAtTime(
								{
									id: `dropped-markdown-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
									type: "markdown",
									name: markdownFile.name,
									markdownContent,
									duration: 300,
									startTime: 0,
									trimStart: 0,
									trimEnd: 0,
									theme: "dark",
									fontSize: 18,
									fontFamily: "Arial",
									padding: 16,
									backgroundColor: "rgba(0, 0, 0, 0.85)",
									textColor: "#ffffff",
									scrollMode: "static",
									scrollSpeed: 30,
									x: 0,
									y: 0,
									width: 720,
									height: 420,
									rotation: 0,
									opacity: 1,
								},
								currentTime
							);
						}

						toast.success(`Added ${markdownFiles.length} markdown file(s)`);
					} catch (error) {
						console.error("Error processing markdown files:", error);
						toast.error("Failed to process markdown files");
					}
					return;
				}

				setIsProcessing(true);
				setProgress(0);

				try {
					const { processMediaFiles } = await import(
						"@/lib/media/media-processing"
					);
					const processedItems = await processMediaFiles(
						e.dataTransfer.files,
						(nextProgress) => setProgress(nextProgress)
					);

					if (!addMediaItem) {
						throw new Error("Media store not ready");
					}

					const addedItemIds = await Promise.all(
						processedItems.map((processedItem) =>
							addMediaItem(activeProject.id, processedItem)
						)
					);

					const { useMediaStore } = await import("@/stores/media/media-store");
					const currentState = useMediaStore.getState() as {
						mediaItems: MediaItem[];
					};

					for (const addedItemId of addedItemIds) {
						const addedItem = currentState.mediaItems.find(
							(item) => item.id === addedItemId
						);
						if (addedItem) {
							useTimelineStore.getState().addMediaToNewTrack(addedItem);
						}
					}
				} catch (error) {
					console.error("Error processing external files:", error);
					toast.error("Failed to process dropped files");
				} finally {
					setIsProcessing(false);
					setProgress(0);
				}
			}
		},
		[activeProject, addMediaItem, mediaItems]
	);

	const dragProps: DragProps = {
		onDragEnter: handleDragEnter,
		onDragOver: handleDragOver,
		onDragLeave: handleDragLeave,
		onDrop: handleDrop,
	};

	return {
		isDragOver,
		isProcessing,
		progress,
		dragProps,
	};
}
