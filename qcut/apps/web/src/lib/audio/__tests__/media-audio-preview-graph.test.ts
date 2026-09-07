import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioPreviewState } from "../audio-preview-state";
import { createDefaultMediaAudioSettings } from "../audio-properties";

const formantMocks = vi.hoisted(() => ({
	construct: vi.fn(),
	register: vi.fn(() => Promise.resolve()),
}));

const audioMixMocks = vi.hoisted(() => ({
	getContext: vi.fn(),
	getTrackInput: vi.fn(),
	resume: vi.fn(() => Promise.resolve()),
}));

vi.mock("@soundtouchjs/formant-correction-worklet", () => {
	const parameter = () => ({
		value: 0,
		cancelScheduledValues: vi.fn(),
		setTargetAtTime: vi.fn(),
	});

	class MockFormantCorrectionNode {
		static register = formantMocks.register;
		connect = vi.fn();
		formantStrength = parameter();
		pitchSemitones = parameter();
		playbackRate = parameter();

		constructor() {
			formantMocks.construct();
		}
	}

	return { FormantCorrectionNode: MockFormantCorrectionNode };
});

vi.mock("@soundtouchjs/formant-correction-worklet/processor?url", () => ({
	default: "mock-formant-processor.js",
}));

vi.mock("../audio-mix-engine", () => ({
	getAudioMixContext: audioMixMocks.getContext,
	getAudioTrackInput: audioMixMocks.getTrackInput,
	resumeAudioMixEngine: audioMixMocks.resume,
}));

import { acquireMediaAudioPreview } from "../media-audio-preview-graph";

function audioParameter(): AudioParam {
	return {
		value: 0,
		cancelScheduledValues: vi.fn(),
		setTargetAtTime: vi.fn(),
	} as unknown as AudioParam;
}

function audioNode({
	parameters = {},
}: {
	parameters?: Record<string, AudioParam>;
} = {}): AudioNode & Record<string, AudioParam> {
	return {
		connect: vi.fn(),
		disconnect: vi.fn(),
		...parameters,
	} as unknown as AudioNode & Record<string, AudioParam>;
}

function audioContext(): AudioContext {
	return {
		currentTime: 0,
		sampleRate: 48_000,
		createMediaElementSource: vi.fn(() => audioNode()),
		createGain: vi.fn(() =>
			audioNode({ parameters: { gain: audioParameter() } })
		),
		createBiquadFilter: vi.fn(() =>
			audioNode({
				parameters: {
					frequency: audioParameter(),
					gain: audioParameter(),
					Q: audioParameter(),
				},
			})
		),
		createDynamicsCompressor: vi.fn(() =>
			audioNode({
				parameters: {
					attack: audioParameter(),
					knee: audioParameter(),
					ratio: audioParameter(),
					release: audioParameter(),
					threshold: audioParameter(),
				},
			})
		),
		createConvolver: vi.fn(() => audioNode()),
		createDelay: vi.fn(() =>
			audioNode({ parameters: { delayTime: audioParameter() } })
		),
		createStereoPanner: vi.fn(() =>
			audioNode({ parameters: { pan: audioParameter() } })
		),
	} as unknown as AudioContext;
}

function previewState({
	pitchEnabled = false,
	semitones = 0,
}: {
	pitchEnabled?: boolean;
	semitones?: number;
} = {}): AudioPreviewState {
	const settings = createDefaultMediaAudioSettings();
	settings.pitch = {
		...settings.pitch,
		enabled: pitchEnabled,
		semitones,
	};
	return {
		settings,
		outputGain: 1,
		pan: 0,
		localTime: 0,
		duration: 10,
	};
}

function acquireGraph({
	mediaElement,
	trackId = "audio-track",
}: {
	mediaElement: HTMLMediaElement;
	trackId?: string;
}) {
	const graph = acquireMediaAudioPreview({ mediaElement, trackId });
	if (!graph) throw new Error("Expected the preview graph to be available");
	return graph;
}

describe("media audio preview pitch graph", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		audioMixMocks.getContext.mockReturnValue(audioContext());
		audioMixMocks.getTrackInput.mockReturnValue(audioNode());
	});

	it("does not load the pitch worklet for ordinary playback", async () => {
		const mediaElement = document.createElement("audio");
		const graph = acquireGraph({ mediaElement });

		graph.update({ state: previewState() });
		await vi.dynamicImportSettled();

		expect(formantMocks.register).not.toHaveBeenCalled();
		expect(formantMocks.construct).not.toHaveBeenCalled();
		expect(mediaElement.dataset.audioPreviewPitch).toBe("off");
	});

	it("loads and creates pitch processing once when pitch becomes active", async () => {
		const mediaElement = document.createElement("audio");
		const graph = acquireGraph({ mediaElement });
		const pitchedState = previewState({ pitchEnabled: true, semitones: 4 });

		graph.update({ state: pitchedState });
		graph.update({ state: pitchedState });
		expect(mediaElement.dataset.audioPreviewPitch).toBe("loading");

		await vi.dynamicImportSettled();
		await vi.waitFor(() => {
			expect(formantMocks.construct).toHaveBeenCalledTimes(1);
		});

		expect(formantMocks.register).toHaveBeenCalledTimes(1);
		expect(mediaElement.dataset.audioPreviewPitch).toBe("formant");
		expect(mediaElement.dataset.audioPreviewPitchRate).toBe("1.0000");
	});
});
