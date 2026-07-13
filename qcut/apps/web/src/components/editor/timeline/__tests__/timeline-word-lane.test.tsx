import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import {
	WORD_FILTER_STATE,
	type RawWordTimelineJson,
	type WordItem,
} from "@/types/word-timeline";
import { TimelineWordLane } from "../timeline-word-lane";
import {
	getTimelineWordGeometry,
	getVisibleTimelineWords,
} from "../timeline-word-lane-layout";

function word({
	end,
	id,
	start,
	text = id,
	type = "word",
}: {
	end: number;
	id: string;
	start: number;
	text?: string;
	type?: "word" | "spacing";
}): WordItem {
	return {
		id,
		text,
		start,
		end,
		type,
		filterState: WORD_FILTER_STATE.NONE,
	};
}

function WordLaneHarness() {
	const words = useWordTimelineStore((state) => state.data?.words ?? []);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	return (
		<div ref={scrollContainerRef}>
			<TimelineWordLane
				scrollContainerRef={scrollContainerRef}
				words={words}
				zoomLevel={1}
			/>
		</div>
	);
}

describe("timeline word lane", () => {
	beforeEach(() => {
		const data: RawWordTimelineJson = {
			text: "hello pause world",
			language_code: "eng",
			language_probability: 1,
			words: [
				{ id: "hello", text: "hello", start: 0.2, end: 0.7, type: "word" },
				{ id: "gap", text: " ", start: 0.7, end: 1, type: "spacing" },
				{ id: "world", text: "world", start: 1, end: 1.5, type: "word" },
			],
		};
		useWordTimelineStore.getState().loadFromData(data, "words.json");
		usePlaybackStore.setState({ currentTime: 0, duration: 10 });
	});

	it("virtualizes words around the horizontal viewport", () => {
		const words = Array.from({ length: 1000 }, (_, index) =>
			word({
				id: `word-${index}`,
				start: index,
				end: index + 0.5,
			})
		);
		const visible = getVisibleTimelineWords({
			overscanPixels: 0,
			pixelsPerSecond: 50,
			scrollLeft: 5000,
			viewportWidth: 500,
			words,
		});

		expect(visible[0].id).toBe("word-100");
		expect(visible.at(-1)?.id).toBe("word-110");
		expect(visible.length).toBeLessThan(20);
	});

	it("keeps true time geometry while preserving a usable hit target", () => {
		expect(
			getTimelineWordGeometry({
				pixelsPerSecond: 50,
				word: word({ id: "short", start: 2, end: 2.01 }),
			})
		).toEqual({ left: 100, width: 4 });
	});

	it("selects and seeks words, then toggles removal from the keyboard", () => {
		render(<WordLaneHarness />);
		const hello = screen.getByTestId("timeline-word-hello");

		fireEvent.click(hello);
		expect(useWordTimelineStore.getState().selectedWordId).toBe("hello");
		expect(usePlaybackStore.getState().currentTime).toBeCloseTo(0.2);

		fireEvent.keyDown(hello, { key: "Delete" });
		expect(
			useWordTimelineStore.getState().getWordById("hello")?.filterState
		).toBe(WORD_FILTER_STATE.USER_REMOVE);
		expect(screen.getByTestId("timeline-word-hello")).toHaveAttribute(
			"data-filter-state",
			WORD_FILTER_STATE.USER_REMOVE
		);

		fireEvent.keyDown(screen.getByTestId("timeline-word-hello"), {
			key: "Backspace",
		});
		expect(
			useWordTimelineStore.getState().getWordById("hello")?.filterState
		).toBe(WORD_FILTER_STATE.USER_KEEP);
	});

	it("does not render spacing entries as selectable word blocks", () => {
		render(<WordLaneHarness />);
		expect(screen.queryByTestId("timeline-word-gap")).not.toBeInTheDocument();
		expect(screen.getByTestId("timeline-word-world")).toBeInTheDocument();
	});
});
