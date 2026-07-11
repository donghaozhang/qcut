import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/captions/subtitle-style";
import type { TranscriptionSegment } from "@/types/captions";
import { WORD_FILTER_STATE } from "@/types/word-timeline";
import { CaptionsDisplay } from "../captions-display";

const segment: TranscriptionSegment = {
	id: 1,
	seek: 0,
	start: 0,
	end: 2,
	text: "Hello world",
	tokens: [],
	temperature: 0,
	avg_logprob: -0.5,
	compression_ratio: 1,
	no_speech_prob: 0,
};

describe("CaptionsDisplay", () => {
	it("renders timed words through the karaoke renderer", () => {
		render(
			<CaptionsDisplay
				segments={[segment]}
				currentTime={0.5}
				subtitleStyle={{
					...DEFAULT_SUBTITLE_STYLE,
					karaokeMode: "karaoke",
					highlightColor: "#22d3ee",
					upcomingColor: "#d4d4d8",
				}}
				words={[
					{
						id: "hello",
						text: "Hello",
						start: 0,
						end: 1,
						type: "word",
						filterState: WORD_FILTER_STATE.NONE,
					},
					{
						id: "world",
						text: "world",
						start: 1,
						end: 2,
						type: "word",
						filterState: WORD_FILTER_STATE.NONE,
					},
				]}
			/>
		);

		expect(screen.getByTestId("karaoke-renderer")).toHaveTextContent("Hello");
		expect(screen.getByText("Hello").getAttribute("style")).toContain(
			"-webkit-text-fill-color: transparent"
		);
		expect(screen.getByText("world")).toBeVisible();
	});
});
