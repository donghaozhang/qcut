import { describe, it, expect, vi, beforeEach } from "vitest";
import { startWebcamCapture, getVideoDevices } from "../webcam-capture";

function mockMediaStream(tracks: { kind: string; stop: () => void }[]) {
	return {
		getTracks: () => tracks,
		getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
		getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
	} as unknown as MediaStream;
}

describe("webcam-capture", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("startWebcamCapture", () => {
		it("returns stream, video element, and cleanup function", async () => {
			const stopFn = vi.fn();
			const mockStream = mockMediaStream([
				{ kind: "video", stop: stopFn },
			]);

			const mockVideo = {
				srcObject: null as MediaStream | null,
				muted: false,
				playsInline: false,
				onloadedmetadata: null as (() => void) | null,
				onerror: null as (() => void) | null,
				play: vi.fn().mockResolvedValue(undefined),
				pause: vi.fn(),
			};

			vi.spyOn(document, "createElement").mockReturnValue(
				mockVideo as unknown as ReturnType<typeof document.createElement>
			);

			Object.defineProperty(navigator, "mediaDevices", {
				value: {
					getUserMedia: vi.fn().mockResolvedValue(mockStream),
					enumerateDevices: vi.fn(),
				},
				configurable: true,
			});

			const promise = startWebcamCapture({ deviceId: "cam-1" });

			// Simulate metadata loaded
			await vi.waitFor(() => {
				expect(mockVideo.onloadedmetadata).not.toBeNull();
			});
			mockVideo.onloadedmetadata!();

			const result = await promise;

			expect(result.stream).toBe(mockStream);
			expect(result.video).toBe(mockVideo);
			expect(typeof result.cleanup).toBe("function");
			expect(mockVideo.muted).toBe(true);
			expect(mockVideo.playsInline).toBe(true);
			expect(mockVideo.play).toHaveBeenCalled();
		});

		it("cleanup stops all tracks and pauses video", async () => {
			const stopFn = vi.fn();
			const mockStream = mockMediaStream([
				{ kind: "video", stop: stopFn },
			]);

			const mockVideo = {
				srcObject: null as MediaStream | null,
				muted: false,
				playsInline: false,
				onloadedmetadata: null as (() => void) | null,
				onerror: null as (() => void) | null,
				play: vi.fn().mockResolvedValue(undefined),
				pause: vi.fn(),
			};

			vi.spyOn(document, "createElement").mockReturnValue(
				mockVideo as unknown as ReturnType<typeof document.createElement>
			);

			Object.defineProperty(navigator, "mediaDevices", {
				value: {
					getUserMedia: vi.fn().mockResolvedValue(mockStream),
				},
				configurable: true,
			});

			const promise = startWebcamCapture();
			await vi.waitFor(() => {
				expect(mockVideo.onloadedmetadata).not.toBeNull();
			});
			mockVideo.onloadedmetadata!();

			const result = await promise;
			result.cleanup();

			expect(mockVideo.pause).toHaveBeenCalled();
			expect(mockVideo.srcObject).toBeNull();
			expect(stopFn).toHaveBeenCalled();
		});
	});

	describe("getVideoDevices", () => {
		it("filters to videoinput devices only", async () => {
			const devices = [
				{ kind: "audioinput", deviceId: "mic-1", label: "Mic" },
				{ kind: "videoinput", deviceId: "cam-1", label: "Camera" },
				{ kind: "audiooutput", deviceId: "out-1", label: "Speaker" },
			];

			Object.defineProperty(navigator, "mediaDevices", {
				value: {
					enumerateDevices: vi.fn().mockResolvedValue(devices),
				},
				configurable: true,
			});

			const result = await getVideoDevices();
			expect(result).toHaveLength(1);
			expect(result[0].deviceId).toBe("cam-1");
		});
	});
});
