import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory = path.resolve(
	"output/playwright/dense-timeline-performance"
);

interface HarnessElement {
	id: string;
	type: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	[key: string]: unknown;
}

interface HarnessTrack {
	id: string;
	name: string;
	type: string;
	elements: HarnessElement[];
	muted?: boolean;
	isMain?: boolean;
	[key: string]: unknown;
}

interface HarnessTimelineState {
	_tracks: HarnessTrack[];
	tracks: HarnessTrack[];
	selectedElements: Array<{ trackId: string; elementId: string }>;
}

interface HarnessTimelineStore {
	getState: () => HarnessTimelineState;
	setState: (state: Partial<HarnessTimelineState>) => void;
}

interface DenseTimelineAudit {
	peakElements: number;
	stop: () => void;
}

interface HarnessWindow extends Window {
	__denseTimelineAudit?: DenseTimelineAudit;
	__mediaStore: {
		getState: () => { mediaItems: Array<{ id: string; name: string }> };
	};
	__timelineStore: HarnessTimelineStore;
}

async function readVisibleTimelineElementIds({
	page,
}: {
	page: Page;
}): Promise<string[]> {
	return page
		.locator("[data-testid='timeline-element']")
		.evaluateAll((elements) => {
			const viewport = document.querySelector<HTMLElement>(".timeline-scroll");
			if (!viewport) return [];
			const viewportBounds = viewport.getBoundingClientRect();
			return elements
				.filter((element) => {
					const bounds = element.getBoundingClientRect();
					return (
						bounds.right >= viewportBounds.left &&
						bounds.left <= viewportBounds.right
					);
				})
				.map((element) =>
					element instanceof HTMLElement
						? (element.dataset.elementId ?? "")
						: ""
				)
				.filter(Boolean);
		});
}

test.describe("Dense timeline performance", () => {
	test("bounds first-frame and scrolled DOM for 3200 timeline elements", async ({
		page,
	}) => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "Dense Timeline Performance");
		await importTestVideo(page);

		await page.evaluate(() => {
			const timelineRoot = document.querySelector(".timeline-scroll");
			if (!timelineRoot) throw new Error("Expected timeline viewport");
			const audit: DenseTimelineAudit = {
				peakElements: 0,
				stop: () => {},
			};
			const updatePeak = () => {
				audit.peakElements = Math.max(
					audit.peakElements,
					document.querySelectorAll("[data-testid='timeline-element']").length
				);
			};
			const observer = new MutationObserver(updatePeak);
			observer.observe(timelineRoot, { childList: true, subtree: true });
			audit.stop = () => observer.disconnect();
			(window as unknown as HarnessWindow).__denseTimelineAudit = audit;
		});

		const injectionMs = await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			const timeline = harness.__timelineStore;
			const current = timeline.getState();
			const mainTrack = current._tracks.find(
				(track) => track.isMain || track.type === "media"
			);
			const media = harness.__mediaStore.getState().mediaItems[0];
			if (!mainTrack || !media)
				throw new Error("Expected main track and media");
			const mediaElements: HarnessElement[] = Array.from(
				{ length: 1_200 },
				(_, index) => ({
					id: `dense-media-${index}`,
					name: `Dense media ${index}`,
					type: "media",
					mediaId: media.id,
					startTime: index,
					duration: 0.8,
					trimStart: 0,
					trimEnd: 0,
				})
			);
			const captionElements: HarnessElement[] = Array.from(
				{ length: 2_000 },
				(_, index) => ({
					id: `dense-caption-${index}`,
					name: `Dense caption ${index}`,
					type: "captions",
					text: `Caption ${index}`,
					language: "en",
					source: "transcription",
					startTime: index * 0.5,
					duration: 0.32,
					trimStart: 0,
					trimEnd: 0,
				})
			);
			const tracks: HarnessTrack[] = [
				{ ...mainTrack, elements: mediaElements },
				{
					id: "dense-captions",
					name: "Dense captions",
					type: "captions",
					elements: captionElements,
					muted: false,
				},
			];
			const startedAt = performance.now();
			timeline.setState({
				_tracks: tracks,
				tracks,
				selectedElements: [
					{ trackId: mainTrack.id, elementId: "dense-media-1199" },
				],
			});
			return performance.now() - startedAt;
		});

		await expect
			.poll(() => page.getByTestId("timeline-element").count())
			.toBeGreaterThan(0);
		await expect
			.poll(() => page.getByTestId("timeline-element").count())
			.toBeLessThan(180);
		expect(injectionMs).toBeLessThan(100);

		const firstAudit = await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			return {
				peakElements: harness.__denseTimelineAudit?.peakElements ?? 0,
			};
		});
		expect(firstAudit.peakElements).toBeLessThan(180);
		expect(firstAudit.peakElements).toBeGreaterThan(0);
		expect(await readVisibleTimelineElementIds({ page })).toContain(
			"dense-media-0"
		);

		await page.locator(".timeline-scroll").evaluate((viewport) => {
			const target = document.querySelector<HTMLElement>(
				"[data-element-id='dense-media-1199']"
			);
			if (!target) throw new Error("Expected preserved final media element");
			const viewportBounds = viewport.getBoundingClientRect();
			const targetBounds = target.getBoundingClientRect();
			const targetCenter =
				targetBounds.left -
				viewportBounds.left +
				viewport.scrollLeft +
				targetBounds.width / 2;
			viewport.scrollLeft = targetCenter - viewport.clientWidth / 2;
			viewport.dispatchEvent(new Event("scroll"));
		});
		await expect
			.poll(() => readVisibleTimelineElementIds({ page }))
			.toContain("dense-media-1199");
		await expect
			.poll(() => page.getByTestId("timeline-element").count())
			.toBeLessThan(180);

		await page.locator("[data-element-id='dense-media-1199']").click();
		const selected = await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			return harness.__timelineStore.getState().selectedElements;
		});
		expect(selected).toEqual([
			expect.objectContaining({ elementId: "dense-media-1199" }),
		]);

		await page.screenshot({
			path: path.join(outputDirectory, "01-dense-timeline-end.png"),
			animations: "disabled",
		});
		const finalDomElements = await page.getByTestId("timeline-element").count();
		await writeFile(
			path.join(outputDirectory, "metrics.json"),
			JSON.stringify(
				{
					injectionMs,
					peakDomElements: firstAudit.peakElements,
					finalDomElements,
				},
				null,
				2
			)
		);
		await page.evaluate(() => {
			const harness = window as unknown as HarnessWindow;
			harness.__denseTimelineAudit?.stop();
		});
	});
});
