/**
 * Audio File Validation for CLI Export
 *
 * Validates audio files in parallel before sending to FFmpeg.
 * Checks file existence, size, and format via ffprobe.
 */

import { debugLog, debugWarn } from "@/lib/debug/debug-config";
import type { AudioFileInput } from "../export-cli/types";
import {
	fileExists,
	getFileInfo,
	validateAudioWithFfprobe,
} from "./export-engine-cli-utils";

/** Validates audio files in parallel via ffprobe, filtering out missing, empty, or invalid files. */
export async function validateAudioFiles(
	audioFiles: AudioFileInput[]
): Promise<AudioFileInput[]> {
	debugLog("[CLI Export] Starting parallel validation of audio files...");

	const validationResults = await Promise.all(
		audioFiles.map(async (audioFile, index) => {
			debugLog(
				`[CLI Export] Validating audio file ${index}: ${audioFile.path}`
			);

			try {
				const exists = await fileExists({ filePath: audioFile.path });
				debugLog(`[CLI Export] Audio file ${index} exists: ${exists}`);

				if (!exists) {
					debugWarn(
						`[CLI Export] Skipping missing audio file: ${audioFile.path}`
					);
					return null;
				}

				const fileInfo = await getFileInfo({ filePath: audioFile.path });
				if (!fileInfo) {
					debugWarn(
						`[CLI Export] Skipping audio file with unavailable metadata: ${audioFile.path}`
					);
					return null;
				}
				debugLog(
					`[CLI Export] Audio file ${index} size: ${fileInfo.size} bytes`
				);

				if (fileInfo.size === 0) {
					debugWarn(
						`[CLI Export] Skipping empty audio file: ${audioFile.path}`
					);
					return null;
				}

				debugLog(
					`[CLI Export] Validating audio file ${index} format with ffprobe...`
				);

				const audioValidation = await validateAudioWithFfprobe({
					filePath: audioFile.path,
				});
				if (!audioValidation) {
					debugWarn(
						`[CLI Export] ffprobe validation unavailable; keeping audio file by fallback: ${audioFile.path}`
					);
					return audioFile;
				}

				debugLog(
					`[CLI Export] Audio file ${index} validation result:`,
					audioValidation
				);

				if (!audioValidation.valid) {
					debugWarn(
						`[CLI Export] Skipping invalid audio file: ${audioFile.path} (${audioValidation.error || "Unknown validation error"})`
					);
					return null;
				}

				debugLog(`[CLI Export] Audio file ${index} validated successfully:`, {
					path: audioFile.path,
					hasAudio: audioValidation.hasAudio,
					duration: audioValidation.duration,
					streams: audioValidation.info?.streams?.length || 0,
				});

				if (!audioValidation.hasAudio) {
					debugWarn(
						`[CLI Export] File has no audio streams: ${audioFile.path}`
					);
					return null;
				}

				return audioFile;
			} catch (error) {
				debugWarn(
					`[CLI Export] Skipping audio file ${audioFile.path} after validation error:`,
					error
				);
				return null;
			}
		})
	);

	const validFiles = validationResults.filter(
		(file): file is AudioFileInput => file !== null
	);

	debugLog(
		`[CLI Export] Validation complete. ${validFiles.length} valid audio files.`
	);

	return validFiles;
}
