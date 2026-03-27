import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock MediaStream before imports
class MockMediaStream {
	private tracks: MediaStreamTrack[] = [];
	getTracks() {
		return this.tracks;
	}
	getAudioTracks() {
		return this.tracks.filter((t) => t.kind === "audio");
	}
	getVideoTracks() {
		return this.tracks.filter((t) => t.kind === "video");
	}
	addTrack(track: MediaStreamTrack) {
		this.tracks.push(track);
	}
}
vi.stubGlobal("MediaStream", MockMediaStream);

import {
	startAudioCapture,
	getAudioInputDevices,
	mergeAudioIntoStream,
} from "../audio-capture";

// Mock Web Audio API
const mockGainNode = {
	gain: { value: 1 },
	connect: vi.fn(),
	disconnect: vi.fn(),
};

const mockSource = {
	connect: vi.fn(),
	disconnect: vi.fn(),
};

const mockDestination = {
	stream: new MockMediaStream(),
};

const mockAudioContext = {
	createGain: vi.fn(() => mockGainNode),
	createMediaStreamSource: vi.fn(() => mockSource),
	createMediaStreamDestination: vi.fn(() => mockDestination),
	close: vi.fn(() => Promise.resolve()),
};

// Mock track
function createMockTrack(kind: "audio" | "video") {
	return {
		kind,
		stop: vi.fn(),
		id: Math.random().toString(),
		label: `Mock ${kind} track`,
		enabled: true,
		muted: false,
		readyState: "live" as MediaStreamTrackState,
	} as unknown as MediaStreamTrack;
}

function createMockStream(tracks: MediaStreamTrack[]) {
	const stream = new MockMediaStream() as unknown as MediaStream;
	for (const track of tracks) {
		stream.addTrack(track);
	}
	return stream;
}

beforeEach(() => {
	vi.clearAllMocks();

	// Mock AudioContext constructor (must be class-like for `new`)
	vi.stubGlobal(
		"AudioContext",
		class {
			createGain = mockAudioContext.createGain;
			createMediaStreamSource = mockAudioContext.createMediaStreamSource;
			createMediaStreamDestination =
				mockAudioContext.createMediaStreamDestination;
			close = mockAudioContext.close;
		},
	);

	// Mock getUserMedia
	const mockMicStream = createMockStream([createMockTrack("audio")]);
	vi.stubGlobal("navigator", {
		mediaDevices: {
			getUserMedia: vi.fn(() => Promise.resolve(mockMicStream)),
			enumerateDevices: vi.fn(() =>
				Promise.resolve([
					{ kind: "audioinput", deviceId: "mic1", label: "Built-in Mic" },
					{ kind: "audioinput", deviceId: "mic2", label: "USB Mic" },
					{ kind: "videoinput", deviceId: "cam1", label: "Camera" },
				]),
			),
		},
	});
});

describe("audio-capture", () => {
	describe("startAudioCapture", () => {
		it("creates AudioContext and destination", async () => {
			const result = await startAudioCapture({
				micEnabled: false,
				systemAudioEnabled: false,
			});

			expect(mockAudioContext.createMediaStreamDestination).toHaveBeenCalled();
			expect(result.stream).toBeDefined();
			expect(typeof result.cleanup).toBe("function");
		});

		it("captures microphone when enabled", async () => {
			await startAudioCapture({
				micEnabled: true,
				systemAudioEnabled: false,
			});

			expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
				audio: true,
			});
			expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
			expect(mockAudioContext.createGain).toHaveBeenCalled();
		});

		it("applies mic gain boost", async () => {
			await startAudioCapture({
				micEnabled: true,
				systemAudioEnabled: false,
				micGainBoost: 2.0,
			});

			expect(mockGainNode.gain.value).toBe(2.0);
		});

		it("uses default gain boost of 1.4", async () => {
			await startAudioCapture({
				micEnabled: true,
				systemAudioEnabled: false,
			});

			expect(mockGainNode.gain.value).toBe(1.4);
		});

		it("uses specific mic device when provided", async () => {
			await startAudioCapture({
				micEnabled: true,
				systemAudioEnabled: false,
				micDeviceId: "usb-mic-123",
			});

			expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
				audio: { deviceId: { exact: "usb-mic-123" } },
			});
		});

		it("connects system audio from display stream", async () => {
			const audioTrack = createMockTrack("audio");
			const displayStream = createMockStream([audioTrack]);

			await startAudioCapture(
				{
					micEnabled: false,
					systemAudioEnabled: true,
				},
				displayStream,
			);

			expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
			expect(mockSource.connect).toHaveBeenCalledWith(mockDestination);
		});

		it("cleanup closes AudioContext", async () => {
			const result = await startAudioCapture({
				micEnabled: true,
				systemAudioEnabled: false,
			});

			result.cleanup();

			expect(mockAudioContext.close).toHaveBeenCalled();
			expect(mockSource.disconnect).toHaveBeenCalled();
			expect(mockGainNode.disconnect).toHaveBeenCalled();
		});
	});

	describe("getAudioInputDevices", () => {
		it("returns only audio input devices", async () => {
			const devices = await getAudioInputDevices();
			expect(devices).toHaveLength(2);
			expect(devices[0].deviceId).toBe("mic1");
			expect(devices[0].label).toBe("Built-in Mic");
			expect(devices[1].deviceId).toBe("mic2");
		});
	});

	describe("mergeAudioIntoStream", () => {
		it("merges video and audio tracks into one stream", () => {
			const videoTrack = createMockTrack("video");
			const audioTrack = createMockTrack("audio");
			const videoStream = createMockStream([videoTrack]);
			const audioStream = createMockStream([audioTrack]);

			const merged = mergeAudioIntoStream(videoStream, audioStream);

			expect(merged).toBeInstanceOf(MockMediaStream);
		});
	});
});
