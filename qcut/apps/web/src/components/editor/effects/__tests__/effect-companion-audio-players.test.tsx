import type { MediaElement } from "@qcut/editor-core";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EffectCompanionAudioPlayers } from "../effect-companion-audio-players";

const audioPlayer = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/audio-player", () => ({
	AudioPlayer: (props: { element: MediaElement; trimEnd: number }) => {
		audioPlayer(props);
		return <span data-testid="audio-player" />;
	},
}));

vi.mock("@/lib/effects/effect-sound-resources", () => ({
	resolveEffectSoundAsset: () => ({ source: { url: "/effect.ogg" } }),
}));

describe("EffectCompanionAudioPlayers", () => {
	beforeEach(() => {
		audioPlayer.mockClear();
	});

	it("keeps the generated companion clip untrimmed", () => {
		render(
			<EffectCompanionAudioPlayers
				companions={[
					{
						effectId: "impact",
						effectName: "Impact",
						companion: {
							resourceId: "impact-sound",
							offsetSeconds: 0.5,
							durationSeconds: 1.5,
							gain: 0.8,
						},
					},
				]}
				element={{
					id: "clip-1",
					name: "Clip",
					type: "media",
					mediaId: "media-1",
					startTime: 2,
					duration: 4,
					trimStart: 0,
					trimEnd: 0,
				}}
				trackId="track-1"
			/>
		);

		expect(screen.getByTestId("audio-player")).toBeInTheDocument();
		expect(audioPlayer).toHaveBeenCalledWith(
			expect.objectContaining({
				trimEnd: 0,
				element: expect.objectContaining({
					startTime: 2.5,
					duration: 1.5,
					trimStart: 0,
					trimEnd: 0,
				}),
			})
		);
	});
});
