// @vitest-environment node
import { stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
	JianyingTextAnimationSlot,
	JianyingTextRuntimeReference,
} from "../jianying-text-runtime-contract.js";
import { resolveJianyingTextPackage } from "../jianying-text-runtime/package-resolver.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import { inspectJianyingTextRuntime } from "../jianying-text-runtime/runtime-discovery.js";
import {
	hashImageSequenceFrames,
	readImageSequenceAlphaCoverages,
} from "./jianying-text-real-e2e-helpers.js";

interface AnimationMatrixSample {
	label: string;
	resourceId: string;
	packageHash: string;
	slot: JianyingTextAnimationSlot;
	duration?: number;
	edgePolicy?: "clear" | "may-touch";
	expected?: {
		feedbackComponents?: boolean;
		shaderComponents?: boolean;
		threeDimensional?: boolean;
	};
}

const STYLE_RESOURCE_ID = process.env.QCUT_JIANYING_TEXT_E2E_RESOURCE_ID;
const STYLE_PACKAGE_HASH = process.env.QCUT_JIANYING_TEXT_E2E_PACKAGE_HASH;
const MATRIX_JSON = process.env.QCUT_JIANYING_TEXT_ANIMATION_E2E_MATRIX;
const RESOURCE_ID_PATTERN = /^\d{1,32}$/;
const PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;
const FRAME_COUNT = 48;
const FPS = 24;
const WIDTH = 640;
const HEIGHT = 360;

function isAnimationSlot(value: unknown): value is JianyingTextAnimationSlot {
	return value === "entrance" || value === "exit" || value === "loop";
}

function parseAnimationMatrix({ json }: { json: string | undefined }) {
	if (!json) return [];
	const value = JSON.parse(json) as unknown;
	if (!Array.isArray(value)) {
		throw new Error("QCUT_JIANYING_TEXT_ANIMATION_E2E_MATRIX must be an array");
	}
	return value.map((entry, index): AnimationMatrixSample => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			throw new Error(`Animation matrix entry ${index} must be an object`);
		}
		const record = entry as Record<string, unknown>;
		if (
			typeof record.label !== "string" ||
			record.label.length === 0 ||
			typeof record.resourceId !== "string" ||
			!RESOURCE_ID_PATTERN.test(record.resourceId) ||
			typeof record.packageHash !== "string" ||
			!PACKAGE_HASH_PATTERN.test(record.packageHash) ||
			!isAnimationSlot(record.slot)
		) {
			throw new Error(`Animation matrix entry ${index} is invalid`);
		}
		const duration = record.duration;
		if (
			duration !== undefined &&
			(typeof duration !== "number" ||
				!Number.isFinite(duration) ||
				duration <= 0 ||
				duration > 60)
		) {
			throw new Error(`Animation matrix entry ${index} has invalid duration`);
		}
		const edgePolicy = record.edgePolicy;
		if (
			edgePolicy !== undefined &&
			edgePolicy !== "clear" &&
			edgePolicy !== "may-touch"
		) {
			throw new Error(`Animation matrix entry ${index} has invalid edgePolicy`);
		}
		const expected =
			record.expected &&
			typeof record.expected === "object" &&
			!Array.isArray(record.expected)
				? (record.expected as AnimationMatrixSample["expected"])
				: undefined;
		return {
			label: record.label,
			resourceId: record.resourceId,
			packageHash: record.packageHash.toLowerCase(),
			slot: record.slot,
			...(duration === undefined ? {} : { duration }),
			...(edgePolicy === undefined ? {} : { edgePolicy }),
			...(expected ? { expected } : {}),
		};
	});
}

function styleReference({
	sample,
}: {
	sample: AnimationMatrixSample;
}): JianyingTextRuntimeReference {
	if (!(STYLE_RESOURCE_ID && STYLE_PACKAGE_HASH)) {
		throw new Error("Jianying TextStyle E2E identity is missing");
	}
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "TextStyle",
		resourceId: STYLE_RESOURCE_ID,
		packageHash: STYLE_PACKAGE_HASH,
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
		animations: {
			[sample.slot]: {
				source: "jianying-cache",
				resourceId: sample.resourceId,
				packageHash: sample.packageHash,
				duration: sample.duration ?? 1.2,
			},
		},
	};
}

const samples = parseAnimationMatrix({ json: MATRIX_JSON });
const e2eEnabled = Boolean(
	STYLE_RESOURCE_ID && STYLE_PACKAGE_HASH && samples.length > 0
);
const describeRealAnimations = e2eEnabled ? describe : describe.skip;

describeRealAnimations(
	"Jianying advanced text animation real video E2E",
	() => {
		it.each(
			samples
		)("renders $label through the formal QCut route", async (sample) => {
			const runtime = await inspectJianyingTextRuntime({ refresh: true });
			expect(runtime.status.state).toBe("ready");
			const reference = styleReference({ sample });
			const packageInfo = await resolveJianyingTextPackage({ reference });
			expect(packageInfo.animationResources.values).toMatchObject([
				{
					slot: sample.slot,
					resourceId: sample.resourceId,
					packageHash: sample.packageHash,
				},
			]);
			expect(packageInfo.capabilities).toMatchObject({
				animationComponents: true,
				...(sample.expected ?? {}),
			});

			const result = await renderJianyingText({
				request: {
					requestId: `advanced-text-${sample.label}-${Date.now()}`,
					reference,
					content: "花字验证",
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
					previewVideo: true,
				},
			});
			expect(result.source.kind).toBe("image-sequence");
			if (result.source.kind !== "image-sequence") {
				throw new Error("Expected an image-sequence render");
			}
			const hashes = await hashImageSequenceFrames({
				pattern: result.source.path,
				frameCount: FRAME_COUNT,
			});
			expect(new Set(hashes).size).toBeGreaterThan(4);

			const coverages = await readImageSequenceAlphaCoverages({
				fps: FPS,
				frameCount: FRAME_COUNT,
				height: HEIGHT,
				pattern: result.source.path,
				width: WIDTH,
			});
			expect(
				coverages.filter(({ visible }) => visible > 1000).length
			).toBeGreaterThan(8);
			const maximumEdgeVisible = Math.max(
				...coverages.map(({ edgeVisible }) => edgeVisible)
			);
			if (sample.edgePolicy === "may-touch") {
				expect(maximumEdgeVisible).toBeGreaterThan(0);
			} else {
				expect(maximumEdgeVisible).toBe(0);
			}
			const previewPath = path.join(
				path.dirname(result.source.path),
				"preview.webm"
			);
			expect((await stat(previewPath)).size).toBeGreaterThan(5000);
		}, 180_000);
	}
);
