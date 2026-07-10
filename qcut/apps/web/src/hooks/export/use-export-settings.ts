import { useState, useEffect } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	ExportQuality,
	ExportFormat,
	QUALITY_RESOLUTIONS,
	FORMAT_INFO,
	getSupportedFormats,
	getEstimatedExportSize,
	getExportFilename,
	type ExportFrameRate,
} from "@/types/export";
import { useElectron } from "@/hooks/useElectron";
import { platform } from "@qcut/platform-core";
// Export engine factory and types will be imported dynamically when needed
import { debugLog, debugWarn } from "@/lib/debug/debug-config";

/**
 * Hook for managing export settings state, derived metadata (supported formats, resolution, size estimates),
 * and change handlers. `engineRecommendation` is a transient hint and may be null when unavailable.
 */
export function useExportSettings() {
	const { isDialogOpen, panelView, settings, updateSettings } =
		useExportStore();
	const { getTotalDuration, tracks } = useTimelineStore();
	const { isElectron } = useElectron();
	const isExportUiActive = isDialogOpen || panelView === "export";

	const [quality, setQuality] = useState<ExportQuality>(settings.quality);
	const [format, setFormat] = useState<ExportFormat>(settings.format);
	const [filename, setFilename] = useState(settings.filename);
	const [frameRate, setFrameRate] = useState<ExportFrameRate>(
		settings.frameRate ?? 30
	);
	const [engineType, setEngineType] = useState<"standard" | "ffmpeg" | "cli">(
		isElectron() ? "cli" : "standard"
	);
	const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
	const [engineRecommendation, setEngineRecommendation] = useState<
		string | null
	>(null);

	const supportedFormats = isElectron()
		? [ExportFormat.MP4, ExportFormat.GIF]
		: getSupportedFormats();
	const resolution =
		QUALITY_RESOLUTIONS[quality] || QUALITY_RESOLUTIONS[ExportQuality.HIGH];
	const timelineDuration = getTotalDuration();
	const estimatedSize = getEstimatedExportSize({
		quality,
		durationSeconds: timelineDuration,
	});
	const outputPath = settings.outputPath ?? "";

	// Engine recommendation effect with multiple dependencies
	useEffect(() => {
		if (isExportUiActive && timelineDuration > 0) {
			let aborted = false;
			const getRecommendation = async () => {
				try {
					// Dynamically import export engine factory
					const { ExportEngineFactory, ExportEngineType } = await import(
						"@/lib/export/export-engine-factory"
					);

					const factory = ExportEngineFactory.getInstance();
					const recommendation = await factory.getEngineRecommendation(
						{
							...settings,
							quality,
							format,
							width: resolution.width,
							height: resolution.height,
						},
						timelineDuration,
						"medium",
						tracks
					);

					if (aborted) return;

					const engineLabels = {
						[ExportEngineType.STANDARD]: "Standard Engine",
						[ExportEngineType.OPTIMIZED]: "Optimized Engine",
						[ExportEngineType.WEBCODECS]: "WebCodecs Engine",
						[ExportEngineType.MUXER]: "WebCodecs (Hardware H.264)",
						[ExportEngineType.FFMPEG]: "FFmpeg Engine",
						[ExportEngineType.CLI]: "Native FFmpeg CLI",
						[ExportEngineType.REMOTION]: "Remotion Engine",
					};

					const label = engineLabels[recommendation.engineType];
					const performance =
						recommendation.estimatedPerformance.charAt(0).toUpperCase() +
						recommendation.estimatedPerformance.slice(1);

					setEngineRecommendation(`${label} (${performance} Performance)`);
				} catch (error) {
					if (!aborted) {
						debugWarn("Failed to get engine recommendation:", error);
						setEngineRecommendation(null);
					}
				}
			};

			getRecommendation();
			return () => {
				aborted = true;
			};
		}
	}, [
		isExportUiActive,
		quality,
		format,
		timelineDuration,
		resolution.width,
		resolution.height,
		settings,
		tracks,
	]);

	useEffect(() => {
		// Dynamically import export engine factory for FFmpeg availability check
		let cancelled = false;
		import("@/lib/export/export-engine-factory")
			.then(({ ExportEngineFactory }) =>
				ExportEngineFactory.isFFmpegAvailable()
			)
			.then((available) => {
				if (!cancelled) setFfmpegAvailable(available);
			})
			.catch((err) => {
				debugWarn("FFmpeg availability check failed:", err);
				if (!cancelled) setFfmpegAvailable(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleQualityChange = (newQuality: ExportQuality) => {
		setQuality(newQuality);
		updateSettings({ quality: newQuality });
	};

	const handleFormatChange = (newFormat: ExportFormat) => {
		const supportedFormat =
			isElectron() &&
			newFormat !== ExportFormat.MP4 &&
			newFormat !== ExportFormat.GIF
				? ExportFormat.MP4
				: newFormat;
		debugLog("Format changing from", format, "to", supportedFormat);
		setFormat(supportedFormat);
		updateSettings({ format: supportedFormat, outputPath: undefined });
	};

	const handleFilenameChange = (newFilename: string) => {
		setFilename(newFilename);
		updateSettings({ filename: newFilename, outputPath: undefined });
	};

	const handleFrameRateChange = (newFrameRate: ExportFrameRate) => {
		setFrameRate(newFrameRate);
		updateSettings({ frameRate: newFrameRate });
	};

	const chooseOutputPath = async (): Promise<string | null> => {
		if (!isElectron()) return null;
		const exportFilename = getExportFilename({ filename, format });
		const selectedPath = await platform().files.saveFileDialog(exportFilename, [
			{
				name: `${FORMAT_INFO[format].label} Export`,
				extensions: [FORMAT_INFO[format].extension.slice(1)],
			},
		]);
		if (selectedPath) updateSettings({ outputPath: selectedPath });
		return selectedPath;
	};

	return {
		// State values
		quality,
		format,
		filename,
		frameRate,
		outputPath,
		engineType,
		ffmpegAvailable,
		engineRecommendation,
		supportedFormats,
		resolution,
		estimatedSize,
		timelineDuration,
		// Handlers
		handleQualityChange,
		handleFormatChange,
		handleFilenameChange,
		handleFrameRateChange,
		chooseOutputPath,
		setEngineType,
		// Store integration
		updateSettings,
	};
}
