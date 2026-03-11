import { useEffect, useRef } from "react";
import { useState } from "react";
import { useExportStore } from "@/stores/export-store";
import { PanelView } from "@/types/panel";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { ExportCanvas, ExportCanvasRef } from "@/components/export-canvas";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, X, Square } from "lucide-react";
import { useElectron } from "@/hooks/useElectron";
import {
	extractCaptionSegments,
	downloadCaptions,
	type CaptionFormat,
} from "@/lib/captions/caption-export";

// Custom hook imports
import type { ExportFormat, ExportQuality } from "@/types/export";
import { useExportSettings } from "@/hooks/export/use-export-settings";
import { useExportProgress } from "@/hooks/export/use-export-progress";
import { debugLog, debugWarn } from "@/lib/debug/debug-config";
import { useExportValidation } from "@/hooks/export/use-export-validation";
import { useExportPresets } from "@/hooks/export/use-export-presets";

// Audio export configuration
import {
	setAudioExportConfig,
	getCodecForFormat,
} from "@/lib/export/audio-export-config";
import { detectAudioSources } from "@/lib/export-cli/sources";

// Sub-components
import {
	PresetGrid,
	FilenameCard,
	QualityCard,
	EngineCard,
	FormatCard,
	DetailsCard,
} from "./export-settings-cards";
import { CaptionExportCard, AudioExportCard } from "./export-media-cards";
import { ExportWarnings } from "./export-warnings";

