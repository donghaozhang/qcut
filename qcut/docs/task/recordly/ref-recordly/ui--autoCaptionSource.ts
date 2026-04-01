import { fromFileUrl } from "./projectPersistence";

type AutoCaptionSourceOptions = {
	videoSourcePath?: string | null;
	videoPath?: string | null;
	recordingSessionVideoPath?: string | null;
	currentVideoPath?: string | null;
};

export function resolveAutoCaptionSourcePath(options: AutoCaptionSourceOptions): string | null {
	if (options.videoSourcePath) {
		return options.videoSourcePath;
	}

	if (options.videoPath) {
		return fromFileUrl(options.videoPath);
	}

	if (options.recordingSessionVideoPath) {
		return fromFileUrl(options.recordingSessionVideoPath);
	}

	if (options.currentVideoPath) {
		return fromFileUrl(options.currentVideoPath);
	}

	return null;
}
