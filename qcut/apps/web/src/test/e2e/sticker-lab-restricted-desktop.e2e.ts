import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { test } from "@playwright/test";
import {
	createOriginalStickerLabFixture,
	type OriginalStickerLabFixture,
} from "./helpers/sticker-lab-desktop-fixture";
import {
	REAL_STICKER_CACHE_CASES,
	REAL_STICKER_CACHE_EXTREME_GIF_CASE,
	REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
} from "./helpers/sticker-lab-real-cache-cases";
import {
	REAL_VIDEO_PROFILE,
	runTrueCliCachedStickerExport,
} from "./helpers/sticker-lab-cli-cache-lifecycle";
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

const REAL_HEVC_AAC_VIDEO_PATH = process.env.QCUT_REAL_STICKER_LAB_VIDEO_PATH;
const REAL_HEVC_AAC_FULL_CYCLE_VIDEO_PATH =
	process.env.QCUT_REAL_STICKER_LAB_FULL_CYCLE_VIDEO_PATH;
const REAL_HEVC_AAC_FULL_CYCLE_DURATION_SECONDS = Number(
	process.env.QCUT_REAL_STICKER_LAB_FULL_CYCLE_DURATION_SECONDS ?? "14.134652"
);
const REAL_HEVC_AAC_FULL_CYCLE_PROFILE = {
	...REAL_VIDEO_PROFILE,
	durationSeconds: REAL_HEVC_AAC_FULL_CYCLE_DURATION_SECONDS,
	postSplitFrameHashFrames: [271, 277, 283, 289, 295],
	times: {
		...REAL_VIDEO_PROFILE.times,
		nearEnd: 13.49,
		postSplit: 9.2,
	},
};

function requireRealStickerLabVideoPath(): string {
	if (!REAL_HEVC_AAC_VIDEO_PATH) {
		throw new Error("QCUT_REAL_STICKER_LAB_VIDEO_PATH is not configured");
	}
	return REAL_HEVC_AAC_VIDEO_PATH;
}

test.describe("Sticker Lab true CLI-add real video export", () => {
	test.skip(
		!REAL_STICKER_CACHE_VIDEOS_DIRECTORY ||
			!REAL_HEVC_AAC_VIDEO_PATH ||
			!existsSync(REAL_HEVC_AAC_VIDEO_PATH),
		"Requires the private Sticker Lab cache and the real HEVC/AAC test video"
	);

	// biome-ignore lint/correctness/noEmptyPattern: test launches its own isolated Electron process.
	test("true CLI-add cached GIF survives split and reload before CLI export", async ({}, testInfo) => {
		test.setTimeout(480_000);
		await runTrueCliCachedStickerExport({
			inputVideoPath: requireRealStickerLabVideoPath(),
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: test launches its own isolated Electron process.
	test("true CLI-add 225-frame cached GIF seeks late and exports", async ({}, testInfo) => {
		test.setTimeout(600_000);
		await runTrueCliCachedStickerExport({
			artifactStem: "real-hevc-aac-225-frame-cli",
			cacheCase: REAL_STICKER_CACHE_EXTREME_GIF_CASE,
			inputVideoPath: requireRealStickerLabVideoPath(),
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: test launches its own isolated Electron process.
	test("true CLI-add 225-frame cached GIF exports every frame and wraps", async ({}, testInfo) => {
		test.skip(
			!REAL_HEVC_AAC_FULL_CYCLE_VIDEO_PATH ||
				!existsSync(REAL_HEVC_AAC_FULL_CYCLE_VIDEO_PATH) ||
				!Number.isFinite(REAL_HEVC_AAC_FULL_CYCLE_DURATION_SECONDS),
			"Requires a private HEVC/AAC input longer than the 13.5-second GIF cycle"
		);
		test.setTimeout(900_000);
		if (!REAL_HEVC_AAC_FULL_CYCLE_VIDEO_PATH) {
			throw new Error("Full-cycle real Sticker Lab video is not configured");
		}
		await runTrueCliCachedStickerExport({
			artifactStem: "real-hevc-aac-225-frame-full-cycle-cli",
			cacheCase: REAL_STICKER_CACHE_EXTREME_GIF_CASE,
			inputVideoPath: REAL_HEVC_AAC_FULL_CYCLE_VIDEO_PATH,
			profile: REAL_HEVC_AAC_FULL_CYCLE_PROFILE,
			testInfo,
		});
	});
});

test.describe("Sticker Lab true UI-add real video export", () => {
	test.skip(
		!REAL_STICKER_CACHE_VIDEOS_DIRECTORY ||
			!REAL_HEVC_AAC_VIDEO_PATH ||
			!existsSync(REAL_HEVC_AAC_VIDEO_PATH),
		"Requires the private Sticker Lab cache and the real HEVC/AAC test video"
	);

	// biome-ignore lint/correctness/noEmptyPattern: test launches its own isolated Electron process.
	test("UI-add cached GIF survives split and reload before UI export", async ({}, testInfo) => {
		test.setTimeout(600_000);
		await runRealCachedStickerExport({
			artifactStem: "real-hevc-aac-ui-add-ui-export",
			cacheCase: REAL_STICKER_CACHE_CASES[0],
			inputVideoPath: requireRealStickerLabVideoPath(),
			profileOverride: REAL_VIDEO_PROFILE,
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
