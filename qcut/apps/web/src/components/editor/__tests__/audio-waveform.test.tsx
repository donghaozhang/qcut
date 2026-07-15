import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audioWaveformCache } from "@/lib/audio/audio-waveform-cache";

const nativeMocks = vi.hoisted(() => ({
	decode: vi.fn(),
}));

vi.mock("@/lib/audio/native-audio-waveform", () => ({
	canDecodeNativeAudioWaveform: () => true,
	decodeNativeAudioWaveform: nativeMocks.decode,
}));

import AudioWaveform from "../audio-waveform";

describe("AudioWaveform", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		audioWaveformCache.clear();
		nativeMocks.decode.mockResolvedValue({
			duration: 300,
			values: new Float32Array([0.1, 0.5, 0.9]),
		});
	});

	afterEach(() => vi.restoreAllMocks());

	it("uses bounded native extraction for a local media source", async () => {
		render(
			<AudioWaveform
				audioUrl="blob:large-audio"
				sourcePath="/project/large-audio.mp3"
				sourceDuration={300}
				cacheKey="media:large-audio:1"
			/>
		);

		await waitFor(() =>
			expect(nativeMocks.decode).toHaveBeenCalledWith({
				sourcePath: "/project/large-audio.mp3",
				duration: 300,
			})
		);
	});
});
