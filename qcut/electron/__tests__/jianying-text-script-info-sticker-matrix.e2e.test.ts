// @vitest-environment node
import { stat } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveJianyingTextPackage } from "../jianying-text-runtime/package-resolver.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import { inspectJianyingTextRuntime } from "../jianying-text-runtime/runtime-discovery.js";
import {
	hashImageSequenceFrames,
	inspectImageSequenceAlphaFrames,
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
const RICH_TEXT_FRAME_COUNT = 18;
const describeRealMatrix =
	process.env.QCUT_JIANYING_TEXT_SCRIPT_MATRIX_E2E === "1"
		? describe.sequential
		: describe.skip;

async function expectVisibleScriptRender({
	content,
	frameCount = FRAME_COUNT,
	packageHash,
	resourceId,
}: {
	content: string;
	frameCount?: number;
	packageHash: string;
	resourceId: string;
}) {
	const reference = createJianyingScriptInfoStickerReference({
		resourceId,
		packageHash,
	});
	const packageInfo = await resolveJianyingTextPackage({ reference });
	expect(packageInfo.scriptResources?.missing).toEqual([]);
	const hasAnimation = packageInfo.scriptResources?.references.some(
		({ role }) => role === "animation"
	);
	const result = await renderJianyingText({
		request: {
			requestId: `script-matrix-${resourceId}-${Date.now()}`,
			reference,
			content,
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
			elementDuration: frameCount / FPS,
			frameCount,
			fps: FPS,
			previewVideo: true,
		},
	});
	expect(result.source.kind).toBe("image-sequence");
	if (result.source.kind !== "image-sequence") {
		throw new Error("Expected an image-sequence render");
	}
	const hashes = await hashImageSequenceFrames({
		frameCount,
		pattern: result.source.path,
	});
	if (hasAnimation) expect(new Set(hashes).size).toBeGreaterThan(1);
	const alphaFrames = await inspectImageSequenceAlphaFrames({
		fps: FPS,
		frameCount,
		height: HEIGHT,
		pattern: result.source.path,
		width: WIDTH,
	});
	expect(
		Math.max(...alphaFrames.map(({ visible }) => visible))
	).toBeGreaterThan(1000);
	expect(
		Math.min(...alphaFrames.map(({ transparent }) => transparent))
	).toBeGreaterThan(1000);
	const previewPath = path.join(
		path.dirname(result.source.path),
		"preview.webm"
	);
	expect((await stat(previewPath)).size).toBeGreaterThan(5000);
	return {
		alphaHashes: alphaFrames.map(({ alphaHash }) => alphaHash),
		maximumEdgeVisible: Math.max(
			...alphaFrames.map(({ edgeVisible }) => edgeVisible)
		),
	};
}

const RICH_TEXT_CASES = [
	{
		resourceId: "7410240535752903990",
		packageHash: "39b4b7c4e070ede70ae25ab264c842d4",
		content: "中英Mix😀兼容验证",
	},
	{
		resourceId: "7224099290560384313",
		packageHash: "ee581a8fc0338a25c756e8c3f91344c1",
		content: "主标题QCut😀\n第二行混合Style\n第三行长文本自动适配",
	},
	{
		resourceId: "7599874183467699518",
		packageHash: "ec066c208559c767bbe9bddf6eca3a97",
		content: "第一行emoji😀\nSecond line é",
	},
] as const;

describeRealMatrix("Jianying ScriptInfoSticker real video matrix", () => {
	beforeAll(async () => {
		const runtime = await inspectJianyingTextRuntime({ refresh: true });
		expect(runtime.status.state).toBe("ready");
	});

	it.each(
		JIANYING_SCRIPT_INFO_STICKER_CORPUS
	)("renders $resourceId with editable content and resolved dependencies", async ({
		resourceId,
		packageHash,
	}) => {
		const baseline = await expectVisibleScriptRender({
			content: "花字验证",
			packageHash,
			resourceId,
		});
		const stress = await expectVisibleScriptRender({
			content: JIANYING_SCRIPT_INFO_STICKER_STRESS_TEXT,
			packageHash,
			resourceId,
		});
		expect(stress.alphaHashes).not.toEqual(baseline.alphaHashes);
		expect(baseline.maximumEdgeVisible).toBe(0);
		expect(stress.maximumEdgeVisible).toBe(0);
	}, 240_000);

	it.each(
		RICH_TEXT_CASES
	)("renders long mixed or multiline content through $resourceId", async ({
		content,
		packageHash,
		resourceId,
	}) => {
		await expectVisibleScriptRender({
			content,
			frameCount: RICH_TEXT_FRAME_COUNT,
			packageHash,
			resourceId,
		});
	}, 240_000);
});
