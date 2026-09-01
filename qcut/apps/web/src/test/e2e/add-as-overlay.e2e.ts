/**
 * "Add as Overlay" regression gate.
 *
 * The media panel's context action used to create an overlay-store sticker
 * with no timeline element. Such an orphan has no timing, is treated as
 * always visible, and gets composited into every exported frame. This spec
 * drives the real context menu and pins the repaired contract:
 *
 *  - the overlay entry and the timeline StickerElement exist as a 1:1 pair
 *    (OverlaySticker.id === StickerElement.stickerId);
 *  - the element carries the intended playhead-anchored window, so the
 *    sticker is NOT visible outside it;
 *  - with an empty timeline the action refuses and creates nothing.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const FIXTURE_DIR = path.join(tmpdir(), "qcut-add-as-overlay-fixtures");
const CLIP_SECONDS = 8;

function generateClip(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "overlay-base.mp4");
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			`testsrc2=size=640x360:rate=30:duration=${CLIP_SECONDS}`,
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

interface OverlayTimelineSnapshot {
	overlayIds: string[];
	stickerElements: Array<{
		stickerId?: string;
		startTime: number;
		duration: number;
	}>;
}

async function snapshotPair({
	page,
}: {
	page: import("@playwright/test").Page;
}): Promise<OverlayTimelineSnapshot> {
	return await page.evaluate(() => {
		const harness = window as unknown as {
			__timelineStore: { getState: () => any };
		};
		const stickersState = (
			window as unknown as {
				stickerTest: { getStores: () => { stickers: any } };
			}
		).stickerTest.getStores().stickers;
		const overlayIds = Array.from(
			(stickersState.overlayStickers as Map<string, unknown>).keys()
		);
		const stickerElements = harness.__timelineStore
			.getState()
			.tracks.flatMap((track: { elements: unknown[] }) => track.elements)
			.filter((element: { type: string }) => element.type === "sticker")
			.map(
				(element: {
					stickerId?: string;
					startTime: number;
					duration: number;
				}) => ({
					duration: element.duration,
					startTime: element.startTime,
					stickerId: element.stickerId,
				})
			);
		return { overlayIds, stickerElements };
	});
}

test.use({ captureScreenshotVideo: false });
test.setTimeout(600_000);

test.describe("media panel add as overlay", () => {
	test("creates a timeline-backed overlay anchored at the playhead", async ({
		page,
	}) => {
		const clipPath = generateClip();
		await createTestProject(page, "Add As Overlay");
		await uploadTestMedia(page, clipPath);

		// Base timeline: without it the action must refuse (covered below by
		// running the refusal case first, before any element exists).
		const beforeAny = await page.evaluate(async () => {
			const harness = window as unknown as {
				stickerTest: { getStores: () => { stickers: any } };
				stickerTestReady: Promise<void>;
			};
			await harness.stickerTestReady;
			return (
				harness.stickerTest.getStores().stickers.overlayStickers as Map<
					string,
					unknown
				>
			).size;
		});
		expect(beforeAny).toBe(0);

		// --- refusal on empty timeline -----------------------------------------
		const mediaCard = page.getByTestId("media-item").first();
		await mediaCard.click({ button: "right" });
		await page.getByRole("menuitem", { name: "Add as overlay" }).click();
		await expect(page.getByText("Add media to timeline first")).toBeVisible();
		const afterRefusal = await snapshotPair({ page });
		expect(afterRefusal.overlayIds).toHaveLength(0);
		expect(afterRefusal.stickerElements).toHaveLength(0);

		// --- place base media, park the playhead, run the action ---------------
		await page.evaluate((clipSeconds) => {
			const harness = window as unknown as {
				__timelineStore: { getState: () => any };
				__mediaStore: { getState: () => any };
				__playbackStore: { getState: () => { seek: (t: number) => void } };
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
					duration: clipSeconds,
					mediaId: item.id,
					name: "base-clip",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				},
				{ pushHistory: false, selectElement: false }
			);
			harness.__playbackStore.getState().seek(2);
		}, CLIP_SECONDS);

		await mediaCard.click({ button: "right" });
		await page.getByRole("menuitem", { name: "Add as overlay" }).click();
		await expect(page.getByText(/Added .* as overlay/)).toBeVisible({
			timeout: 15_000,
		});

		// --- the repaired contract ---------------------------------------------
		const after = await snapshotPair({ page });
		expect(after.overlayIds).toHaveLength(1);
		expect(after.stickerElements).toHaveLength(1);
		// 1:1 pairing — this is exactly what the orphan bug violated.
		expect(after.stickerElements[0].stickerId).toBe(after.overlayIds[0]);
		// Playhead-anchored 5s window.
		expect(after.stickerElements[0].startTime).toBeCloseTo(2, 1);
		expect(after.stickerElements[0].duration).toBeCloseTo(5, 1);

		// Timing resolves from the timeline, so the sticker must be invisible
		// outside its window — the orphan was "always visible" instead.
		const visibility = await page.evaluate(() => {
			const stickers = (
				window as unknown as {
					stickerTest: { getStores: () => { stickers: any } };
				}
			).stickerTest.getStores().stickers;
			return {
				atEight: stickers.getVisibleStickersAtTime(7.9).length,
				atFour: stickers.getVisibleStickersAtTime(4).length,
				atOne: stickers.getVisibleStickersAtTime(1).length,
			};
		});
		expect(visibility.atFour).toBe(1);
		expect(visibility.atOne).toBe(0);
		expect(visibility.atEight).toBe(0);
	});
});
