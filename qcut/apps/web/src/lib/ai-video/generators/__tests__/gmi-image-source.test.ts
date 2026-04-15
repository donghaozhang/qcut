import { describe, expect, it, vi } from "vitest";
import {
	MAX_INLINE_BYTES,
	fileToDataUri,
	resolveGmiImageSource,
} from "../gmi-image-source";

function makeFile(bytes: number, type = "image/png"): File {
	// Use a deterministic body so encoded output is predictable.
	const body = new Uint8Array(bytes).fill(1);
	return new File([body], "ref.png", { type });
}

describe("fileToDataUri", () => {
	it("encodes a small PNG as a data URI with the file's MIME type", async () => {
		const file = makeFile(8, "image/png");
		const uri = await fileToDataUri(file);
		expect(uri.startsWith("data:image/png;base64,")).toBe(true);
	});

	it("rejects files above the inline limit", async () => {
		const file = makeFile(MAX_INLINE_BYTES + 1);
		await expect(fileToDataUri(file)).rejects.toThrow(
			/inline upload limit|FAL_KEY/i
		);
	});
});

describe("resolveGmiImageSource", () => {
	it("returns the uploader's URL when it succeeds", async () => {
		const uploader = vi.fn().mockResolvedValue("https://fal.cdn/img.png");
		const url = await resolveGmiImageSource(makeFile(4), uploader);
		expect(url).toBe("https://fal.cdn/img.png");
		expect(uploader).toHaveBeenCalledTimes(1);
	});

	it("falls back to a data URI when the uploader rejects", async () => {
		const uploader = vi
			.fn()
			.mockRejectedValue(new Error("No FAL API key configured"));
		const result = await resolveGmiImageSource(
			makeFile(4, "image/jpeg"),
			uploader
		);
		expect(result.startsWith("data:image/jpeg;base64,")).toBe(true);
	});

	it("propagates the size-limit error from the data URI fallback", async () => {
		const uploader = vi.fn().mockRejectedValue(new Error("fail"));
		await expect(
			resolveGmiImageSource(makeFile(MAX_INLINE_BYTES + 1), uploader)
		).rejects.toThrow(/inline upload limit/i);
	});
});
