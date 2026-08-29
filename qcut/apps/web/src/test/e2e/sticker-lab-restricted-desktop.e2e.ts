import { rm } from "node:fs/promises";
import { test } from "@playwright/test";
import {
	createOriginalStickerLabFixture,
	type OriginalStickerLabFixture,
} from "./helpers/sticker-lab-desktop-fixture";
import {
	REAL_STICKER_CACHE_CASES,
	REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
} from "./helpers/sticker-lab-real-cache-cases";
import { runRealCachedStickerExport } from "./helpers/sticker-lab-real-cache-lifecycle";
import { runRestrictedStickerLifecycle } from "./helpers/sticker-lab-synthetic-lifecycle";

test.describe("Sticker Lab local video lifecycle", () => {
	let fixture: OriginalStickerLabFixture;

	test.beforeAll(async () => {
		fixture = await createOriginalStickerLabFixture();
	});

	test.afterAll(async () => {
		if (fixture) {
			await rm(fixture.cleanupRoot, { recursive: true, force: true });
		}
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Direct GIF previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.directGif,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Atlas previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.atlas,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("PNG sequence previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.pngSequence,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Alpha Video previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.alphaVideo,
			testInfo,
		});
	});
});

test.describe("Sticker Lab real local cache export", () => {
	test.skip(
		!REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
		"Set QCUT_REAL_STICKER_LAB_VIDEOS_DIRECTORY to run against local caches"
	);

	for (const cacheCase of REAL_STICKER_CACHE_CASES) {
		// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
		test(`${cacheCase.displayName} loads from the real cache and exports`, async ({}, testInfo) => {
			test.setTimeout(360_000);
			await runRealCachedStickerExport({ cacheCase, testInfo });
		});
	}

	if (process.env.QCUT_STICKER_LAB_FULL_RENDER_BENCHMARK === "1") {
		const benchmarkCase = REAL_STICKER_CACHE_CASES[2];
		// biome-ignore lint/correctness/noEmptyPattern: benchmark launches its own isolated Electron process.
		test("full 5-second 720p renderer benchmark", async ({}, testInfo) => {
			test.setTimeout(360_000);
			await runRealCachedStickerExport({
				cacheCase: benchmarkCase,
				fullRenderBenchmark: true,
				testInfo,
			});
		});
	}
});
