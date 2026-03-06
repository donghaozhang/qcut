import { describe, expect, it } from "vitest";
import {
	DEFAULT_IMAGE_MIME_TYPE,
	extractMimeTypeFromDataUrl,
	isLikelyImageFile,
	normalizeImageMimeType,
} from "../image-file";

describe("draw image-file utils", () => {
	it("detects image files from mime type", () => {
		expect(
			isLikelyImageFile({ name: "photo.unknown", type: "image/webp" })
		).toBe(true);
	});

	it("detects image files from extension when mime type is missing", () => {
		expect(isLikelyImageFile({ name: "frame.PNG", type: "" })).toBe(true);
		expect(isLikelyImageFile({ name: "sketch.heic", type: undefined })).toBe(
			true
		);
	});

	it("rejects non-image files", () => {
		expect(isLikelyImageFile({ name: "notes.txt", type: "text/plain" })).toBe(
			false
		);
		expect(isLikelyImageFile({ name: "archive", type: "" })).toBe(false);
	});

	it("extracts mime type from data urls", () => {
		expect(extractMimeTypeFromDataUrl("data:image/png;base64,abc")).toBe(
			"image/png"
		);
		expect(extractMimeTypeFromDataUrl("data:image/png,abc")).toBe("image/png");
		expect(extractMimeTypeFromDataUrl("data:image/svg+xml,<svg>")).toBe(
			"image/svg+xml"
		);
		expect(extractMimeTypeFromDataUrl("data:,hello")).toBe(null);
	});

	it("rejects malformed data urls", () => {
		expect(extractMimeTypeFromDataUrl("image/png;base64,abc")).toBe(null);
		expect(extractMimeTypeFromDataUrl("data:image/png;base64")).toBe(null);
	});

	it("falls back safely for malformed runtime values", () => {
		expect(
			extractMimeTypeFromDataUrl({
				startsWith() {
					throw new Error("bad data url");
				},
			} as unknown as string)
		).toBe(null);
		expect(
			isLikelyImageFile({
				name: {
					trim() {
						throw new Error("bad filename");
					},
				} as unknown as string,
				type: "",
			})
		).toBe(false);
		expect(
			isLikelyImageFile({
				name: "image.png",
				type: {
					trim() {
						throw new Error("bad mime type");
					},
				} as unknown as string,
			})
		).toBe(false);
		expect(
			normalizeImageMimeType({
				declaredType: {
					trim() {
						throw new Error("bad declared type");
					},
				} as unknown as string,
				dataUrl: "data:image/png;base64,abc",
				filename: "image.png",
			})
		).toBe(DEFAULT_IMAGE_MIME_TYPE);
	});

	it("normalizes declared mime type first", () => {
		expect(
			normalizeImageMimeType({
				declaredType: "IMAGE/JPEG",
				filename: "picture.jpg",
			})
		).toBe("image/jpeg");
	});

	it("falls back to data url mime type", () => {
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "data:image/webp;base64,abc",
				filename: "picture.bin",
			})
		).toBe("image/webp");
	});

	it("falls back to extension mapping", () => {
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "",
				filename: "picture.svg",
			})
		).toBe("image/svg+xml");
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "",
				filename: "picture.jfif",
			})
		).toBe("image/jpeg");
	});

	it("handles specific and generic extension fallbacks", () => {
		expect(
			normalizeImageMimeType({
				declaredType: "application/octet-stream",
				dataUrl: "data:text/plain;base64,abc",
				filename: "picture.svgz",
			})
		).toBe("image/svg+xml");
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "",
				filename: "scan.tif",
			})
		).toBe("image/tiff");
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "",
				filename: "render.webp",
			})
		).toBe("image/webp");
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "",
				filename: "render.raw",
			})
		).toBe(DEFAULT_IMAGE_MIME_TYPE);
	});

	it("uses default mime type when all inference fails", () => {
		expect(
			normalizeImageMimeType({
				declaredType: "",
				dataUrl: "",
				filename: "file",
			})
		).toBe(DEFAULT_IMAGE_MIME_TYPE);
	});
});
