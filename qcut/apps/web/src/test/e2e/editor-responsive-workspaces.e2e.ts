import {
	createTestProject,
	expect,
	importTestVideo,
	test,
	waitForProjectLoad,
} from "./helpers/electron-helpers";
import { assertScreenshot } from "./utils/visual-regression";

const WORKSPACES = [
	{ height: 1440, label: "1440p", width: 2560 },
	{ height: 1440, label: "ultrawide", width: 3440 },
	{ height: 2160, label: "4k", width: 3840 },
] as const;

interface ResponsiveHarnessWindow extends Window {
	__playbackStore: { getState: () => { seek: (time: number) => void } };
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				elements: Array<{ id: string; startTime: number }>;
			}>;
			updateElementStartTime: (
				trackId: string,
				elementId: string,
				startTime: number,
				pushHistory: boolean
			) => void;
		};
	};
}

for (const workspace of WORKSPACES) {
	test(`editor layout remains usable at ${workspace.label}`, async ({
		page,
	}) => {
		await page.setViewportSize({
			height: workspace.height,
			width: workspace.width,
		});
		await createTestProject(page, `Responsive ${workspace.label}`);
		await waitForProjectLoad(page);
		await importTestVideo(page);
		await page
			.getByTestId("media-item")
			.first()
			.dragTo(page.getByTestId("timeline-track").first());
		await page.getByTestId("timeline-element").first().click();
		await page.evaluate(() => {
			const harness = window as unknown as ResponsiveHarnessWindow;
			const timeline = harness.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.elements.length > 0
			);
			const element = track?.elements[0];
			if (!track || !element)
				throw new Error("Expected imported timeline clip");
			timeline.updateElementStartTime(track.id, element.id, 0, false);
			harness.__playbackStore.getState().seek(0.25);
		});
		await expect
			.poll(() => page.getByTestId("preview-panel").locator("video").count())
			.toBeGreaterThanOrEqual(1);

		const mediaPanel = page.getByTestId("media-panel");
		const previewPanel = page.getByTestId("preview-panel");
		const timelineToolbar = page.getByTestId("timeline-toolbar");
		await expect(mediaPanel).toBeVisible();
		await expect(previewPanel).toBeVisible();
		await expect(timelineToolbar).toBeVisible();
		await expect(page.getByTestId("timeline-edit-mode-control")).toBeVisible();

		const layout = await page.evaluate(() => {
			const media = document.querySelector<HTMLElement>(
				'[data-testid="media-panel"]'
			);
			const preview = document.querySelector<HTMLElement>(
				'[data-testid="preview-panel"]'
			);
			const toolbar = document.querySelector<HTMLElement>(
				'[data-testid="timeline-toolbar"]'
			);
			if (!media || !preview || !toolbar) return null;
			const mediaRect = media.getBoundingClientRect();
			const previewRect = preview.getBoundingClientRect();
			const toolbarRect = toolbar.getBoundingClientRect();
			return {
				bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
				mediaRight: mediaRect.right,
				previewLeft: previewRect.left,
				previewWidth: previewRect.width,
				toolbarBottom: toolbarRect.bottom,
				viewportHeight: window.innerHeight,
			};
		});
		expect(layout).not.toBeNull();
		expect(layout?.bodyOverflow ?? 1).toBeLessThanOrEqual(1);
		expect(layout?.mediaRight ?? 1).toBeLessThanOrEqual(
			(layout?.previewLeft ?? 0) + 1
		);
		expect(layout?.previewWidth ?? 0).toBeGreaterThanOrEqual(320);
		expect(
			layout?.toolbarBottom ?? Number.POSITIVE_INFINITY
		).toBeLessThanOrEqual(layout?.viewportHeight ?? 0);

		await page.waitForTimeout(500);
		await assertScreenshot(page, `editor-workspace-${workspace.label}`);
	});
}
