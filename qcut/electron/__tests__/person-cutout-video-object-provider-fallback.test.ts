// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
	firstMatchingDirectory: vi.fn(),
	firstMatchingFile: vi.fn(),
	prepareVideoObjectCoreMLModel: vi.fn(),
	resolveJianyingSaliencyBridge: vi.fn(),
	resolveVideoObjectBachBridge: vi.fn(),
	resolveVideoObjectCoreMLBridge: vi.fn(),
	sha256File: vi.fn(),
	verifyVideoObjectBachDependencyClosure: vi.fn(),
}));

vi.mock("../jianying-person-cutout/runtime-assets.js", () => ({
	firstMatchingDirectory: runtimeMocks.firstMatchingDirectory,
	firstMatchingFile: runtimeMocks.firstMatchingFile,
	sha256File: runtimeMocks.sha256File,
	VIDEO_FUSION_LIBRARY_SHA256: "video-fusion-library-sha256",
}));
vi.mock("../jianying-person-cutout/saliency-bridge-resolver.js", () => ({
	resolveJianyingSaliencyBridge: runtimeMocks.resolveJianyingSaliencyBridge,
}));
vi.mock(
	"../jianying-person-cutout/video-object-bach-bridge-resolver.js",
	() => ({
		resolveVideoObjectBachBridge: runtimeMocks.resolveVideoObjectBachBridge,
	})
);
vi.mock(
	"../jianying-person-cutout/video-object-coreml-bridge-resolver.js",
	() => ({
		resolveVideoObjectCoreMLBridge: runtimeMocks.resolveVideoObjectCoreMLBridge,
	})
);
vi.mock("../jianying-person-cutout/video-object-coreml-runtime.js", () => ({
	prepareVideoObjectCoreMLModel: runtimeMocks.prepareVideoObjectCoreMLModel,
}));
vi.mock(
	"../jianying-person-cutout/video-object-runtime-closure.js",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("../jianying-person-cutout/video-object-runtime-closure.js")
		>()),
		verifyVideoObjectBachDependencyClosure:
			runtimeMocks.verifyVideoObjectBachDependencyClosure,
	})
);

import {
	resolveJianyingVideoObjectRuntimeCandidate,
	resolveJianyingVideoObjectRuntimeCandidates,
	VIDEO_OBJECT_BACH_RUNTIME_SHA256,
	VIDEO_OBJECT_GRAPH_SHA256,
} from "../jianying-person-cutout/video-object-runtime.js";

