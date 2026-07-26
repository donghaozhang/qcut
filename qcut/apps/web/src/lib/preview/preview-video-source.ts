import type { VideoSource } from "@/lib/media/media-source";

export type PreviewVideoSourceKind = "source" | "proxy";

export interface PreviewVideoSourceResolution {
	videoSource: VideoSource;
	sourceKind: PreviewVideoSourceKind;
	sourceTimeOffset: number;
}

export function resolvePreviewVideoSource({
	source,
	proxySource,
	proxyReady,
	isPlaying,
	proxySourceTimeOffset,
}: {
	source: VideoSource;
	proxySource: VideoSource | null;
	proxyReady: boolean;
	isPlaying: boolean;
	proxySourceTimeOffset: number;
}): PreviewVideoSourceResolution {
	const useProxy = isPlaying && proxyReady && Boolean(proxySource);
	if (!useProxy) {
		return {
			videoSource: source,
			sourceKind: "source",
			sourceTimeOffset: 0,
		};
	}

	return {
		videoSource: proxySource,
		sourceKind: "proxy",
		sourceTimeOffset: proxySourceTimeOffset,
	};
}
