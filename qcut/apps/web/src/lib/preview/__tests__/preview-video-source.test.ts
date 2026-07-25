import { describe, expect, it } from "vitest";
import type { VideoSource } from "@/lib/media/media-source";
import { resolvePreviewVideoSource } from "../preview-video-source";

const source: VideoSource = { type: "remote", src: "file:///source.mp4" };
const proxySource: VideoSource = {
	type: "remote",
	src: "app://video-preview-proxy/proxy.mp4",
};

describe("resolvePreviewVideoSource", () => {
	it("uses the proxy only during playback", () => {
		expect(
			resolvePreviewVideoSource({
				source,
				proxySource,
				proxyReady: true,
				isPlaying: true,
				proxySourceTimeOffset: 8,
			})
		).toEqual({
			videoSource: proxySource,
			sourceKind: "proxy",
			sourceTimeOffset: 8,
		});

		expect(
			resolvePreviewVideoSource({
				source,
				proxySource,
				proxyReady: true,
				isPlaying: false,
				proxySourceTimeOffset: 8,
			})
		).toEqual({
			videoSource: source,
			sourceKind: "source",
			sourceTimeOffset: 0,
		});
	});

	it("keeps the source while a proxy is missing or still rendering", () => {
		expect(
			resolvePreviewVideoSource({
				source,
				proxySource,
				proxyReady: false,
				isPlaying: true,
				proxySourceTimeOffset: 8,
			}).sourceKind
		).toBe("source");
		expect(
			resolvePreviewVideoSource({
				source,
				proxySource: null,
				proxyReady: true,
				isPlaying: true,
				proxySourceTimeOffset: 8,
			}).sourceKind
		).toBe("source");
	});
});
