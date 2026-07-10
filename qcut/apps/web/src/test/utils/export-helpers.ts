import { useExportStore } from "@/stores/export-store";
import { ExportFormat, ExportQuality } from "@/types/export";
import { waitForCondition } from "./async-helpers";

export async function waitForExportComplete(timeout = 30_000): Promise<void> {
	await waitForCondition(
		() => {
			const { progress } = useExportStore.getState();
			return !progress.isExporting && progress.progress >= 100;
		},
		{
			timeout,
			message: "Export did not complete",
		}
	);
}

export function mockExportProgress(
	progressValue: number,
	message = "Exporting..."
) {
	useExportStore.setState({
		progress: {
			progress: progressValue,
			status: message,
			isExporting: progressValue < 100,
			currentFrame: Math.floor((progressValue / 100) * 1000),
			totalFrames: 1000,
			estimatedTimeRemaining: Math.max(0, 100 - progressValue),
		},
	});
}

export type ExportSettingsSnapshot = {
	format: ExportFormat;
	quality: ExportQuality;
	resolution: string;
	fps: number;
};

export function getExportSettings(): ExportSettingsSnapshot {
	const { settings } = useExportStore.getState();
	return {
		format: settings.format ?? ExportFormat.WEBM,
		quality: settings.quality ?? ExportQuality.HIGH,
		resolution: `${settings.width ?? 1920}x${settings.height ?? 1080}`,
		fps: settings.frameRate ?? 30,
	};
}
