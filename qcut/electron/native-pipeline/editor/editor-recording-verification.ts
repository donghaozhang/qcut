import * as fs from "node:fs/promises";
import { probeMediaDurationMs, probeVideoFile } from "../../ffmpeg/utils.js";

export interface RecordingArtifactVerification {
	outputPath: string;
	bytes: number;
	actualDurationMs?: number;
	expectedDurationMs?: number;
	durationShortfallMs?: number;
	toleranceMs: number;
	durationVerified: boolean;
	actualWidth?: number;
	actualHeight?: number;
	minimumWidth?: number;
	minimumHeight?: number;
	resolutionVerified: boolean;
}

interface RecordingVideoProbe {
	width: number;
	height: number;
}

async function probeRecordingVideo({
	mediaPath,
}: {
	mediaPath: string;
}): Promise<RecordingVideoProbe> {
	return await probeVideoFile(mediaPath);
}

export async function verifyRecordingArtifact({
	filePath,
	expectedDurationMs,
	toleranceMs = 250,
	verifyDuration = true,
	verifyResolution = false,
	minimumWidth = 1920,
	minimumHeight = 1080,
	probeDuration = probeMediaDurationMs,
	probeVideo = probeRecordingVideo,
}: {
	filePath: string;
	expectedDurationMs?: number;
	toleranceMs?: number;
	verifyDuration?: boolean;
	verifyResolution?: boolean;
	minimumWidth?: number;
	minimumHeight?: number;
	probeDuration?: (options: { mediaPath: string }) => Promise<number>;
	probeVideo?: (options: { mediaPath: string }) => Promise<RecordingVideoProbe>;
}): Promise<RecordingArtifactVerification> {
	const stats = await fs.stat(filePath);
	if (stats.size <= 0) {
		throw new Error("Demo screen recording is empty");
	}
	const normalizedToleranceMs = Math.max(0, toleranceMs);
	const normalizedMinimumWidth = Math.max(1, Math.round(minimumWidth));
	const normalizedMinimumHeight = Math.max(1, Math.round(minimumHeight));
	let actualWidth: number | undefined;
	let actualHeight: number | undefined;
	if (verifyResolution) {
		const video = await probeVideo({ mediaPath: filePath });
		actualWidth = video.width;
		actualHeight = video.height;
		if (
			actualWidth < normalizedMinimumWidth ||
			actualHeight < normalizedMinimumHeight
		) {
			throw new Error(
				`Demo recording is ${actualWidth}x${actualHeight}; minimum is ${normalizedMinimumWidth}x${normalizedMinimumHeight}`
			);
		}
	}

	const actualDurationMs = verifyDuration
		? await probeDuration({ mediaPath: filePath })
		: undefined;
	const durationShortfallMs =
		!verifyDuration ||
		actualDurationMs === undefined ||
		expectedDurationMs === undefined
			? 0
			: Math.max(0, expectedDurationMs - actualDurationMs);
	if (verifyDuration && durationShortfallMs > normalizedToleranceMs) {
		throw new Error(
			`Demo recording is ${Math.round(durationShortfallMs)}ms shorter than its capture lifecycle (allowed ${normalizedToleranceMs}ms)`
		);
	}

	return {
		outputPath: filePath,
		bytes: stats.size,
		actualDurationMs,
		expectedDurationMs,
		durationShortfallMs,
		toleranceMs: normalizedToleranceMs,
		durationVerified: verifyDuration,
		actualWidth,
		actualHeight,
		minimumWidth: verifyResolution ? normalizedMinimumWidth : undefined,
		minimumHeight: verifyResolution ? normalizedMinimumHeight : undefined,
		resolutionVerified: verifyResolution,
	};
}
