import type { AudioFile } from "./types";
import { probeHasAudioStream } from "./probe";

type AudioStreamProbe = ({
	mediaPath,
}: {
	mediaPath: string;
}) => Promise<boolean>;

export interface AudioInputValidationResult {
	audioFiles: AudioFile[];
	skippedPaths: string[];
	unverifiedPaths: string[];
}

/** Prevents filter graphs from referencing `[input:a]` on video-only files. */
export async function validateAudioInputStreams({
	audioFiles,
	probe = probeHasAudioStream,
}: {
	audioFiles: AudioFile[];
	probe?: AudioStreamProbe;
}): Promise<AudioInputValidationResult> {
	const results = await Promise.all(
		audioFiles.map(async (audioFile) => {
			try {
				return {
					audioFile,
					hasAudio: await probe({ mediaPath: audioFile.path }),
					verified: true,
				};
			} catch {
				return { audioFile, hasAudio: true, verified: false };
			}
		})
	);

	return {
		audioFiles: results
			.filter((result) => result.hasAudio)
			.map((result) => result.audioFile),
		skippedPaths: results
			.filter((result) => result.verified && !result.hasAudio)
			.map((result) => result.audioFile.path),
		unverifiedPaths: results
			.filter((result) => !result.verified)
			.map((result) => result.audioFile.path),
	};
}
