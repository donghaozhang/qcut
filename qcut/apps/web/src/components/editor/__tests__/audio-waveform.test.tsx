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

	it("retries a transiently failing decode instead of pinning the error", async () => {
		vi.useFakeTimers();
		nativeMocks.decode
			.mockRejectedValueOnce(new Error("decode pressure"))
			.mockResolvedValueOnce({
				duration: 300,
				values: new Float32Array([0.4]),
			});
		try {
			const { queryByText } = render(
				<AudioWaveform
					audioUrl="blob:flaky-audio"
					sourcePath="/project/flaky-audio.mp3"
					sourceDuration={300}
					cacheKey="media:flaky-audio:1"
					errorLabel="Audio unavailable"
				/>
			);

			await vi.waitFor(() => expect(nativeMocks.decode).toHaveBeenCalledOnce());
			await vi.advanceTimersByTimeAsync(1500);
			await vi.waitFor(() =>
				expect(nativeMocks.decode).toHaveBeenCalledTimes(2)
			);
			expect(queryByText("Audio unavailable")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});
