// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import { inspectJianyingTextRuntime } from "../jianying-text-runtime/runtime-discovery.js";
import {
	compareImageSequencePremultipliedRgbaFrames,
	hashImageSequencePremultipliedRgbaFrames,
	hashImageSequenceRgbaFrames,
} from "./jianying-text-real-e2e-helpers.js";
import {
	createJianyingScriptInfoStickerReference,
	JIANYING_SCRIPT_INFO_STICKER_CORPUS,
	JIANYING_SCRIPT_INFO_STICKER_STRESS_TEXT,
} from "./jianying-text-script-info-sticker-fixtures.js";

const FRAME_COUNT = 36;
const FPS = 18;
const WIDTH = 640;
const HEIGHT = 360;
const VERSION_PARITY_LIMITS = {
	foregroundRmse: 10,
	maximumBoundsDelta: 1,
	maximumCentroidDistance: 3.2,
	maximumForegroundRmse: 35,
	maximumFrameRmse: 9,
	minimumMaskIou: 0.85,
	rgbaRmse: 3,
} as const;
const originalRuntimeRoot = process.env.QCUT_JIANYING_TEXT_RUNTIME_ROOT;
const describeVersionParity =
	process.env.QCUT_JIANYING_TEXT_RUNTIME_VERSION_E2E === "1"
		? describe.sequential
		: describe.skip;

function requiredEnvironmentPath({ name }: { name: string }) {
	const value = process.env[name]?.trim();
	if (!value)
		throw new Error(`${name} must point to a local Jianying runtime.`);
	return value;
}

async function renderRuntimeCorpus({
	label,
	runtimeRoot,
}: {
	label: "baseline" | "candidate";
	runtimeRoot: string;
}) {
	process.env.QCUT_JIANYING_TEXT_RUNTIME_ROOT = runtimeRoot;
	const inspection = await inspectJianyingTextRuntime({ refresh: true });
	expect(inspection.status.state).toBe("ready");
	expect(inspection.runtimeRoot).toBe(runtimeRoot);
	const abiProfile = inspection.status.runtimeAbiProfile;
	const coreUuid = inspection.status.runtimeCoreUuid;
	const runtimeFingerprint = inspection.runtimeFingerprint;
	if (!(abiProfile && coreUuid && runtimeFingerprint)) {
		throw new Error(`${label} runtime did not report a complete ABI identity.`);
	}

	const renders = await mapWithConcurrency({
		items: JIANYING_SCRIPT_INFO_STICKER_CORPUS,
		limit: 1,
		task: async ({ item: { packageHash, resourceId } }) => {
			const result = await renderJianyingText({
				request: {
					requestId: `runtime-version-${label}-${resourceId}`,
					reference: createJianyingScriptInfoStickerReference({
						packageHash,
						resourceId,
					}),
					content: JIANYING_SCRIPT_INFO_STICKER_STRESS_TEXT,
					fontSize: 32,
					canvasWidth: WIDTH,
					canvasHeight: HEIGHT,
					transform: {
						x: 0,
						y: 0,
						width: WIDTH,
						height: HEIGHT,
						rotation: 0,
						opacity: 1,
					},
					sourceStart: 0,
					elementDuration: FRAME_COUNT / FPS,
					frameCount: FRAME_COUNT,
					fps: FPS,
					previewVideo: false,
				},
			});
			expect(result.source.kind).toBe("image-sequence");
			if (result.source.kind !== "image-sequence") {
				throw new Error(`Expected an image sequence for ${resourceId}.`);
			}
			const [frameHashes, visualFrameHashes] = await Promise.all([
				hashImageSequenceRgbaFrames({
					fps: FPS,
					frameCount: FRAME_COUNT,
					height: HEIGHT,
					pattern: result.source.path,
					width: WIDTH,
				}),
				hashImageSequencePremultipliedRgbaFrames({
					fps: FPS,
					frameCount: FRAME_COUNT,
					height: HEIGHT,
					pattern: result.source.path,
					width: WIDTH,
				}),
			]);
			return {
				resourceId,
				frameHashes,
				pattern: result.source.path,
				visualFrameHashes,
			};
		},
	});

	return {
		abiProfile,
		coreUuid,
		runtimeFingerprint,
		renders,
	};
}

