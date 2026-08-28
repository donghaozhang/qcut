import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	commitPersonCutoutMaskCache,
	createPersonCutoutCacheIdentity,
	createPersonCutoutCacheKey,
	createPersonCutoutMaskCacheBuild,
	discardPersonCutoutMaskCacheBuild,
	inspectPersonCutoutMaskCache,
} from "../jianying-person-cutout/mask-cache.js";
import { TEMATTING_COMPATIBLE_BLEND } from "../jianying-person-cutout/tematting-blend.js";

describe("person cutout mask cache", () => {
	let temporaryDirectory = "";
	let sourcePath = "";
	const previousCacheRoot = process.env.QCUT_PERSON_CUTOUT_CACHE_ROOT;

	beforeEach(async () => {
		temporaryDirectory = await mkdtemp(
			path.join(os.tmpdir(), "qcut-person-cutout-cache-test-")
		);
		process.env.QCUT_PERSON_CUTOUT_CACHE_ROOT = path.join(
			temporaryDirectory,
			"cache"
		);
		sourcePath = path.join(temporaryDirectory, "source.mp4");
		await writeFile(sourcePath, Buffer.alloc(256 * 1024, 7));
	});

	afterEach(async () => {
		if (previousCacheRoot === undefined) {
			Reflect.deleteProperty(process.env, "QCUT_PERSON_CUTOUT_CACHE_ROOT");
		} else {
			process.env.QCUT_PERSON_CUTOUT_CACHE_ROOT = previousCacheRoot;
		}
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	async function createIdentity({
		modelRoute = "portrait-gru",
		processorSha256 = "processor-sha",
		threshold = 0.5,
	}: {
		modelRoute?: "portrait-gru" | "video-object" | "saliency-script";
		processorSha256?: string;
		threshold?: number;
	} = {}) {
		return createPersonCutoutCacheIdentity({
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			frameRate: 30,
			height: 3,
			modelName: "tt_matting_video_gru_v1.0.model",
			modelRoute,
			modelSha256: "model-sha",
			processorSha256,
			settings: {
				edgeShift: 0,
				feather: 0,
				temporalSmoothing: 0,
				threshold,
			},
			sourcePath,
			width: 4,
		});
	}

	it("commits only complete, frame-addressable alpha data", async () => {
		const identity = await createIdentity();
		const build = await createPersonCutoutMaskCacheBuild({ identity });
		await writeFile(build.alphaPath, Buffer.alloc(24, 255));
		const committed = await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount: 2,
			identity,
		});

		expect(await inspectPersonCutoutMaskCache({ identity })).toEqual(committed);
	});

	it("rejects a cache whose alpha payload lost one byte", async () => {
		const identity = await createIdentity();
		const build = await createPersonCutoutMaskCacheBuild({ identity });
		await writeFile(build.alphaPath, Buffer.alloc(24, 255));
		const committed = await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount: 2,
			identity,
		});
		await writeFile(committed.alphaPath, Buffer.alloc(23, 255));

		expect(await inspectPersonCutoutMaskCache({ identity })).toBeNull();
	});

	it("does not publish an incomplete build", async () => {
		const identity = await createIdentity();
		const build = await createPersonCutoutMaskCacheBuild({ identity });
		await writeFile(build.alphaPath, Buffer.alloc(23, 255));

		await expect(
			commitPersonCutoutMaskCache({
				buildDirectory: build.directory,
				frameCount: 2,
				identity,
			})
		).rejects.toThrow("人物蒙版缓存不完整");
		await discardPersonCutoutMaskCacheBuild({
			buildDirectory: build.directory,
		});
	});

	it("invalidates the key when a mask-producing setting changes", async () => {
		const [defaultIdentity, shiftedIdentity] = await Promise.all([
			createIdentity(),
			createIdentity({ threshold: 0.6 }),
		]);

		expect(createPersonCutoutCacheKey({ identity: defaultIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: shiftedIdentity })
		);
	});

	it("invalidates the key when the native mask processor changes", async () => {
		const [firstIdentity, updatedIdentity] = await Promise.all([
			createIdentity(),
			createIdentity({ processorSha256: "updated-processor-sha" }),
		]);

		expect(createPersonCutoutCacheKey({ identity: firstIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: updatedIdentity })
		);
	});

	it("invalidates the key when only the middle of source media changes", async () => {
		const originalIdentity = await createIdentity();
		const changedSource = Buffer.alloc(256 * 1024, 7);
		changedSource[128 * 1024] = 8;
		await writeFile(sourcePath, changedSource);
		const changedIdentity = await createIdentity();

		expect(createPersonCutoutCacheKey({ identity: originalIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: changedIdentity })
		);
	});

	it("never reuses a GRU mask for the saliency route", async () => {
		const [portraitIdentity, saliencyIdentity] = await Promise.all([
			createIdentity(),
			createIdentity({ modelRoute: "saliency-script" }),
		]);

		expect(createPersonCutoutCacheKey({ identity: portraitIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: saliencyIdentity })
		);
	});

	it("never reuses a GRU mask for the video-object route", async () => {
		const [portraitIdentity, objectIdentity] = await Promise.all([
			createIdentity(),
			createIdentity({ modelRoute: "video-object" }),
		]);

		expect(createPersonCutoutCacheKey({ identity: portraitIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: objectIdentity })
		);
	});

	it("reuses content after the editor copies it to a new temporary path", async () => {
		const originalIdentity = await createIdentity();
		const copiedSourcePath = path.join(temporaryDirectory, "copied-source.mp4");
		await copyFile(sourcePath, copiedSourcePath);
		const copiedIdentity = await createPersonCutoutCacheIdentity({
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			frameRate: 30,
			height: 3,
			modelName: "tt_matting_video_gru_v1.0.model",
			modelSha256: "model-sha",
			processorSha256: "processor-sha",
			settings: {
				edgeShift: 0,
				feather: 0,
				temporalSmoothing: 0,
				threshold: 0.5,
			},
			sourcePath: copiedSourcePath,
			width: 4,
		});

		expect(createPersonCutoutCacheKey({ identity: copiedIdentity })).toBe(
			createPersonCutoutCacheKey({ identity: originalIdentity })
		);
	});
});
