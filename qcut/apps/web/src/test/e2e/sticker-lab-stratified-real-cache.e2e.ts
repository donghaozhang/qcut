import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { runStratifiedRealCacheStickerExports } from "./helpers/sticker-lab-stratified-batch-lifecycle";

const INPUT_VIDEO_PATH = process.env.QCUT_REAL_STICKER_LAB_VIDEO_PATH;
const VIDEOS_DIRECTORY = process.env.QCUT_REAL_STICKER_LAB_VIDEOS_DIRECTORY;
const ENABLED = process.env.QCUT_STICKER_LAB_STRATIFIED_E2E === "1";

test.describe("Sticker Lab stratified real-cache exports", () => {
	test.skip(
		!ENABLED ||
			!INPUT_VIDEO_PATH ||
			!VIDEOS_DIRECTORY ||
			!existsSync(INPUT_VIDEO_PATH) ||
			!existsSync(VIDEOS_DIRECTORY),
		"Requires the private Sticker Lab cache, a real HEVC/AAC video, and QCUT_STICKER_LAB_STRATIFIED_E2E=1"
	);

	// biome-ignore lint/correctness/noEmptyPattern: the runner launches its own isolated Electron process.
	test("exports two real cached stickers per category through CLI and a UI subset", async ({}, testInfo) => {
		test.setTimeout(3_600_000);
		if (!(INPUT_VIDEO_PATH && VIDEOS_DIRECTORY)) {
			throw new Error("Stratified Sticker Lab environment is incomplete");
		}
		const summary = await runStratifiedRealCacheStickerExports({
			inputVideoPath: INPUT_VIDEO_PATH,
			testInfo,
			videosDirectory: VIDEOS_DIRECTORY,
		});
		expect(summary.sourceBatchCount).toBeGreaterThanOrEqual(18);
		expect(summary.categoryCount).toBeGreaterThanOrEqual(43);
		expect(summary.itemCount).toBeGreaterThanOrEqual(2_924);
		expect(summary.sourceMedia).toMatchObject({
			audioChannels: 2,
			audioCodec: "aac",
			audioSampleRate: 44_100,
			frameRate: 30,
			videoCodec: "hevc",
		});
		expect(summary.baselineMedia).toMatchObject({
			audioChannels: 2,
			audioCodec: "aac",
			audioSampleRate: 48_000,
			frameRate: 30,
			height: 720,
			videoCodec: "h264",
			width: 1280,
		});
		expect(summary.cliPassedItemCount).toBe(summary.categoryCount * 2);
		expect(summary.uiPassedItemCount).toBe(12);
		expect(summary.outputVideoCount).toBe(
			1 + summary.cliBatchCount + summary.uiBatchCount
		);
	});
});
