import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	supportsWebCodecsExport,
	getH264Support,
	getBestMuxerCodec,
} from "../webcodecs-support";

describe("webcodecs-support", () => {
	const originalVideoEncoder = globalThis.VideoEncoder;
	const originalVideoFrame = globalThis.VideoFrame;
	const originalEncodedVideoChunk = globalThis.EncodedVideoChunk;

	afterEach(() => {
		// Restore originals
		if (originalVideoEncoder) {
			(globalThis as any).VideoEncoder = originalVideoEncoder;
		} else {
			delete (globalThis as any).VideoEncoder;
		}
		if (originalVideoFrame) {
			(globalThis as any).VideoFrame = originalVideoFrame;
		} else {
			delete (globalThis as any).VideoFrame;
		}
		if (originalEncodedVideoChunk) {
			(globalThis as any).EncodedVideoChunk = originalEncodedVideoChunk;
		} else {
			delete (globalThis as any).EncodedVideoChunk;
		}
	});

	describe("supportsWebCodecsExport", () => {
		it("returns false when VideoEncoder is not available", () => {
			delete (globalThis as any).VideoEncoder;
			expect(supportsWebCodecsExport()).toBe(false);
		});

		it("returns false when VideoFrame is not available", () => {
			(globalThis as any).VideoEncoder = class {};
			delete (globalThis as any).VideoFrame;
			expect(supportsWebCodecsExport()).toBe(false);
		});

		it("returns false when EncodedVideoChunk is not available", () => {
			(globalThis as any).VideoEncoder = class {};
			(globalThis as any).VideoFrame = class {};
			delete (globalThis as any).EncodedVideoChunk;
			expect(supportsWebCodecsExport()).toBe(false);
		});

		it("returns true when all WebCodecs APIs are available", () => {
			(globalThis as any).VideoEncoder = class {};
			(globalThis as any).VideoFrame = class {};
			(globalThis as any).EncodedVideoChunk = class {};
			expect(supportsWebCodecsExport()).toBe(true);
		});
	});

	describe("getH264Support", () => {
		it("returns null when WebCodecs is not available", async () => {
			delete (globalThis as any).VideoEncoder;
			const result = await getH264Support();
			expect(result).toBeNull();
		});

		it("returns codec string when H.264 is supported", async () => {
			(globalThis as any).VideoEncoder = {
				isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
			};
			(globalThis as any).VideoFrame = class {};
			(globalThis as any).EncodedVideoChunk = class {};

			const result = await getH264Support();
			expect(result).toBe("avc1.640028"); // High profile preferred
		});

		it("falls back to lower profile if high is unsupported", async () => {
			let callCount = 0;
			(globalThis as any).VideoEncoder = {
				isConfigSupported: vi.fn().mockImplementation(({ codec }) => {
					callCount++;
					// Reject first (High), accept second (Main)
					if (callCount === 1) return { supported: false };
					return { supported: true };
				}),
			};
			(globalThis as any).VideoFrame = class {};
			(globalThis as any).EncodedVideoChunk = class {};

			const result = await getH264Support();
			expect(result).toBe("avc1.4d0028"); // Main profile
		});

		it("returns null when no H.264 profile is supported", async () => {
			(globalThis as any).VideoEncoder = {
				isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
			};
			(globalThis as any).VideoFrame = class {};
			(globalThis as any).EncodedVideoChunk = class {};

			const result = await getH264Support();
			expect(result).toBeNull();
		});
	});

	describe("getBestMuxerCodec", () => {
		it("returns null when WebCodecs is not available", async () => {
			delete (globalThis as any).VideoEncoder;
			const result = await getBestMuxerCodec();
			expect(result).toBeNull();
		});

		it("prefers H.264/MP4 when available", async () => {
			(globalThis as any).VideoEncoder = {
				isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
			};
			(globalThis as any).VideoFrame = class {};
			(globalThis as any).EncodedVideoChunk = class {};

			const result = await getBestMuxerCodec();
			expect(result).not.toBeNull();
			expect(result!.codec).toBe("avc");
			expect(result!.container).toBe("mp4");
		});

		it("falls back to VP8/WebM when H.264 unavailable", async () => {
			(globalThis as any).VideoEncoder = {
				isConfigSupported: vi.fn().mockImplementation(({ codec }) => {
					// Reject all H.264 profiles, accept VP8
					if (codec.startsWith("avc1")) return { supported: false };
					if (codec === "vp8") return { supported: true };
					return { supported: false };
				}),
			};
			(globalThis as any).VideoFrame = class {};
			(globalThis as any).EncodedVideoChunk = class {};

			const result = await getBestMuxerCodec();
			expect(result).not.toBeNull();
			expect(result!.codec).toBe("vp8");
			expect(result!.container).toBe("webm");
		});
	});
});
