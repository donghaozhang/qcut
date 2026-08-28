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
	type PersonCutoutPipelineDescriptor,
} from "../jianying-person-cutout/mask-cache.js";
import {
	GRU_ONLY_PERSON_CUTOUT_PIPELINE,
	GRU_VISION_PERSON_CUTOUT_PIPELINE,
	JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
	JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE,
	SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE,
	selectVideoObjectPersonCutoutPipeline,
	VIDEO_OBJECT_HOST_INTEROP_PERSON_CUTOUT_PIPELINE,
	VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
} from "../jianying-person-cutout/pipeline-descriptor.js";
import {
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_CANARY,
	type TemattingBlendImplementation,
} from "../jianying-person-cutout/tematting-blend.js";

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
		blendImplementation = TEMATTING_COMPATIBLE_BLEND,
		modelRoute = "portrait-gru",
		pipelineDescriptor,
		processorSha256 = "processor-sha",
		signal,
		threshold = 0.5,
	}: {
		blendImplementation?: TemattingBlendImplementation;
		modelRoute?: "portrait-gru" | "video-object" | "saliency-script";
		pipelineDescriptor?: PersonCutoutPipelineDescriptor;
		processorSha256?: string;
		signal?: AbortSignal;
		threshold?: number;
	} = {}) {
		return createPersonCutoutCacheIdentity({
			blendImplementation,
			frameRate: 30,
			height: 3,
			modelName: "tt_matting_video_gru_v1.0.model",
			modelRoute,
			modelSha256: "model-sha",
			pipelineDescriptor,
			processorSha256,
			settings: {
				edgeShift: 0,
				feather: 0,
				temporalSmoothing: 0,
				threshold,
			},
			signal,
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

	it("rejects equal-size alpha corruption", async () => {
		const identity = await createIdentity();
		const build = await createPersonCutoutMaskCacheBuild({ identity });
		await writeFile(build.alphaPath, Buffer.alloc(24, 255));
		const committed = await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount: 2,
			identity,
		});
		await writeFile(committed.alphaPath, Buffer.alloc(24, 0));

		expect(await inspectPersonCutoutMaskCache({ identity })).toBeNull();
	});

	it("does not swallow cancellation while hashing source or cached Alpha", async () => {
		const sourceController = new AbortController();
		sourceController.abort();
		await expect(
			createIdentity({ signal: sourceController.signal })
		).rejects.toMatchObject({ name: "AbortError" });

		const identity = await createIdentity();
		const build = await createPersonCutoutMaskCacheBuild({ identity });
		await writeFile(build.alphaPath, Buffer.alloc(24, 255));
		await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount: 2,
			identity,
		});
		const cacheController = new AbortController();
		cacheController.abort();
		await expect(
			inspectPersonCutoutMaskCache({
				identity,
				signal: cacheController.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
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

		expect(objectIdentity.pipelineId).toBe(
			"qcut-jianying-video-object-bach-v2-exact-d634-v1"
		);
		expect(createPersonCutoutCacheKey({ identity: portraitIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: objectIdentity })
		);
	});

	it("separates GRU with Vision fusion from explicit GRU-only masks", async () => {
		const [fusionIdentity, gruOnlyIdentity] = await Promise.all([
			createIdentity({
				pipelineDescriptor: GRU_VISION_PERSON_CUTOUT_PIPELINE,
			}),
			createIdentity({
				pipelineDescriptor: GRU_ONLY_PERSON_CUTOUT_PIPELINE,
			}),
		]);

		expect(fusionIdentity.providerId).toBe("qcut-local-person-matting-v1");
		expect(fusionIdentity.pipelineId).toBe("qcut-gru-vision-fusion-v1");
		expect(gruOnlyIdentity.pipelineId).toBe("qcut-gru-only-v1");
		expect(createPersonCutoutCacheKey({ identity: fusionIdentity })).not.toBe(
			createPersonCutoutCacheKey({ identity: gruOnlyIdentity })
		);
	});

	it("separates the validated same-model path from interop experiments", () => {
		expect(JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE).toMatchObject({
			experimental: false,
			pipelineId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
			providerId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
			refinementProvider: "vendor-v2-exact-no-qcut-refinement-v1",
		});
		expect(
			JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE
		).toMatchObject({
			experimental: true,
			pipelineId: "qcut-jianying-video-object-bach-v2-refined-d634-v1",
			providerId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
			refinementProvider: "qcut-alpha-refinement-after-vendor-v2-v1",
		});
		expect(VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE).toMatchObject({
			experimental: false,
			modelRoute: "video-object",
			pipelineId: "qcut-video-object-same-model-coreml-v1",
			providerId: "qcut-video-object-same-model-coreml-v1",
		});
		expect(VIDEO_OBJECT_HOST_INTEROP_PERSON_CUTOUT_PIPELINE).toMatchObject({
			experimental: true,
			modelRoute: "video-object",
			pipelineId: "qcut-video-object-interop-experimental-v1",
			providerId: "qcut-video-object-interop-experimental-v1",
		});
		expect(SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE).toMatchObject({
			experimental: true,
			modelRoute: "saliency-script",
			pipelineId: "qcut-saliency-script-interop-experimental-v1",
			providerId: "qcut-saliency-interop-experimental-v1",
		});
	});

	it("invalidates masks across exact, refined, and CoreML providers", async () => {
		const [exactIdentity, refinedIdentity, coreMLIdentity] = await Promise.all([
			createIdentity({
				modelRoute: "video-object",
				pipelineDescriptor: JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
			}),
			createIdentity({
				modelRoute: "video-object",
				pipelineDescriptor:
					JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE,
			}),
			createIdentity({
				modelRoute: "video-object",
				pipelineDescriptor: VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
			}),
		]);
		const cacheKeys = [exactIdentity, refinedIdentity, coreMLIdentity].map(
			(identity) => createPersonCutoutCacheKey({ identity })
		);
		expect(new Set(cacheKeys).size).toBe(3);
	});

	it("labels vendor V2 Bach as exact and advanced Bach as QCut-refined", () => {
		const exact = selectVideoObjectPersonCutoutPipeline({
			executionBackend: "jianying-bach-v2-exact-d634-v1",
			settings: {
				edgeShift: 0,
				feather: 0,
				temporalSmoothing: 0,
				threshold: 0.5,
			},
		});
		const refined = selectVideoObjectPersonCutoutPipeline({
			executionBackend: "jianying-bach-v2-exact-d634-v1",
			settings: {
				edgeShift: 1,
				feather: 0,
				temporalSmoothing: 0,
				threshold: 0.5,
			},
		});
		const roundedExact = selectVideoObjectPersonCutoutPipeline({
			executionBackend: "jianying-bach-v2-exact-d634-v1",
			settings: {
				edgeShift: 0,
				feather: 0,
				temporalSmoothing: 0,
				threshold: 0.50000001,
			},
		});
		const floatDistinctRefined = selectVideoObjectPersonCutoutPipeline({
			executionBackend: "jianying-bach-v2-exact-d634-v1",
			settings: {
				edgeShift: 0,
				feather: 0,
				temporalSmoothing: 0,
				threshold: 0.5000001,
			},
		});

		expect(exact).toBe(JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE);
		expect(roundedExact).toBe(
			JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE
		);
		expect(refined).toBe(
			JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE
		);
		expect(floatDistinctRefined).toBe(
			JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE
		);
	});

	it("rejects a pipeline descriptor for a different model route", async () => {
		await expect(
			createIdentity({
				modelRoute: "video-object",
				pipelineDescriptor: GRU_VISION_PERSON_CUTOUT_PIPELINE,
			})
		).rejects.toThrow("人物抠像管线与模型路线不一致");
	});

	it("shares pre-blend alpha between native and compatible compositors", async () => {
		const [compatibleIdentity, nativeIdentity] = await Promise.all([
			createIdentity(),
			createIdentity({
				blendImplementation: TEMATTING_NATIVE_METAL_CANARY,
			}),
		]);

		expect(createPersonCutoutCacheKey({ identity: compatibleIdentity })).toBe(
			createPersonCutoutCacheKey({ identity: nativeIdentity })
		);
		const build = await createPersonCutoutMaskCacheBuild({
			identity: compatibleIdentity,
		});
		await writeFile(build.alphaPath, Buffer.alloc(24, 255));
		const committed = await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount: 2,
			identity: compatibleIdentity,
		});

		expect(
			await inspectPersonCutoutMaskCache({ identity: nativeIdentity })
		).toEqual(committed);
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
