/**
 * Agent pointer HTML5 drag-and-drop — real Electron evidence.
 *
 * Media panel items are HTML5 drag sources (`application/x-media-item`) and
 * the timeline track only accepts drops through `dataTransfer`, so a
 * mouse-only pointer drag cannot place a clip. This test drives the real CLI
 * against an isolated QCut instance and asserts that
 * `editor:pointer:drag --dnd html5` intercepts the page's drag through CDP,
 * replays it as drag events, and lands one timeline element.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { importTestVideo } from "./helpers/e2e-panel-helpers";
import { createTestProject } from "./helpers/electron-helpers";
import { isolatedElectronTest } from "./helpers/isolated-electron-fixture";
import { runQCutPipelineCli } from "./helpers/qcut-pipeline-cli";

interface PointerDragEnvelopeData {
	action?: string;
	input?: string;
	inputMode?: string;
	dnd?: {
		mode?: string;
		intercepted?: boolean;
		backend?: string;
		mimeTypes?: string[];
	};
}

interface TimelineSummary {
	tracks: number;
	elements: number;
	mediaElements: number;
}

type PageHandle = import("@playwright/test").Page;

async function visibleBox({
	page,
	testId,
}: {
	page: PageHandle;
	testId: string;
}) {
	const locator = page.getByTestId(testId).first();
	await expect(locator).toBeVisible({ timeout: 10_000 });
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${testId} has no bounding box`);
	const viewport = await page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
	return { box, viewport };
}

async function centerOf({
	page,
	testId,
}: {
	page: PageHandle;
	testId: string;
}): Promise<{ x: number; y: number }> {
	const { box } = await visibleBox({ page, testId });
	return {
		x: Math.round(box.x + box.width / 2),
		y: Math.round(box.y + box.height / 2),
	};
}

/**
 * A timeline track is as wide as the whole virtual timeline, so its geometric
 * center sits far outside the window. Drop a little way into the visible part
 * of the track instead.
 */
async function dropPointOnTrack({
	page,
}: {
	page: PageHandle;
}): Promise<{ x: number; y: number }> {
	const { box, viewport } = await visibleBox({ page, testId: "timeline-track" });
	const visibleLeft = Math.max(box.x, 0);
	const visibleRight = Math.min(box.x + box.width, viewport.width);
	if (visibleRight <= visibleLeft) {
		throw new Error("timeline-track is not visible inside the viewport");
	}
	return {
		x: Math.round(Math.min(visibleLeft + 160, visibleRight - 20)),
		y: Math.round(box.y + box.height / 2),
	};
}

function readTimeline(page: PageHandle) {
	return page.evaluate((): TimelineSummary => {
		const store = (
			window as unknown as {
				__timelineStore: {
					getState: () => {
						tracks: Array<{
							elements: Array<{ type?: string; mediaId?: string }>;
						}>;
					};
				};
			}
		).__timelineStore.getState();
		const elements = store.tracks.flatMap((track) => track.elements);
		return {
			tracks: store.tracks.length,
			elements: elements.length,
			mediaElements: elements.filter((element) => element.type === "media")
				.length,
		};
	});
}

isolatedElectronTest.describe("Agent pointer HTML5 drag-and-drop", () => {
	isolatedElectronTest(
		"drops a media panel item onto the timeline through the CLI",
		async ({ page, apiPort }) => {
			isolatedElectronTest.setTimeout(180_000);
			await createTestProject(page, "Pointer HTML5 Drag");
			await importTestVideo(page);

			const from = await centerOf({ page, testId: "media-item" });
			const to = await dropPointOnTrack({ page });
			const before = await readTimeline(page);
			expect(before.elements).toBe(0);

			const evidence = await runQCutPipelineCli({
				apiPort,
				args: [
					"editor:pointer:drag",
					"--from-x",
					String(from.x),
					"--from-y",
					String(from.y),
					"--to-x",
					String(to.x),
					"--to-y",
					String(to.y),
					"--dnd",
					"html5",
					"--force",
				],
			});
			const evidenceDirectory = resolve(
				"output/playwright/agent-pointer-html5-drag"
			);
			await mkdir(evidenceDirectory, { recursive: true });
			await writeFile(
				resolve(evidenceDirectory, "cli-envelopes.json"),
				JSON.stringify(evidence.envelopes, null, 2)
			);
			const envelope = evidence.envelopes.find(
				(candidate) => candidate.status === "ok"
			);
			const envelopeText = JSON.stringify(evidence.envelopes);
			expect(envelope?.status, envelopeText).toBe("ok");
			// The CLI wraps editor responses as data.{schema_version, command, data}.
			const data = (
				envelope?.data as { data?: PointerDragEnvelopeData } | undefined
			)?.data;
			expect(data?.action, envelopeText).toBe("drag");
			expect(data?.inputMode).toBe("background");
			expect(data?.dnd).toMatchObject({
				mode: "html5",
				intercepted: true,
				backend: "cdp-dispatch-drag-event",
			});
			expect(data?.dnd?.mimeTypes).toContain("application/x-media-item");

			await expect(page.locator('[data-testid="timeline-element"]')).toHaveCount(
				1,
				{ timeout: 10_000 }
			);
			const after = await readTimeline(page);
			expect(after.elements).toBe(1);
			expect(after.mediaElements).toBe(1);

			await page.screenshot({
				path: resolve(evidenceDirectory, "after-drop.png"),
			});
			await writeFile(
				resolve(evidenceDirectory, "cli-envelope.json"),
				JSON.stringify({ from, to, before, after, envelope }, null, 2)
			);
		}
	);
});
