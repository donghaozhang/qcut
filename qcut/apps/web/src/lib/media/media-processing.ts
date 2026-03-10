import { platform } from "@qcut/platform-core";
import { toast } from "sonner";
import {
	getMediaStoreUtils,
	type MediaItem,
} from "@/stores/media/media-store-loader";
import { getFFmpegUtilFunctions } from "@/lib/ffmpeg/ffmpeg-utils-loader";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";

export interface ProcessedMediaItem extends Omit<MediaItem, "id"> {}

export async function processMediaFiles(
	files: FileList | File[],
	onProgress?: (progress: number) => void
): Promise<ProcessedMediaItem[]> {
	try {
		debugLog(
			"[Media Processing] Starting processMediaFiles with",
			files?.length || 0,
			"files"
		);

		const fileArray = Array.from(files || []);
		const processedItems: ProcessedMediaItem[] = [];

		// Load utilities dynamically
		debugLog("[Media Processing] Loading media store utilities...");
		const mediaUtils = await getMediaStoreUtils();
		debugLog("[Media Processing] Media store utilities loaded");

		debugLog("[Media Processing] Loading FFmpeg utilities...");
		const ffmpegUtils = await getFFmpegUtilFunctions();
		debugLog("[Media Processing] FFmpeg utilities loaded");

		const total = fileArray.length;
		let completed = 0;

		for (const file of fileArray) {
			debugLog(
				`[Media Processing] Processing file: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)} MB)`
			);

			const fileType = mediaUtils.getFileType(file);
			debugLog(
				`[Media Processing] Detected file type: ${fileType} for file: ${file.name} (${file.type})`
			);

			if (!fileType) {
				debugWarn(
					`[Media Processing] ❌ Unsupported file type: ${file.name} (${file.type})`
				);
				toast.error(`Unsupported file type: ${file.name}`);
				debugLog(
					"[Media Processing] 📊 Skipping file, processedItems length:",
					processedItems.length
				);
				// Advance progress even when skipping unsupported files
				await new Promise((resolve) => setTimeout(resolve, 0));
				completed += 1;
				if (onProgress) {
					const percent = Math.round((completed / total) * 100);
					onProgress(percent);
					debugLog(
						`[Media Processing] 📊 Progress: ${percent}% (${completed}/${total})`
					);
				}
				continue;
			}

			debugLog(
				"[Media Processing] ✅ File type detected successfully, proceeding with processing"
			);

			let thumbnailUrl: string | undefined;
			let duration: number | undefined;
			let width: number | undefined;
			let height: number | undefined;
			let fps: number | undefined;
			let url: string | undefined;
			let localPath: string | undefined;

			try {
				// Create URL that works in both web and Electron environments
				const isFileProtocol =
					typeof window !== "undefined" && window.location.protocol === "file:";
				if (isFileProtocol && fileType === "image") {
					// For images in Electron, use data URL for better compatibility
					debugLog(
						`[Media Processing] Using data URL for image in Electron: ${file.name}`
					);
					url = await new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => {
							if (typeof reader.result === "string") {
								resolve(reader.result);
							} else {
								reject(new Error("Failed to read file as data URL"));
							}
						};
						reader.onerror = () => reject(reader.error);
						reader.readAsDataURL(file);
					});
				} else {
					// Use blob URL for web environment or non-image files
					debugLog(
						`[Media Processing] Using blob URL for ${fileType}: ${file.name}`
					);
					url = URL.createObjectURL(file);
				}
				if (fileType === "image") {
					debugLog(`[Media Processing] 🖼️ Processing image: ${file.name}`);
					// Get image dimensions
					const dimensions = await mediaUtils.getImageDimensions(file);
					width = dimensions.width;
					height = dimensions.height;
					debugLog(`[Media Processing] ✅ Image processed: ${width}x${height}`);
				} else if (fileType === "video") {
					debugLog(`[Media Processing] 🎥 Processing video: ${file.name}`);
					try {
						debugLog(
							"[Media Processing] 🌐 Using browser APIs for video processing (primary method)..."
						);
						const videoResult = await mediaUtils.generateVideoThumbnail(file);
						debugLog(
							"[Media Processing] ✅ Browser thumbnail generated:",
							videoResult
						);
						thumbnailUrl = videoResult.thumbnailUrl;
						width = videoResult.width;
						height = videoResult.height;

						debugLog("[Media Processing] ⏱️ Getting video duration...");
						duration = await mediaUtils.getMediaDuration(file);

						// Set default FPS for browser processing (FFmpeg can override later if needed)
						fps = 30;

						// Skip FFmpeg enhancement to avoid timeout issues
						debugLog(
							"[Media Processing] ℹ️ Using browser data only to avoid FFmpeg timeout"
						);
					} catch (error) {
						debugWarn(
							"[Media Processing] Browser processing failed, falling back to FFmpeg:",
							error
						);

						// Skip FFmpeg fallback to avoid 60s timeout - use defaults instead
						debugLog(
							"[Media Processing] ℹ️ Using default values instead of FFmpeg fallback to avoid timeout"
						);
						duration = 0; // Default duration
						width = 1920; // Default width
						height = 1080; // Default height
						fps = 30; // Default fps
						thumbnailUrl = undefined;
					}
				} else if (fileType === "audio") {
					debugLog(`[Media Processing] 🎵 Processing audio: ${file.name}`);
					// For audio, we don't set width/height/fps (they'll be undefined)
					duration = await mediaUtils.getMediaDuration(file);
					debugLog("[Media Processing] ✅ Audio duration extracted:", duration);
				}

				// Save video files to temp directory for FFmpeg direct copy optimization
				if (fileType === "video" && platform().video?.saveTemp) {
					// Check file size to prevent memory issues
					const MAX_INSTANT_LOAD = 500 * 1024 * 1024; // 500MB

					try {
						if (file.size > MAX_INSTANT_LOAD) {
							debugLog(
								`[Media Processing] ⚠️ Large file detected (${(file.size / 1024 / 1024).toFixed(2)}MB) - this may take a moment`
							);
						}

						debugLog(
							`[Media Processing] 💾 Saving video to temp filesystem: ${file.name}`
						);

						// Read file as ArrayBuffer
						const arrayBuffer = await file.arrayBuffer();
						const uint8Array = new Uint8Array(arrayBuffer);

						// Save to temp directory via Electron IPC
						localPath = await platform().video.saveTemp(
							uint8Array,
							file.name
						);

						// Validate returned path
						if (!localPath || localPath.trim() === "") {
							debugError(
								"[Media Processing] ⚠️ Invalid localPath returned:",
								localPath
							);
							localPath = undefined;
						} else {
							debugLog(
								`[Media Processing] ✅ Video saved to temp: ${localPath}`
							);
						}
					} catch (error) {
						debugError(
							"[Media Processing] ⚠️ Failed to save video to temp:",
							error
						);

						if (file.size > MAX_INSTANT_LOAD) {
							debugError(
								`[Media Processing] Large file (${(file.size / 1024 / 1024).toFixed(2)}MB) may have caused memory issue`
							);
						}

						debugLog(
							"[Media Processing] Continuing without localPath (fallback to slow rendering)"
						);
					}
				} else if (fileType === "video") {
					debugLog(
						"[Media Processing] ℹ️ Electron API not available - skipping temp file creation"
					);
				}

				const processedItem = {
					name: file.name,
					type: fileType,
					file,
					url,
					thumbnailUrl,
					duration,
					width,
					height,
					fps,
					localPath,
				};

				debugLog("[Media Processing] ➕ Adding processed item:", {
					name: processedItem.name,
					type: processedItem.type,
					url: processedItem.url ? "SET" : "UNSET",
					thumbnailUrl: processedItem.thumbnailUrl ? "SET" : "UNSET",
					duration: processedItem.duration,
					width: processedItem.width,
					height: processedItem.height,
					fps: processedItem.fps,
				});

				processedItems.push(processedItem);
				debugLog(
					"[Media Processing] 📊 After adding item, processedItems length:",
					processedItems.length
				);

				// Yield back to the event loop to keep the UI responsive
				await new Promise((resolve) => setTimeout(resolve, 0));

				completed += 1;
				if (onProgress) {
					const percent = Math.round((completed / total) * 100);
					onProgress(percent);
					debugLog(
						`[Media Processing] 📊 Progress: ${percent}% (${completed}/${total})`
					);
				}
			} catch (error) {
				debugError(
					"[Media Processing] ❌ Critical error processing file:",
					file.name,
					error
				);

				// Don't completely abort - try to add the file with minimal info
				try {
					debugLog(
						"[Media Processing] 🔧 Attempting to add file with minimal processing:",
						file.name
					);
					// Create URL for fallback case if it wasn't created yet
					if (!url) {
						url = URL.createObjectURL(file);
					}
					const minimalItem = {
						name: file.name,
						type: fileType,
						file,
						url,
						thumbnailUrl: undefined,
						duration:
							fileType === "video" || fileType === "audio" ? 0 : undefined,
						width:
							fileType === "video" || fileType === "image" ? 1920 : undefined,
						height:
							fileType === "video" || fileType === "image" ? 1080 : undefined,
						fps: fileType === "video" ? 30 : undefined,
						localPath: undefined,
					};

					processedItems.push(minimalItem);
					debugLog(
						"[Media Processing] 📊 After minimal processing, processedItems length:",
						processedItems.length
					);

					debugLog(
						"[Media Processing] ✅ Added file with minimal processing:",
						file.name
					);
					toast.warning(`${file.name} added with limited processing`);
				} catch (addError) {
					debugError(
						"[Media Processing] ❌ Failed to add file even with minimal processing:",
						addError
					);
					toast.error(`Failed to process ${file.name}`);
					if (url) {
						URL.revokeObjectURL(url); // Clean up on complete failure
					}
				}

				// Ensure progress advances even on failure paths
				await new Promise((resolve) => setTimeout(resolve, 0));
				completed += 1;
				if (onProgress) {
					const percent = Math.round((completed / total) * 100);
					onProgress(percent);
					debugLog(
						`[Media Processing] 📊 Progress: ${percent}% (${completed}/${total})`
					);
				}
			}
		}

		debugLog(
			"[Media Processing] Final processedItems length before return:",
			processedItems.length
		);
		debugLog(
			"[Media Processing] Final processedItems:",
			processedItems.map((item) => ({ name: item.name, type: item.type }))
		);
		return processedItems;
	} catch (globalError) {
		debugError(
			"[Media Processing] GLOBAL ERROR in processMediaFiles:",
			globalError
		);
		return [];
	}
}

/**
 * Convert FAL.ai media URLs to blob URLs to avoid CORS/COEP issues
 */
export async function convertFalImageToBlob(imageUrl: string): Promise<string> {
	if (!imageUrl.includes("fal.media")) {
		debugLog("[FAL Image] URL is not a fal.media URL, returning as-is");
		return imageUrl;
	}

	try {
		debugLog("[FAL Image] Converting fal.media URL to blob:", imageUrl);
		const response = await fetch(imageUrl, {
			mode: "cors",
			headers: {
				"Accept": "image/*",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);

		debugLog("[FAL Image] ✅ Successfully converted to blob URL:", blobUrl);
		return blobUrl;
	} catch (error) {
		debugError("[FAL Image] ❌ Failed to convert to blob:", error);
		// Fallback to original URL - better to try than completely fail
		return imageUrl;
	}
}
