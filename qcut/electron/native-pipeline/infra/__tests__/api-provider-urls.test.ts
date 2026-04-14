import { describe, expect, it } from "vitest";

import { extractOutputUrl } from "../api-provider-urls.js";

describe("extractOutputUrl", () => {
	it("returns undefined for null/non-object input", () => {
		expect(extractOutputUrl(null)).toBeUndefined();
		expect(extractOutputUrl(undefined)).toBeUndefined();
		expect(extractOutputUrl("not an object")).toBeUndefined();
		expect(extractOutputUrl(42)).toBeUndefined();
	});

	it("extracts nested video.url (FAL-style)", () => {
		expect(
			extractOutputUrl({ video: { url: "https://fal.example/video.mp4" } })
		).toBe("https://fal.example/video.mp4");
	});

	it("extracts nested image.url", () => {
		expect(
			extractOutputUrl({ image: { url: "https://x.example/img.png" } })
		).toBe("https://x.example/img.png");
	});

	it("extracts nested audio.url", () => {
		expect(
			extractOutputUrl({ audio: { url: "https://x.example/a.wav" } })
		).toBe("https://x.example/a.wav");
	});

	it("extracts first entry from images[] / videos[] / media_urls[]", () => {
		expect(
			extractOutputUrl({
				images: [{ url: "https://x.example/i1.png" }, { url: "ignored" }],
			})
		).toBe("https://x.example/i1.png");
		expect(
			extractOutputUrl({ videos: [{ url: "https://x.example/v1.mp4" }] })
		).toBe("https://x.example/v1.mp4");
		expect(
			extractOutputUrl({ media_urls: [{ url: "https://x.example/m1.mp4" }] })
		).toBe("https://x.example/m1.mp4");
	});

	it("extracts GMI top-level video_url (proxy-mode Seedance / Veo)", () => {
		// Mirrors `pollGmiQueue` in api-caller.ts — GMI's outcome shape is
		// `{ video_url: "..." }`, and proxy responses route through this
		// function via `extractOutputUrl(outcome ?? status)`.
		expect(
			extractOutputUrl({ video_url: "https://gmi.example/out.mp4" })
		).toBe("https://gmi.example/out.mp4");
	});

	it("extracts top-level image_url and audio_url", () => {
		expect(extractOutputUrl({ image_url: "https://x.example/img.png" })).toBe(
			"https://x.example/img.png"
		);
		expect(extractOutputUrl({ audio_url: "https://x.example/a.wav" })).toBe(
			"https://x.example/a.wav"
		);
	});

	it("falls back to output_url then url", () => {
		expect(extractOutputUrl({ output_url: "https://x.example/o.mp4" })).toBe(
			"https://x.example/o.mp4"
		);
		expect(extractOutputUrl({ url: "https://x.example/plain.mp4" })).toBe(
			"https://x.example/plain.mp4"
		);
	});

	it("prefers nested video.url over flat video_url when both present", () => {
		// Nested shapes come first (FAL), flat snake_case is the GMI fallback.
		expect(
			extractOutputUrl({
				video: { url: "https://nested.example/v.mp4" },
				video_url: "https://flat.example/v.mp4",
			})
		).toBe("https://nested.example/v.mp4");
	});

	it("prefers media_urls[] over flat video_url (GMI success shape)", () => {
		// If both are present GMI docs list media_urls[0].url as the canonical
		// field; keep that precedence so we don't accidentally prefer a
		// legacy-shaped string.
		expect(
			extractOutputUrl({
				media_urls: [{ url: "https://canonical.example/v.mp4" }],
				video_url: "https://fallback.example/v.mp4",
			})
		).toBe("https://canonical.example/v.mp4");
	});

	it("returns undefined when no recognized URL field is present", () => {
		expect(extractOutputUrl({ status: "success", cost: 0.26 })).toBeUndefined();
	});
});