function restoreRuntimeRoot() {
	if (originalRuntimeRoot === undefined) {
		Reflect.deleteProperty(process.env, "QCUT_JIANYING_TEXT_RUNTIME_ROOT");
		return;
	}
	process.env.QCUT_JIANYING_TEXT_RUNTIME_ROOT = originalRuntimeRoot;
}

describeVersionParity("Jianying text runtime version parity", () => {
	afterAll(async () => {
		restoreRuntimeRoot();
		await inspectJianyingTextRuntime({ refresh: true });
	});

	it("keeps the ScriptInfoSticker corpus visually stable across ABI profiles", async () => {
		const baselineRoot = requiredEnvironmentPath({
			name: "QCUT_JIANYING_TEXT_RUNTIME_BASELINE_ROOT",
		});
		const candidateRoot = requiredEnvironmentPath({
			name: "QCUT_JIANYING_TEXT_RUNTIME_CANDIDATE_ROOT",
		});
		requiredEnvironmentPath({ name: "QCUT_JIANYING_TEXT_DEFAULT_FONT" });
		const baseline = await renderRuntimeCorpus({
			label: "baseline",
			runtimeRoot: baselineRoot,
		});
		const candidate = await renderRuntimeCorpus({
			label: "candidate",
			runtimeRoot: candidateRoot,
		});

		expect(candidate.coreUuid).not.toBe(baseline.coreUuid);
		// Distinct builds can legitimately share an abiProfile string; coreUuid
		// and runtimeFingerprint already prove two different roots were used.
		expect(candidate.runtimeFingerprint).not.toBe(baseline.runtimeFingerprint);
		const rawMismatches = baseline.renders.flatMap((baselineRender, index) => {
			const candidateRender = candidate.renders[index];
			return candidateRender.resourceId !== baselineRender.resourceId ||
				candidateRender.frameHashes.join(":") !==
					baselineRender.frameHashes.join(":")
				? [baselineRender.resourceId]
				: [];
		});
		const visualMismatchPairs = baseline.renders.flatMap(
			(baselineRender, index) => {
				const candidateRender = candidate.renders[index];
				return candidateRender.resourceId !== baselineRender.resourceId ||
					candidateRender.visualFrameHashes.join(":") !==
						baselineRender.visualFrameHashes.join(":")
					? [{ baselineRender, candidateRender }]
					: [];
			}
		);
		const differences = await mapWithConcurrency({
			items: visualMismatchPairs,
			limit: 1,
			task: async ({ item: { baselineRender, candidateRender } }) => ({
				resourceId: baselineRender.resourceId,
				metrics: await compareImageSequencePremultipliedRgbaFrames({
					candidatePattern: candidateRender.pattern,
					fps: FPS,
					frameCount: FRAME_COUNT,
					height: HEIGHT,
					referencePattern: baselineRender.pattern,
					width: WIDTH,
				}),
			}),
		});
		const incompatible = differences.filter(
			({ metrics }) =>
				metrics.rgbaRmse > VERSION_PARITY_LIMITS.rgbaRmse ||
				metrics.maximumFrameRmse > VERSION_PARITY_LIMITS.maximumFrameRmse ||
				metrics.foregroundRmse > VERSION_PARITY_LIMITS.foregroundRmse ||
				metrics.maximumForegroundRmse >
					VERSION_PARITY_LIMITS.maximumForegroundRmse ||
				metrics.minimumMaskIou < VERSION_PARITY_LIMITS.minimumMaskIou ||
				metrics.maximumBoundsDelta > VERSION_PARITY_LIMITS.maximumBoundsDelta ||
				metrics.maximumCentroidDistance >
					VERSION_PARITY_LIMITS.maximumCentroidDistance
		);
		expect(
			incompatible,
			`raw RGBA mismatches: ${rawMismatches.join(", ")}`
		).toEqual([]);
	}, 1_200_000);
});
