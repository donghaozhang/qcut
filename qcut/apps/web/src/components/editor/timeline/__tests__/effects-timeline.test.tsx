import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEffectsStore } from "@/stores/ai/effects-store";
import type { TimelineTrack } from "@/types/timeline";
import { EffectsTimeline } from "../effects-timeline";

const track: TimelineTrack = {
	id: "media-track",
	name: "Media",
	type: "media",
	muted: false,
	locked: false,
	hidden: false,
	elements: Array.from({ length: 100 }, (_, index) => ({
		id: `clip-${index}`,
		name: `Clip ${index}`,
		type: "media" as const,
		mediaId: `media-${index}`,
		startTime: index * 5,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
	})),
};

describe("EffectsTimeline", () => {
	beforeEach(() => {
		useEffectsStore.setState({
			activeEffects: new Map(
				track.elements.map((element) => [
					element.id,
					[
						{
							id: `effect-${element.id}`,
							name: "Sepia",
							effectType: "sepia" as const,
							parameters: { sepia: 80 },
							duration: 4,
							enabled: true,
						},
					],
				])
			),
		});
	});

	it("renders only effect bars intersecting the timeline viewport", () => {
		render(
			<EffectsTimeline
				tracks={[track]}
				pixelsPerSecond={50}
				visibleTimeRange={{ startTime: 20, endTime: 31 }}
			/>
		);

		expect(screen.getAllByTestId("timeline-effect-bar")).toHaveLength(3);
	});
});
