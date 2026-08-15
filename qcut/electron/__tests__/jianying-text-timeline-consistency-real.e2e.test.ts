// @vitest-environment node
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import {
	cancelJianyingTextRender,
	jianyingTextRenderProcessTestUtils,
} from "../jianying-text-runtime/render-process.js";
import { inspectJianyingTextRuntime } from "../jianying-text-runtime/runtime-discovery.js";
import {
	framePathFromPattern,
	runProcess,
} from "./jianying-text-real-e2e-helpers.js";

const RESOURCE_ID =
	process.env.QCUT_JIANYING_TEXT_TIMELINE_RESOURCE_ID ?? "7280819425605930279";
const PACKAGE_HASH =
	process.env.QCUT_JIANYING_TEXT_TIMELINE_PACKAGE_HASH ??
	"f46ef1dfceca013a755b566632c150bf";
const WIDTH = 640;
const HEIGHT = 360;
const FPS = 12;
const FRAME_COUNT = 24;
const SOURCE_START = 0.137;
const ELEMENT_DURATION = 3.7;
const SEEK_INDICES = [0, 1, 7, 13, FRAME_COUNT - 1] as const;
const describeRealTimeline =
	process.env.QCUT_JIANYING_TEXT_TIMELINE_E2E === "1"
		? describe.sequential
		: describe.skip;

function reference(): JianyingTextRuntimeReference {
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "ScriptInfoSticker",
		resourceId: RESOURCE_ID,
		packageHash: PACKAGE_HASH,
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	};
}

function request({
	requestId,
	sourceStart = SOURCE_START,
	frameCount = FRAME_COUNT,
	previewVideo = false,
	content = "花字时序验证",
	elementDuration = ELEMENT_DURATION,
}: {
	requestId: string;
	sourceStart?: number;
	frameCount?: number;
	previewVideo?: boolean;
	content?: string;
	elementDuration?: number;
}) {
	return {
		requestId,
		reference: reference(),
		content,
		fontSize: 36,
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
		sourceStart,
		elementDuration,
		frameCount,
		fps: FPS,
		previewVideo,
	};
}

function maximumAlphaMeanAbsoluteError({
	left,
	right,
	width,
	height,
	frameCount,
}: {
	left: Buffer;
	right: Buffer;
	width: number;
	height: number;
	frameCount: number;
}) {
	const frameBytes = width * height * 4;
	if (
		left.length !== frameBytes * frameCount ||
		right.length !== frameBytes * frameCount
	) {
		throw new Error("Decoded Jianying preview frame count is inconsistent");
	}
	let maximum = 0;
	for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
		const start = frameIndex * frameBytes;
		const end = start + frameBytes;
		let totalDifference = 0;
		for (let offset = start + 3; offset < end; offset += 4) {
			totalDifference += Math.abs(left[offset] - right[offset]);
		}
		maximum = Math.max(maximum, totalDifference / (width * height));
	}
	return maximum;
}

async function waitForActiveRender({ requestId }: { requestId: string }) {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (jianyingTextRenderProcessTestUtils.hasActiveProcess({ requestId }))
			return;
		await delay(25);
	}
	throw new Error("Jianying text render did not start a child process");
}

describeRealTimeline("Jianying text timeline consistency real E2E", () => {
	beforeAll(async () => {
		const runtime = await inspectJianyingTextRuntime({ refresh: true });
		expect(runtime.status.state).toBe("ready");
	});

	it("matches sequence, independent seeks, preview, and cache", async () => {
		const sequence = await renderJianyingText({
			request: request({
				requestId: `timeline-sequence-${Date.now()}`,
				previewVideo: true,
			}),
		});
		expect(sequence.source.kind).toBe("image-sequence");
		if (sequence.source.kind !== "image-sequence") {
			throw new Error("Expected a Jianying image sequence");
		}

		const comparisons = await Promise.all(
			SEEK_INDICES.map(async (frameIndex) => {
				const seek = await renderJianyingText({
					request: request({
						requestId: `timeline-seek-${frameIndex}-${Date.now()}`,
						sourceStart: SOURCE_START + frameIndex / FPS,
						frameCount: 1,
					}),
				});
				expect(seek.source.kind).toBe("image");
				if (seek.source.kind !== "image") {
					throw new Error("Expected a single Jianying frame");
				}
				const sequenceFrame = framePathFromPattern({
					pattern: sequence.source.path,
					index: frameIndex,
				});
				const [sequenceBytes, seekBytes] = await Promise.all([
					readFile(sequenceFrame),
					readFile(seek.source.path),
				]);
				return sequenceBytes.equals(seekBytes);
			})
		);
		expect(comparisons).toEqual(SEEK_INDICES.map(() => true));

		const cached = await renderJianyingText({
			request: request({
				requestId: `timeline-cache-${Date.now()}`,
				previewVideo: true,
			}),
		});
		expect(cached.cacheHit).toBe(true);
		expect(cached.source).toEqual(sequence.source);
		expect(cached.previewUrl).toBe(sequence.previewUrl);

		const previewPath = path.join(
			path.dirname(sequence.source.path),
			"preview.webm"
		);
		expect((await stat(previewPath)).size).toBeGreaterThan(5000);

		await writeFile(previewPath, "truncated-preview");
		const repaired = await renderJianyingText({
			request: request({
				requestId: `timeline-preview-repair-${Date.now()}`,
				previewVideo: true,
			}),
		});
		expect(repaired.cacheHit).toBe(true);
		expect((await stat(previewPath)).size).toBeGreaterThan(5000);

		const ffmpegPath = getFFmpegPath();
		const [previewFrames, sequenceFrames] = await Promise.all([
			runProcess({
				command: ffmpegPath,
				args: [
					"-v",
					"error",
					"-c:v",
					"libvpx-vp9",
					"-i",
					previewPath,
					"-frames:v",
					String(FRAME_COUNT),
					"-pix_fmt",
					"rgba",
					"-f",
					"rawvideo",
					"pipe:1",
				],
			}),
			runProcess({
				command: ffmpegPath,
				args: [
					"-v",
					"error",
					"-framerate",
					String(FPS),
					// framePathFromPattern numbers frames from 0; image2 defaults
					// start_number to 1 and would shift or fail the decode.
					"-start_number",
					"0",
					"-i",
					sequence.source.path,
					"-frames:v",
					String(FRAME_COUNT),
					"-pix_fmt",
					"rgba",
					"-f",
					"rawvideo",
					"pipe:1",
				],
			}),
		]);
		expect(
			maximumAlphaMeanAbsoluteError({
				left: previewFrames,
				right: sequenceFrames,
				width: WIDTH,
				height: HEIGHT,
				frameCount: FRAME_COUNT,
			})
		).toBeLessThan(1);
	}, 240_000);

	it("cancels an active native render without poisoning the next request", async () => {
		const requestId = `timeline-cancel-${Date.now()}`;
		const pending = renderJianyingText({
			request: request({
				requestId,
				frameCount: 240,
				content: `取消验证-${Date.now()}`,
				elementDuration: 30,
			}),
		});
		void pending.catch(() => undefined);
		await waitForActiveRender({ requestId });

		expect(cancelJianyingTextRender({ requestId })).toBe(true);
		await expect(pending).rejects.toThrow("render cancelled");

		const recovered = await renderJianyingText({
			request: request({
				requestId: `timeline-after-cancel-${Date.now()}`,
				frameCount: 1,
				content: "取消后恢复",
			}),
		});
		expect(recovered.source.kind).toBe("image");
	}, 240_000);
});
