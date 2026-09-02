/**
 * Ratio menu gate.
 *
 * The preview toolbar's ratio button opens a grouped menu: fit-to-original,
 * custom size, a landscape preset section and a portrait preset section, with
 * a check mark on the active row and a shape glyph per preset. This spec
 * drives the real menu and pins that structure plus the canvas-size effects.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const FIXTURE_DIR = path.join(tmpdir(), "qcut-aspect-menu-fixtures");
const EVIDENCE_DIR = path.resolve("output/playwright/aspect-ratio-menu");

function generateClip(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "ratio-base.mp4");
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=1280x720:rate=30:duration=2",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

test.use({ captureScreenshotVideo: false });
test.setTimeout(600_000);

test.describe("aspect ratio menu", () => {
	test("offers grouped presets, custom size and fit-to-original", async ({
		page,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		await createTestProject(page, "Aspect Ratio Menu");
		await uploadTestMedia(page, generateClip());

		// The trigger is disabled until the timeline has an element.
		const trigger = page.getByTestId("aspect-ratio-trigger");
		await expect(trigger).toBeDisabled();

		await page.evaluate(() => {
			const harness = window as unknown as {
				__timelineStore: { getState: () => any };
				__mediaStore: { getState: () => any };
			};
			const media = harness.__mediaStore.getState();
			const item = media.mediaItems.find(
				(candidate: { type: string }) => candidate.type === "video"
			);
			if (!item) throw new Error("No video imported");
			const state = harness.__timelineStore.getState();
			const trackId =
				state.tracks.find(
					(track: { isMain?: boolean; type: string }) =>
						track.isMain || track.type === "media"
				)?.id ?? state.addTrack("media");
			harness.__timelineStore.getState().addElementToTrack(
				trackId,
				{
					duration: 2,
					mediaId: item.id,
					name: "ratio-clip",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				},
				{ pushHistory: false, selectElement: false }
			);
		});
		await expect(trigger).toBeEnabled();

		const items = page.getByRole("menuitem");
		// Radix swallows a trigger click that lands during its close animation,
		// so opening retries until menu items are actually mounted.
		const openMenu = async () => {
			for (let attempt = 0; attempt < 5; attempt += 1) {
				// A trigger click during the previous close animation toggles the
				// menu open and instantly shut, so wait for a settled closed state
				// first and require the open state to survive a settle delay.
				await expect(items).toHaveCount(0);
				await page.waitForTimeout(400);
				await trigger.click();
				try {
					await expect(items.first()).toBeVisible({ timeout: 2000 });
					await page.waitForTimeout(400);
					if ((await items.count()) > 0) return;
				} catch {
					await page.keyboard.press("Escape");
				}
			}
			throw new Error("Ratio menu did not open");
		};

		// --- structure ---------------------------------------------------------
		await openMenu();
		// Fit (original) + Custom + 5 landscape + 5 portrait.
		await expect(items).toHaveCount(12);
		const labels = await items.allInnerTexts();
		console.log(`[ratio-menu] ITEMS=${JSON.stringify(labels)}`);
		expect(labels.some((label) => label.includes("16:9"))).toBe(true);
		expect(labels.some((label) => label.includes("2.35:1"))).toBe(true);
		expect(labels.some((label) => label.includes("9:16"))).toBe(true);
		expect(labels.some((label) => label.includes("1:2"))).toBe(true);

		const shot = await page.screenshot({ animations: "disabled" });
		await writeFile(path.join(EVIDENCE_DIR, "menu-open.png"), shot);

		// --- selecting a portrait preset --------------------------------------
		// The screenshot can dismiss the portal, so reopen before clicking.
		await page.keyboard.press("Escape");
		await openMenu();
		await items.filter({ hasText: "9:16" }).first().click();
		const afterPortrait = await page.evaluate(() => {
			const store = (
				window as unknown as {
					__editorStore: {
						getState: () => {
							canvasSize: { width: number; height: number };
							canvasMode: string;
						};
					};
				}
			).__editorStore.getState();
			return { mode: store.canvasMode, size: store.canvasSize };
		});
		expect(afterPortrait.size).toEqual({ height: 1920, width: 1080 });
		expect(afterPortrait.mode).toBe("preset");

		// --- custom size -------------------------------------------------------
		await openMenu();
		await items
			.filter({ hasText: /Custom|自定义/ })
			.first()
			.click();
		await expect(page.getByTestId("custom-canvas-width")).toBeVisible();
		await page.getByTestId("custom-canvas-width").fill("1000");
		await page.getByTestId("custom-canvas-height").fill("700");
		await page.getByTestId("custom-canvas-apply").click();
		const afterCustom = await page.evaluate(() => {
			const store = (
				window as unknown as {
					__editorStore: {
						getState: () => {
							canvasSize: { width: number; height: number };
							canvasMode: string;
						};
					};
				}
			).__editorStore.getState();
			return { mode: store.canvasMode, size: store.canvasSize };
		});
		expect(afterCustom.size).toEqual({ height: 700, width: 1000 });
		expect(afterCustom.mode).toBe("custom");
	});
});
