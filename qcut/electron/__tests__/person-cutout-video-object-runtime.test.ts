import { describe, expect, it } from "vitest";
import {
	calculateVideoObjectGraphSize,
	createVideoObjectRuntimeFingerprints,
	VIDEO_OBJECT_BACH_PROCESSOR_VERSION,
	VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY,
	VIDEO_OBJECT_BACH_RUNTIME_SHA256,
	VIDEO_OBJECT_BACH_RUNTIME_UUID,
	VIDEO_OBJECT_COREML_PROCESSOR_VERSION,
	VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY,
	VIDEO_OBJECT_PROVIDER_CAPABILITY,
} from "../jianying-person-cutout/video-object-runtime.js";
import {
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
} from "../jianying-person-cutout/video-object-runtime-closure.js";

describe("legacy host video-object graph sizing", () => {
	it("matches Jianying's 512-pixel portrait and landscape graph inputs", () => {
		expect(calculateVideoObjectGraphSize({ height: 640, width: 360 })).toEqual({
			height: 512,
			width: 288,
		});
		expect(
			calculateVideoObjectGraphSize({ height: 1080, width: 1920 })
		).toEqual({
			height: 288,
			width: 512,
		});
	});

	it("keeps odd aspect ratios on even texture dimensions", () => {
		expect(calculateVideoObjectGraphSize({ height: 333, width: 1000 })).toEqual(
			{
				height: 170,
				width: 512,
			}
		);
	});

	it("rejects invalid source dimensions", () => {
		expect(() =>
			calculateVideoObjectGraphSize({ height: 0, width: 1920 })
		).toThrow("视频尺寸无效");
	});

	it("keeps capability failures stable across output resolutions", () => {
		const portrait = createVideoObjectRuntimeFingerprints({
			bridgeSha256: "bridge-a",
			height: 1920,
			width: 1080,
		});
		const landscape = createVideoObjectRuntimeFingerprints({
			bridgeSha256: "bridge-a",
			height: 1080,
			width: 1920,
		});

		expect(portrait.capabilitySha256).toBe(landscape.capabilitySha256);
		expect(portrait.capabilitySha256).toMatch(/^[a-f0-9]{64}$/);
		expect(portrait.processorSha256).not.toBe(landscape.processorSha256);
		expect(
			createVideoObjectRuntimeFingerprints({
				backend: "effect-host-interop-v1",
				bridgeSha256: "bridge-a",
				height: 1920,
				width: 1080,
			}).capabilitySha256
		).not.toBe(portrait.capabilitySha256);
		expect(
			createVideoObjectRuntimeFingerprints({
				backend: "jianying-bach-v2-exact-d634-v1",
				bridgeSha256: "bridge-a",
				height: 1920,
				width: 1080,
			}).capabilitySha256
		).not.toBe(portrait.capabilitySha256);
	});

	it("pins the audited Bach runtime, graph, model, and processor identity", () => {
		expect(VIDEO_OBJECT_BACH_RUNTIME_UUID).toBe(
			"D6342ECD-5432-33F0-A2AD-0C28F5699994"
		);
		expect(VIDEO_OBJECT_BACH_RUNTIME_SHA256).toBe(
			"0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9"
		);
		expect(VIDEO_OBJECT_BACH_PROCESSOR_VERSION).toBe(
			"jianying-bach-d634-tematting-blend-v2-source-alpha-v1"
		);
		expect(VIDEO_OBJECT_BACH_PROVIDER_CAPABILITY).toMatchObject({
			dependencyClosureMarker: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
			dependencyClosureSha256: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
			graphSha256:
				"797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b",
			modelSha256:
				"346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef",
			outputContract: "tematting-blend-effect-v2-source-alpha-u8-v1",
			postprocess: "TEMattingBlendEffectV2-vendor-exact",
			readiness: "exact-runtime-model-graph-vendor-v2-closure-pinned",
			refinement: "vendor-v2-exact-no-qcut-refinement-v1",
			runtimeSha256: VIDEO_OBJECT_BACH_RUNTIME_SHA256,
			runtimeUuid: VIDEO_OBJECT_BACH_RUNTIME_UUID,
			temporalState: "te-bach-matting-session-v1",
		});
	});

	it("describes direct CoreML separately from host interop", () => {
		expect(VIDEO_OBJECT_PROVIDER_CAPABILITY).toEqual({
			effectRegistration: "not-required-direct-coreml",
			hostEffectRegistry: "bypassed",
			implementationRole: "private-host-independent-fallback",
			inputTransport: "same-model-coreml-source-rgba-direct-256-v2",
			inputTransportStatus: "bach-capture-close-not-bit-exact-frame0",
			modelResolution: "resolved",
			modelResolver: "packed-model-coreml-extractor-v1",
			outputValidation: "coreml-tensor-contract-v1",
			readiness: "same-model-coreml-validated",
			temporalState: "previous-image-and-mask-v1",
		});
		expect(VIDEO_OBJECT_COREML_PROCESSOR_VERSION).toBe(
			"source-rgba-direct-256-v2"
		);
		expect(VIDEO_OBJECT_HOST_INTEROP_PROVIDER_CAPABILITY).toMatchObject({
			hostEffectRegistry: "not-reproduced",
			readiness: "output-gated-candidate",
		});
	});
});
