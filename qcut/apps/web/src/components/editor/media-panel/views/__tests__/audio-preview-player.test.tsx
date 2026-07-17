import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_AUDIO } from "@/lib/audio/audio-library-catalog";
import { useLocaleStore } from "@/stores/locale-store";
import { AudioPreviewPlayer } from "../audio-preview-player";

describe("AudioPreviewPlayer", () => {
	beforeEach(() => useLocaleStore.getState().setLocale({ locale: "en" }));

	it("exposes seek, volume, and continuous playback controls", () => {
		const onSeek = vi.fn();
		const onVolumeChange = vi.fn();
		const onContinuousPlaybackChange = vi.fn();
		render(
			<AudioPreviewPlayer
				sound={BUILT_IN_AUDIO[0]}
				isPlaying
				currentTime={2}
				duration={12}
				volume={0.8}
				continuousPlayback={false}
				onToggle={vi.fn()}
				onSeek={onSeek}
				onVolumeChange={onVolumeChange}
				onContinuousPlaybackChange={onContinuousPlaybackChange}
				onClose={vi.fn()}
			/>
		);

		expect(screen.getByTestId("audio-waveform")).toBeVisible();
		expect(screen.getByTestId("audio-preview-waveform-seek")).toBeVisible();
		fireEvent.change(screen.getByLabelText("Preview progress"), {
			target: { value: "4.25" },
		});
		fireEvent.change(screen.getByLabelText("Preview volume"), {
			target: { value: "0.4" },
		});
		fireEvent.click(screen.getByLabelText("Continuous playback"));

		expect(onSeek).toHaveBeenCalledWith({ time: 4.25 });
		expect(onVolumeChange).toHaveBeenCalledWith({ value: 0.4 });
		expect(onContinuousPlaybackChange).toHaveBeenCalledWith({ enabled: true });
	});
});
