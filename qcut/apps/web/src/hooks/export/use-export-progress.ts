import { useRef, useState } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useAppSettingsStore } from "@/stores/app-settings-store";
import { playCompletionChime } from "@/lib/audio/completion-chime";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
// Export engine factory and engine types will be imported dynamically when needed
import type {
	ExportFormat,
	ExportQuality,
	AudioCodec,
	ExportSettingsWithAudio,
	GifExportConfig,
	ExportFrameRate,
	ExportEngineSelection,
} from "@/types/export";
import type { ExportEngine } from "@/lib/export/export-engine";
import type {
	ExportEngineFactory,
	ExportEngineType,
} from "@/lib/export/export-engine-factory";
import { toast } from "sonner";
import { useElectron } from "@/hooks/useElectron";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { lockForExport, unlockFromExport } from "@/lib/media/blob-manager";
import { saveExportedVideo } from "@/lib/export/export-output";
import { getTimelineDuration } from "@/lib/timeline";
import {
	createHyperframesExportController,
	hasExportableHyperframes,
	prepareHyperframesForExport,
	type HyperframesExportController,
} from "@/lib/hyperframes/export-preprocessor";

export function useExportProgress() {
	const { progress, updateProgress, setError, resetExport, addToHistory } =
		useExportStore();

	const { tracks } = useTimelineStore();
	const { mediaItems } = useAsyncMediaItems();
	const { isElectron } = useElectron();

	const currentEngineRef = useRef<ExportEngine | null>(null);
	const hyperframesControllerRef = useRef<HyperframesExportController | null>(
		null
	);
	const exportCancellationRef = useRef<{ cancelled: boolean } | null>(null);
	const [exportStartTime, setExportStartTime] = useState<Date | null>(null);

	const handleCancel = () => {
		if (progress.isExporting) {
			const cancellationState = exportCancellationRef.current;
			if (cancellationState) {
				cancellationState.cancelled = true;
			}
			currentEngineRef.current?.cancel();
			currentEngineRef.current = null;
			void hyperframesControllerRef.current?.cancel();

			// NOTE: Do NOT call unlockFromExport() here.
			// The finally block in handleExport() will handle the unlock.
			// Calling it here would cause a double-unlock race condition when
			// overlapping exports occur (user cancels #1 and starts #2).

			updateProgress({
				progress: 0,
				status: "Export cancelled",
				isExporting: false,
			});

			toast.info("Export cancelled by user");

			setTimeout(() => {
				if (exportCancellationRef.current !== cancellationState) return;
				exportCancellationRef.current = null;
				resetExport();
			}, 1000);
		}
	};

	const handleExport = async (
		canvas: HTMLCanvasElement,
		totalDuration: number,
		exportSettings: {
			quality: ExportQuality;
			format: ExportFormat;
			filename: string;
			engineType: ExportEngineSelection;
			resolution: { width: number; height: number };
			frameRate: ExportFrameRate;
			outputPath?: string;
			includeAudio?: boolean;
			audioCodec?: AudioCodec;
			audioBitrate?: number;
			gifConfig?: GifExportConfig;
		}
	) => {
		// Reset any previous errors
		setError(null);
		resetExport();
		const cancellationState = { cancelled: false };
		exportCancellationRef.current = cancellationState;
		const throwIfCancelled = () => {
			if (cancellationState.cancelled) {
				throw new Error("Export cancelled by user");
			}
		};
		updateProgress({
			progress: 0,
			status: "Initializing export...",
			isExporting: true,
		});

		// Record export start time
		const startTime = new Date();
		setExportStartTime(startTime);

		// Lock blob URLs from auto-cleanup during export
		// This prevents ERR_FILE_NOT_FOUND errors when export takes longer than 10 minutes
		lockForExport();
		let hyperframesController: HyperframesExportController | null = null;
		let exportEngineForRun: ExportEngine | null = null;

		try {
			if (totalDuration === 0) {
				debugWarn("[ExportPanel] ❌ cannot export: timeline duration is 0");
				throw new Error(
					"Timeline is empty - add some content before exporting"
				);
			}

			// Create export engine using factory for optimal performance
			// Dynamically import export engine factory
			const { ExportEngineFactory, ExportEngineType } = await import(
				"@/lib/export/export-engine-factory"
			);
			const factory = ExportEngineFactory.getInstance();
			const hasHyperframes = hasExportableHyperframes({ tracks });
			let exportTracks = tracks;
			let exportMediaItems = mediaItems;

			if (hasHyperframes) {
				updateProgress({
					progress: 0,
					status: "Preparing HyperFrames compositions...",
					isExporting: true,
				});
				hyperframesController = createHyperframesExportController();
				hyperframesControllerRef.current = hyperframesController;
				const prepared = await prepareHyperframesForExport({
					tracks,
					mediaItems,
					frameRate: exportSettings.frameRate,
					resolution: exportSettings.resolution,
					controller: hyperframesController,
					onProgress: (hyperframesProgress, status) => {
						if (cancellationState.cancelled) return;
						updateProgress({
							progress: hyperframesProgress * 0.2,
							status,
							isExporting: true,
						});
					},
				});
				exportTracks = prepared.tracks;
				exportMediaItems = prepared.mediaItems;
			}
			throwIfCancelled();
			const exportTimelineDuration = getTimelineDuration({
				tracks: exportTracks,
				fps: exportSettings.frameRate,
			});
			if (exportTimelineDuration === 0) {
				throw new Error(
					"Timeline is empty - add some content before exporting"
				);
			}

			console.log("🎬 EXPORT HOOK - Selecting engine type:");
			console.log("  - isElectron():", isElectron());
			console.log("  - User selected engine:", exportSettings.engineType);

			const engineTypeMap: Partial<
				Record<ExportEngineSelection, ExportEngineType>
			> = {
				cli: ExportEngineType.CLI,
				ffmpeg: ExportEngineType.FFMPEG,
				standard: ExportEngineType.STANDARD,
			};
			// Auto delegates to the factory; every explicit selection is honored on
			// desktop and web so the control never lies about the active engine.
			let selectedEngineType: ExportEngineType | undefined =
				exportSettings.engineType === "auto"
					? undefined
					: engineTypeMap[exportSettings.engineType];
			if (hasHyperframes && isElectron()) {
				const hasRemotion = exportTracks.some(
					(track) => track.type === "remotion" && track.elements.length > 0
				);
				selectedEngineType = hasRemotion
					? ExportEngineType.REMOTION
					: ExportEngineType.CLI;
			}

			debugLog("[ExportPanel] 🎬 Creating export engine with settings:", {
				quality: exportSettings.quality,
				format: exportSettings.format,
				filename: exportSettings.filename,
				engineType: selectedEngineType || "auto-recommend",
				resolution: exportSettings.resolution,
				frameRate: exportSettings.frameRate,
				duration: exportTimelineDuration,
			});

			const exportEngine = await factory.createEngine(
				canvas,
				{
					quality: exportSettings.quality,
					format: exportSettings.format,
					width: exportSettings.resolution.width,
					height: exportSettings.resolution.height,
					filename: exportSettings.filename,
					frameRate: exportSettings.frameRate,
					includeAudio: exportSettings.includeAudio,
					audioCodec: exportSettings.audioCodec,
					audioBitrate: exportSettings.audioBitrate,
					gifConfig: exportSettings.gifConfig,
				},
				exportTracks,
				exportMediaItems,
				exportTimelineDuration,
				selectedEngineType
			);
			exportEngineForRun = exportEngine;
			if (cancellationState.cancelled) {
				exportEngine.cancel();
				throwIfCancelled();
			}

			// Store engine reference for cancellation
			currentEngineRef.current = exportEngine;

			debugLog(
				"[ExportPanel] 🚀 Starting export with engine:",
				exportEngine.constructor.name
			);

			// Start export with progress callback
			updateProgress({
				progress: 0,
				status: "Initializing export...",
				isExporting: true,
			});

			// Check if this is a RemotionExportEngine and use its specialized export method
			let blob: Blob;
			if (
				"exportWithRemotion" in exportEngine &&
				typeof (exportEngine as Record<string, unknown>).exportWithRemotion ===
					"function"
			) {
				debugLog("[ExportPanel] 🎬 Using Remotion export pipeline");
				const remotionEngine = exportEngine as ExportEngine & {
					exportWithRemotion: (
						onProgress: (p: {
							overallProgress: number;
							statusMessage: string;
						}) => void
					) => Promise<Blob>;
				};
				blob = await remotionEngine.exportWithRemotion((remotionProgress) => {
					if (cancellationState.cancelled) return;
					updateProgress({
						progress: hasHyperframes
							? 20 + remotionProgress.overallProgress * 0.8
							: remotionProgress.overallProgress,
						status: remotionProgress.statusMessage,
						isExporting: true,
					});
				});
			} else {
				blob = await exportEngine.export((progress, status) => {
					if (cancellationState.cancelled) return;
					updateProgress({
						progress: hasHyperframes ? 20 + progress * 0.8 : progress,
						status,
						isExporting: true,
					});
				});
			}
			throwIfCancelled();

			debugLog("[ExportPanel] ✅ Export completed successfully");

			// Calculate export duration
			const exportDuration = Date.now() - startTime.getTime();

			// Save/download via platform-aware output
			throwIfCancelled();
			const saveResult = await saveExportedVideo(
				blob,
				exportSettings.filename,
				exportSettings.outputPath
			);
			throwIfCancelled();
			if (!saveResult.success) {
				throw new Error(saveResult.error || "Failed to save exported video");
			}

			addToHistory({
				filename: exportSettings.filename,
				settings: {
					quality: exportSettings.quality,
					format: exportSettings.format,
					filename: exportSettings.filename,
					width: exportSettings.resolution.width,
					height: exportSettings.resolution.height,
					frameRate: exportSettings.frameRate,
				},
				duration: exportDuration,
				fileSize: blob.size,
				success: true,
			});
			setExportStartTime(null);

			// Show success message
			toast.success("Export completed successfully!", {
				description: saveResult.filePath || exportSettings.filename,
			});
			if (useAppSettingsStore.getState().exportCompletionSound) {
				playCompletionChime({ kind: "success" });
			}

			// Reset export state
			updateProgress({
				progress: 100,
				status: "Export completed",
				isExporting: false,
			});

			// Clean up engine reference
			if (currentEngineRef.current === exportEngineForRun) {
				currentEngineRef.current = null;
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (cancellationState.cancelled) {
				if (exportCancellationRef.current === cancellationState) {
					updateProgress({
						progress: 0,
						status: "Export cancelled",
						isExporting: false,
					});
					setExportStartTime(null);
				}
				if (currentEngineRef.current === exportEngineForRun) {
					currentEngineRef.current = null;
				}
				return;
			}
			debugError("[ExportPanel] Export failed:", message);

			// Calculate partial export duration
			const exportDuration = Date.now() - startTime.getTime();

			// Add failed attempt to history
			addToHistory({
				filename: exportSettings.filename,
				settings: {
					quality: exportSettings.quality,
					format: exportSettings.format,
					filename: exportSettings.filename,
					width: exportSettings.resolution.width,
					height: exportSettings.resolution.height,
					frameRate: exportSettings.frameRate,
				},
				duration: exportDuration,
				fileSize: 0,
				success: false,
				error: message,
			});

			setError(message);

			updateProgress({
				progress: 0,
				status: `Export failed: ${message}`,
				isExporting: false,
			});

			// Reset timing state
			setExportStartTime(null);

			// Clean up engine reference
			if (currentEngineRef.current === exportEngineForRun) {
				currentEngineRef.current = null;
			}

			// Show error toast
			toast.error("Export failed", {
				description: message,
			});
			if (useAppSettingsStore.getState().exportCompletionSound) {
				playCompletionChime({ kind: "error" });
			}
		} finally {
			await hyperframesController?.cleanup();
			if (hyperframesControllerRef.current === hyperframesController) {
				hyperframesControllerRef.current = null;
			}
			if (
				exportCancellationRef.current === cancellationState &&
				!cancellationState.cancelled
			) {
				exportCancellationRef.current = null;
			}
			// ALWAYS release the export lock, even on error
			// This ensures blob URLs can be cleaned up after export completes/fails
			unlockFromExport();
		}
	};

	return {
		progress,
		exportStartTime,
		currentEngineRef,
		handleCancel,
		handleExport,
	};
}