beforeEach(() => {
	runtimeMocks.firstMatchingDirectory.mockResolvedValue("/private/models");
	runtimeMocks.firstMatchingFile.mockResolvedValue("/private/runtime-asset");
	runtimeMocks.resolveVideoObjectBachBridge.mockResolvedValue(null);
	runtimeMocks.resolveVideoObjectCoreMLBridge.mockResolvedValue(null);
	runtimeMocks.resolveJianyingSaliencyBridge.mockResolvedValue(null);
	runtimeMocks.sha256File.mockResolvedValue("bridge-sha256");
	runtimeMocks.verifyVideoObjectBachDependencyClosure.mockResolvedValue({
		dependencyClosureMarker:
			"jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e",
		dependencyClosureSha256:
			"e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e",
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.runIf(process.platform === "darwin")(
	"optional video-object provider resolution",
	() => {
		it("orders audited Bach, direct CoreML, and legacy host candidates", async () => {
			runtimeMocks.resolveVideoObjectBachBridge.mockResolvedValue(
				"/private/bach-bridge"
			);
			runtimeMocks.resolveVideoObjectCoreMLBridge.mockResolvedValue(
				"/private/coreml-bridge"
			);
			runtimeMocks.prepareVideoObjectCoreMLModel.mockResolvedValue(
				"/private/model.mlmodelc"
			);
			runtimeMocks.resolveJianyingSaliencyBridge.mockResolvedValue(
				"/private/host-bridge"
			);

			const candidates = await resolveJianyingVideoObjectRuntimeCandidates({
				height: 1080,
				width: 1920,
			});

			expect(
				candidates.map(({ executionBackend }) => executionBackend)
			).toEqual([
				"jianying-bach-v2-exact-d634-v1",
				"same-model-coreml-v1",
				"effect-host-interop-v1",
			]);
			expect(candidates[0]).toMatchObject({
				graphDirectory: "/private",
				libraryPath: "/private/runtime-asset",
				readiness: "exact-runtime-model-graph-vendor-v2-closure-pinned",
			});
			expect(runtimeMocks.firstMatchingDirectory).toHaveBeenCalledWith(
				expect.objectContaining({
					candidates: expect.arrayContaining([
						expect.stringContaining(
							"JianyingTransition/current/Models/user-cache"
						),
					]),
				})
			);
			expect(runtimeMocks.firstMatchingFile).toHaveBeenCalledWith(
				expect.objectContaining({ sha256: VIDEO_OBJECT_BACH_RUNTIME_SHA256 })
			);
			expect(runtimeMocks.firstMatchingFile).toHaveBeenCalledWith(
				expect.objectContaining({
					candidates: expect.arrayContaining([
						expect.stringContaining(
							"JianyingTransition/current/Models/app-bundle/matting_config/ai_matting_video_object/algorithmConfig.json"
						),
					]),
					sha256: VIDEO_OBJECT_GRAPH_SHA256,
				})
			);
		});

		it("continues to direct CoreML when the Bach resolver rejects", async () => {
			runtimeMocks.resolveVideoObjectBachBridge.mockRejectedValue(
				new Error("Bach compiler failed")
			);
			runtimeMocks.resolveVideoObjectCoreMLBridge.mockResolvedValue(
				"/private/coreml-bridge"
			);
			runtimeMocks.prepareVideoObjectCoreMLModel.mockResolvedValue(
				"/private/model.mlmodelc"
			);
			const warning = vi
				.spyOn(console, "warn")
				.mockImplementation(() => undefined);

			await expect(
				resolveJianyingVideoObjectRuntimeCandidate({
					height: 1080,
					width: 1920,
				})
			).resolves.toMatchObject({ executionBackend: "same-model-coreml-v1" });
			expect(warning).toHaveBeenCalledWith(
				"QCut could not prepare the audited Jianying Bach runtime.",
				expect.any(Error)
			);
		});

		it("continues to direct CoreML when the dependency manifest is stale", async () => {
			runtimeMocks.resolveVideoObjectBachBridge.mockResolvedValue(
				"/private/bach-bridge"
			);
			runtimeMocks.verifyVideoObjectBachDependencyClosure.mockRejectedValue(
				new Error("stale dependency manifest")
			);
			runtimeMocks.resolveVideoObjectCoreMLBridge.mockResolvedValue(
				"/private/coreml-bridge"
			);
			runtimeMocks.prepareVideoObjectCoreMLModel.mockResolvedValue(
				"/private/model.mlmodelc"
			);

			await expect(
				resolveJianyingVideoObjectRuntimeCandidate({
					height: 1080,
					width: 1920,
				})
			).resolves.toMatchObject({ executionBackend: "same-model-coreml-v1" });
		});

		it("continues to host interop when the direct resolver rejects", async () => {
			runtimeMocks.resolveVideoObjectCoreMLBridge.mockRejectedValue(
				new Error("clang failed")
			);
			runtimeMocks.resolveJianyingSaliencyBridge.mockResolvedValue(
				"/private/host-bridge"
			);
			const warning = vi
				.spyOn(console, "warn")
				.mockImplementation(() => undefined);

			await expect(
				resolveJianyingVideoObjectRuntimeCandidate({
					height: 1080,
					width: 1920,
				})
			).resolves.toMatchObject({ executionBackend: "effect-host-interop-v1" });

			expect(runtimeMocks.resolveJianyingSaliencyBridge).toHaveBeenCalledOnce();
			expect(warning).toHaveBeenCalledWith(
				"QCut could not prepare the same-model CoreML video-object runtime.",
				expect.any(Error)
			);
		});

		it("returns null when the host resolver rejects", async () => {
			runtimeMocks.resolveJianyingSaliencyBridge.mockRejectedValue(
				new Error("host bridge unavailable")
			);
			const warning = vi
				.spyOn(console, "warn")
				.mockImplementation(() => undefined);

			await expect(
				resolveJianyingVideoObjectRuntimeCandidate({
					height: 1080,
					width: 1920,
				})
			).resolves.toBeNull();

			expect(warning).toHaveBeenCalledWith(
				"QCut could not prepare the host video-object runtime.",
				expect.any(Error)
			);
		});
	}
);
