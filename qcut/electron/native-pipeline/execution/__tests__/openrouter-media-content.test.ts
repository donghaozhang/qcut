import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildOpenRouterMultiImageContent,
	buildOpenRouterSingleMediaContent,
	toOpenRouterMediaUrl,
} from "../openrouter-media-content.js";

describe("openrouter media content helpers", () => {
	it("passes through remote and data URLs", () => {
		expect(toOpenRouterMediaUrl({ input: "https://example.com/a.jpg" })).toBe(
			"https://example.com/a.jpg"
		);
		expect(toOpenRouterMediaUrl({ input: "data:image/png;base64,abc" })).toBe(
			"data:image/png;base64,abc"
		);
	});

	it("encodes local files as data URLs", () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "qcut-openrouter-media-"));
		const filePath = path.join(dir, "frame.jpg");
		writeFileSync(filePath, "abc");

		const url = toOpenRouterMediaUrl({ input: filePath });

		expect(url).toBe("data:image/jpeg;base64,YWJj");
	});

	it("builds single image and video content", () => {
		expect(
			buildOpenRouterSingleMediaContent({
				prompt: "look",
				mediaUrl: "image-url",
				mediaKind: "image",
			})
		).toEqual([
			{ type: "text", text: "look" },
			{ type: "image_url", image_url: { url: "image-url" } },
		]);

		expect(
			buildOpenRouterSingleMediaContent({
				prompt: "watch",
				mediaUrl: "video-url",
				mediaKind: "video",
			})
		).toEqual([
			{ type: "text", text: "watch" },
			{ type: "video_url", video_url: { url: "video-url" } },
		]);
	});

	it("preserves multi-image order", () => {
		expect(
			buildOpenRouterMultiImageContent({
				prompt: "compare",
				imageUrls: ["ref", "frame-1", "frame-2"],
			})
		).toEqual([
			{ type: "text", text: "compare" },
			{ type: "image_url", image_url: { url: "ref" } },
			{ type: "image_url", image_url: { url: "frame-1" } },
			{ type: "image_url", image_url: { url: "frame-2" } },
		]);
	});
});