export function ExportDialog() {
	const { error } = useExportStore();
	const { getTotalDuration, tracks } = useTimelineStore();
	const { mediaItems, loading: mediaItemsLoading } = useAsyncMediaItems();

	// Caption export state
	const [exportCaptionsEnabled, setExportCaptionsEnabled] = useState(false);
	const [captionFormat, setCaptionFormat] = useState<CaptionFormat>("srt");

	// Audio export state (non-breaking addition)
	const [includeAudio, setIncludeAudio] = useState(true); // Default to true for backward compatibility

	// Check if there are caption tracks available
	const hasCaptions = tracks.some(
		(track) => track.type === "captions" && track.elements.length > 0
	);

	// Check if there are audio sources available (audio tracks + video audio)
	const { hasAudio } = detectAudioSources(tracks, mediaItems);

	const canvasRef = useRef<ExportCanvasRef>(null);
	const { isElectron } = useElectron();

	// Custom hooks for export state management
	const exportSettings = useExportSettings();
	const exportProgress = useExportProgress();
	const exportValidation = useExportValidation(
		{
			quality: exportSettings.quality,
			format: exportSettings.format,
			filename: exportSettings.filename,
			width: exportSettings.resolution.width,
			height: exportSettings.resolution.height,
		},
		exportSettings.timelineDuration
	);
	const exportPresets = useExportPresets(
		exportSettings.handleQualityChange,
		exportSettings.handleFormatChange,
		exportSettings.handleFilenameChange,
		exportSettings.updateSettings
	);

	// Expose export actions for iPad CLI automation (qcut://export)
	useEffect(() => {
		const exportActions = {
			export: async (settings: {
				quality: string;
				format: string;
				filename: string;
			}) => {
				const canvas = canvasRef.current?.getCanvas();
				if (!canvas) throw new Error("No canvas available for export");
				canvasRef.current?.updateDimensions();

				const audioCodec = getCodecForFormat(settings.format as ExportFormat);
				setAudioExportConfig({
					enabled: hasAudio,
					codec: audioCodec,
					bitrate: 128,
				});

				const qualityResolutions: Record<
					string,
					{ width: number; height: number }
				> = {
					"1080p": { width: 1920, height: 1080 },
					"720p": { width: 1280, height: 720 },
					"480p": { width: 854, height: 480 },
				};
				const resolution =
					qualityResolutions[settings.quality] || qualityResolutions["720p"];

				return exportProgress.handleExport(
					canvas,
					exportSettings.timelineDuration,
					{
						quality: settings.quality as ExportQuality,
						format: settings.format as ExportFormat,
						filename: settings.filename,
						engineType: "auto",
						resolution,
						includeAudio: hasAudio,
						audioCodec,
						audioBitrate: 128,
					}
				);
			},
		};
		(window as any).__exportActions = exportActions;
		return () => {
			delete (window as any).__exportActions;
		};
	}, [exportProgress.handleExport, exportSettings.timelineDuration, hasAudio]);

	const handleClose = () => {
		if (!exportProgress.progress.isExporting) {
			// Switch back to properties view when closing export
			const { setPanelView } = useExportStore.getState();
			setPanelView(PanelView.PROPERTIES);
		}
	};

	const handleExport = async (e?: React.MouseEvent) => {
		e?.preventDefault();
		e?.stopPropagation();
		debugLog("[ExportPanel] handleExport clicked", {
			canExport: exportValidation.canExport,
			timelineDuration: exportSettings.timelineDuration,
			mediaItemsCount: mediaItems.length,
			exportCaptionsEnabled,
		});

		if (!exportValidation.canExport) {
			debugWarn("[ExportPanel] cannot export: validation failed", {
				hasTimelineContent: exportValidation.hasTimelineContent,
				timelineDuration: exportSettings.timelineDuration,
				hasValidFilename: exportValidation.hasValidFilename,
			});
			return;
		}

		const canvas = canvasRef.current?.getCanvas();
		if (!canvas) {
			debugWarn("[ExportPanel] canvas not available for export");
			useExportStore.getState().setError("Canvas not available for export");
			return;
		}

		canvasRef.current?.updateDimensions();

		debugLog("[ExportPanel] starting export", {
			engineType: exportSettings.engineType,
			quality: exportSettings.quality,
			format: exportSettings.format,
			resolution: exportSettings.resolution,
		});

		// Export captions separately if enabled
		if (exportCaptionsEnabled && hasCaptions) {
			try {
				const captionSegments = extractCaptionSegments(tracks);
				if (captionSegments.length > 0) {
					downloadCaptions(
						captionSegments,
						captionFormat,
						exportSettings.filename,
						{ format: captionFormat }
					);
					debugLog("[ExportPanel] Caption export successful", {
						segmentCount: captionSegments.length,
						format: captionFormat,
					});
				}
			} catch (captionError) {
				debugWarn("[ExportPanel] Caption export failed", captionError);
				// Don't block video export if caption export fails
			}
		}

		// Sync audio settings globally
		const audioCodec = getCodecForFormat(exportSettings.format);
		const audioEnabled = includeAudio && hasAudio;
		setAudioExportConfig({
			enabled: audioEnabled,
			codec: audioCodec,
			bitrate: 128,
		});

		// Also sync with export store (if available)
		const exportStore = useExportStore.getState();
		if (exportStore.updateAudioSettings) {
			exportStore.updateAudioSettings({
				enabled: audioEnabled,
				codec: audioCodec,
			});
		}

		await exportProgress.handleExport(canvas, exportSettings.timelineDuration, {
			quality: exportSettings.quality,
			format: exportSettings.format,
			filename: exportSettings.filename,
			engineType: exportSettings.engineType,
			resolution: exportSettings.resolution,
			includeAudio: audioEnabled,
			audioCodec,
			audioBitrate: 128,
		});
	};

	if (mediaItemsLoading) {
		return (
			<div className="h-full flex flex-col bg-background p-4">
				<div className="flex-1 flex items-center justify-center p-4">
					<div className="flex items-center space-x-2">
						<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
						<span>Loading export dialog...</span>
					</div>
				</div>
			</div>
		);
	}

	const isExporting = exportProgress.progress.isExporting;

	return (
		<div
			className="h-full flex flex-col bg-background p-4"
			data-testid="export-dialog"
		>
			<div className="flex items-center justify-between p-4 border-b border-border">
				<div>
					<h2 className="text-lg font-semibold">Export Video</h2>
					<p className="text-sm text-muted-foreground">
						Configure export settings and render your video
					</p>
				</div>
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={handleClose}
					disabled={isExporting}
					className="h-8 w-8"
					aria-label="Close export dialog"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="p-4 border-b border-border space-y-4">
				{isExporting ? (
					<div className="space-y-2">
						<Button
							type="button"
							onClick={exportProgress.handleCancel}
							variant="destructive"
							className="w-full"
							size="lg"
						>
							<Square className="w-4 h-4 mr-2" />
							Cancel Export
						</Button>
						<p className="text-xs text-muted-foreground text-center">
							Export in progress - click to cancel
						</p>
					</div>
				) : (
					<Button
						type="button"
						onClick={handleExport}
						disabled={!exportValidation.canExport}
						className="w-full"
						size="lg"
						data-testid="export-start-button"
					>
						<Download className="w-4 h-4 mr-2" />
						Export Video
					</Button>
				)}

				{isExporting && (
					<div className="space-y-3 p-4 bg-muted/50 rounded-md">
						<div className="flex justify-between text-sm">
							<span className="font-medium">Export Progress</span>
							<span>{exportProgress.progress.progress.toFixed(0)}%</span>
						</div>
						<Progress
							value={exportProgress.progress.progress}
							className="w-full"
							data-testid="export-progress-bar"
						/>
						<p
							className="text-sm text-muted-foreground"
							data-testid="export-status"
						>
							{exportProgress.progress.status}
						</p>

						{/* Advanced Progress Information */}
						{exportProgress.progress.currentFrame > 0 &&
							exportProgress.progress.totalFrames > 0 && (
								<div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
									<div>
										<span className="font-medium">Frames:</span>
										<span className="ml-1">
											{exportProgress.progress.currentFrame} /{" "}
											{exportProgress.progress.totalFrames}
										</span>
									</div>
									{exportProgress.progress.encodingSpeed &&
										exportProgress.progress.encodingSpeed > 0 && (
											<div>
												<span className="font-medium">Speed:</span>
												<span className="ml-1">
													{exportProgress.progress.encodingSpeed.toFixed(1)} fps
												</span>
											</div>
										)}
									{exportProgress.progress.elapsedTime &&
										exportProgress.progress.elapsedTime > 0 && (
											<div>
												<span className="font-medium">Elapsed:</span>
												<span className="ml-1">
													{exportProgress.progress.elapsedTime.toFixed(1)}s
												</span>
											</div>
										)}
								</div>
							)}
					</div>
				)}
			</div>

			{/* Settings Section - Scrollable Content */}
			<div className="flex-1 overflow-auto p-4 space-y-2">
				<FilenameCard
					filename={exportSettings.filename}
					onFilenameChange={exportSettings.handleFilenameChange}
					hasValidFilename={exportValidation.hasValidFilename}
					isExporting={isExporting}
				/>

				<QualityCard
					quality={exportSettings.quality}
					estimatedSize={exportSettings.estimatedSize}
					onQualityChange={exportSettings.handleQualityChange}
					isExporting={isExporting}
				/>

				<EngineCard
					engineType={exportSettings.engineType}
					ffmpegAvailable={exportSettings.ffmpegAvailable}
					isElectron={isElectron()}
					onEngineTypeChange={exportSettings.setEngineType}
					isExporting={isExporting}
				/>

				<FormatCard
					format={exportSettings.format}
					supportedFormats={exportSettings.supportedFormats}
					onFormatChange={exportSettings.handleFormatChange}
					isExporting={isExporting}
				/>

				<DetailsCard
					resolution={exportSettings.resolution}
					estimatedSize={exportSettings.estimatedSize}
					timelineDuration={exportSettings.timelineDuration}
					format={exportSettings.format}
					engineRecommendation={exportSettings.engineRecommendation}
				/>

				{/* Caption Export Section */}
				{hasCaptions && (
					<CaptionExportCard
						exportCaptionsEnabled={exportCaptionsEnabled}
						onExportCaptionsChange={setExportCaptionsEnabled}
						captionFormat={captionFormat}
						onCaptionFormatChange={setCaptionFormat}
						filename={exportSettings.filename}
						isExporting={isExporting}
					/>
				)}

				{/* Audio Export Section */}
				{hasAudio && (
					<AudioExportCard
						includeAudio={includeAudio}
						onIncludeAudioChange={setIncludeAudio}
						isExporting={isExporting}
					/>
				)}

				{/* Templates at bottom, collapsed by default */}
				<PresetGrid
					selectedPreset={exportPresets.selectedPreset}
					onPresetSelect={exportPresets.handlePresetSelect}
					onClearPreset={exportPresets.clearPreset}
					isExporting={isExporting}
				/>

				<ExportWarnings
					memoryWarning={exportValidation.memoryWarning}
					memoryEstimate={exportValidation.memoryEstimate}
					hasTimelineContent={exportValidation.hasTimelineContent}
					isShortVideo={exportValidation.isShortVideo}
					timelineDuration={exportSettings.timelineDuration}
					error={error}
				/>
			</div>

			<ExportCanvas ref={canvasRef} />
		</div>
	);
}
