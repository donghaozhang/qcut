/**
 * Streams live export progress from the renderer back into the main-process
 * export job, so CLI/HTTP pollers see real frame counts instead of the 0.01
 * "dispatched" sentinel. The Claude export bridge sets the active job id for
 * the duration of one export; engines report frames through it.
 */

const REPORT_INTERVAL_MS = 500;
const MAX_STREAMED_PROGRESS = 0.99;

let activeJobId: string | null = null;
let lastReportAtMs = 0;
let exportStartedAtMs = 0;

export function setActiveExportJob({ jobId }: { jobId: string | null }): void {
	activeJobId = jobId;
	lastReportAtMs = 0;
	exportStartedAtMs = performance.now();
}

/**
 * Report frame-level progress (throttled). `progressPercent` uses the engine
 * callback's 0–100 scale; the job stores 0–1 and never reaches 1 from here —
 * the main process writes the final 1 after verifying the output file.
 */
export function reportExportFrameProgress({
	progressPercent,
	currentFrame,
	totalFrames,
}: {
	progressPercent: number;
	currentFrame?: number;
	totalFrames?: number;
}): void {
	if (!activeJobId) return;
	const now = performance.now();
	if (now - lastReportAtMs < REPORT_INTERVAL_MS) return;
	lastReportAtMs = now;

	const elapsedSeconds = (now - exportStartedAtMs) / 1000;
	const fps =
		currentFrame && elapsedSeconds > 0
			? currentFrame / elapsedSeconds
			: undefined;
	const estimatedTimeRemaining =
		fps && currentFrame !== undefined && totalFrames && fps > 0
			? Math.max(0, (totalFrames - currentFrame) / fps)
			: undefined;
	try {
		window.electronAPI?.claude?.export?.reportExportProgress?.({
			jobId: activeJobId,
			progress: Math.min(MAX_STREAMED_PROGRESS, progressPercent / 100),
			...(currentFrame !== undefined ? { currentFrame } : {}),
			...(totalFrames !== undefined ? { totalFrames } : {}),
			...(fps !== undefined ? { fps: Math.round(fps * 10) / 10 } : {}),
			...(estimatedTimeRemaining !== undefined
				? { estimatedTimeRemaining: Math.round(estimatedTimeRemaining) }
				: {}),
		});
	} catch {
		// Progress streaming must never break the export.
	}
}
