import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createTestProject, expect, test } from "./helpers/electron-helpers";

const outputDir = path.join(
	process.cwd(),
	"output/playwright/word-timeline-caption-bridge"
);

type WordFilterState = "none" | "ai" | "user-remove" | "user-keep";

interface RawWordTimelineWord {
	id: string;
	text: string;
	start: number;
	end: number;
	type: "word" | "spacing";
	filterState?: WordFilterState;
}

interface RawWordTimelineJson {
	text: string;
	language_code: string;
	language_probability: number;
	words: RawWordTimelineWord[];
}

interface CaptionStyleSnapshot {
	fontSize?: number;
	highlightColor?: string;
	karaokeMode?: string;
}

interface CaptionElementSnapshot {
	text?: string;
	startTime?: number;
	duration?: number;
	style?: CaptionStyleSnapshot;
	words?: Array<{ id: string; text: string; start: number; end: number }>;
}

interface TimelineTrackSnapshot {
	type: string;
	elements: CaptionElementSnapshot[];
}

interface HarnessWindow extends Window {
	__mediaPanelStore: {
		getState: () => {
			setActiveTab: (tab: "word-timeline") => void;
		};
	};
	__timelineStore: {
		getState: () => {
			tracks: TimelineTrackSnapshot[];
		};
	};
	__wordTimelineStore: {
		getState: () => {
			loadFromData: (data: RawWordTimelineJson, fileName?: string) => void;
		};
	};
}

const transcriptData: RawWordTimelineJson = {
	text: "Um today we test QCut. 短口播",
	language_code: "eng",
	language_probability: 1,
	words: [
		{
			id: "word-0",
			text: "Um",
			start: 0,
			end: 0.2,
			type: "word",
			filterState: "ai",
		},
		{
			id: "word-1",
			text: "today",
			start: 0.25,
			end: 0.55,
			type: "word",
		},
		{
			id: "word-2",
			text: "we",
			start: 0.6,
			end: 0.8,
			type: "word",
		},
		{
			id: "word-3",
			text: "test",
			start: 0.85,
			end: 1.1,
			type: "word",
		},
		{
			id: "word-4",
			text: "QCut.",
			start: 1.2,
			end: 1.55,
			type: "word",
		},
		{
			id: "word-5",
			text: "短",
			start: 2.5,
			end: 2.72,
			type: "word",
		},
		{
			id: "word-6",
			text: "口播",
			start: 2.76,
			end: 3.1,
			type: "word",
		},
	],
};

test.describe("Smart Speech caption bridge", () => {
	test("adds caption lab styled captions from word timeline words", async ({
		page,
	}) => {
		await rm(outputDir, { recursive: true, force: true });
		await mkdir(outputDir, { recursive: true });
		await createTestProject(page, "Smart Speech Caption Bridge");

		await page.evaluate(
			({ data }) => {
				const harness = window as unknown as HarnessWindow;
				harness.__mediaPanelStore.getState().setActiveTab("word-timeline");
				harness.__wordTimelineStore
					.getState()
					.loadFromData(data, "short-smart-speech.json");
			},
			{ data: transcriptData }
		);

		await expect(page.getByText("short-smart-speech.json")).toBeVisible();
		await expect(page.getByTestId("word-timeline-add-captions")).toBeVisible();

		await page.getByTestId("word-timeline-caption-preset-select").click();
		await page.getByRole("option", { name: "知识高亮" }).click();
		await page.getByTestId("word-timeline-add-captions").click();

		const captions = await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			const captionsTrack = harness.__timelineStore
				.getState()
				.tracks.find((track) => track.type === "captions");
			return captionsTrack?.elements ?? [];
		});

		expect(captions).toHaveLength(2);
		expect(captions.map((caption) => caption.text)).toEqual([
			"today we test QCut.",
			"短口播",
		]);
		expect(captions[0].words?.map((word) => word.id)).toEqual([
			"word-1",
			"word-2",
			"word-3",
			"word-4",
		]);
		expect(captions[0].style).toMatchObject({
			fontSize: 46,
			highlightColor: "#22d3ee",
			karaokeMode: "word-highlight",
		});

		await page.screenshot({
			path: path.join(outputDir, "01-styled-captions-added.png"),
			animations: "disabled",
			fullPage: true,
		});
	});
});
