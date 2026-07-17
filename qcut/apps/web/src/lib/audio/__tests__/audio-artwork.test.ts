import { describe, expect, it } from "vitest";
import { audioArtworkSeed, renderAudioArtworkDataUrl } from "../audio-artwork";

describe("audio artwork", () => {
	it("derives stable seeds from track identity", () => {
		const seed = audioArtworkSeed({ value: "track.mp3:calm piano" });
		expect(audioArtworkSeed({ value: "track.mp3:calm piano" })).toBe(seed);
		expect(audioArtworkSeed({ value: "other.mp3:calm piano" })).not.toBe(seed);
	});

	it("degrades gracefully when canvas rendering is unavailable", () => {
		// jsdom has no 2d canvas backend, so rendering must return undefined
		// instead of throwing; real artwork is exercised in the browser.
		expect(() => renderAudioArtworkDataUrl({ seed: 42 })).not.toThrow();
		const result = renderAudioArtworkDataUrl({ seed: 42 });
		expect(result === undefined || result.startsWith("data:image/")).toBe(true);
	});
});
