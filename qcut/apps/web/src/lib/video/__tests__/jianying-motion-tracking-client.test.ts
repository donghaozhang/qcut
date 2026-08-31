import { describe, expect, it, vi } from "vitest";
import type {
	JianyingMotionTrackingAPI,
	JianyingMotionTrackingResult,
} from "@/types/electron/api-jianying-motion-tracking";
import type { MediaElement } from "@/types/timeline";
import { createMediaMask } from "../media-mask-stack";
import {
	jianyingResultToMaskSamples,
	motionTrackingRectForMask,
	prepareJianyingMotionTrackingRequest,
	trackMediaMaskWithJianying,
} from "../jianying-motion-tracking-client";

function media({ overrides = {} }: { overrides?: Partial<MediaElement> } = {}) {
	return {
		id: "clip",
		type: "media",
		mediaId: "source",
		name: "Source",
		startTime: 5,
		duration: 10,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	} satisfies MediaElement;
}

function result({
	rotations = [0, 0, 0],
}: {
	rotations?: number[];
} = {}): JianyingMotionTrackingResult {
	return {
		anchorFrameIndex: 1,
		direction: "both",
		fps: 1,
		frameCount: 3,
		height: 100,
		route: "jianying-bingo-object-tracking-11.3.0",
		runtime: {
			appVersion: "11.3.0",
			coreSha256: "a".repeat(64),
			coreUuid: "B0243274-7D4B-3225-9762-7D2467DC3C61",
			localOnly: true,
		},
		samples: rotations.map((rotationDegrees, frameIndex) => ({
			anchor: frameIndex === 1,
			frameIndex,
			rawRotationCentidegrees: rotationDegrees * 100,
			rawStatus: 1,
			rect: {
				left: 0.1 + frameIndex * 0.1,
				top: 0.2,
				right: 0.3 + frameIndex * 0.1,
				bottom: 0.6,
			},
			rotationDegrees,
			sourceTimeUs: frameIndex * 1_000_000,
			status: "tracked" as const,
		})),
		width: 100,
	};
}

describe("Jianying motion tracking client", () => {
	it("builds an axis-aligned normalized region for a rotated mask", () => {
		const mask = {
			...createMediaMask({ id: "mask", type: "rectangle", index: 0 }),
			centerX: 0.5,
			centerY: 0.5,
			width: 0.4,
			height: 0.2,
			rotation: 90,
		};
		const rect = motionTrackingRectForMask({ mask });
		expect(rect.bottom).toBeCloseTo(0.7);
		expect(rect.left).toBeCloseTo(0.4);
		expect(rect.right).toBeCloseTo(0.6);
		expect(rect.top).toBeCloseTo(0.3);
	});

	it("maps a reversed trimmed clip from timeline direction to source direction", () => {
		const element = media({
			overrides: {
				trimStart: 2,
				trimEnd: 2,
				playbackRate: 2,
				reverse: true,
			},
		});
		const mask = createMediaMask({ id: "mask", type: "object", index: 0 });
		const prepared = prepareJianyingMotionTrackingRequest({
			currentFrame: 30,
			direction: "forward",
			element,
			fps: 30,
			mask,
			sourcePath: "/tmp/source.mp4",
			taskId: "task",
		});

		expect(prepared.request).toMatchObject({
			anchorTimeSeconds: 6,
			direction: "backward",
			rangeStartTimeSeconds: 2,
			rangeEndTimeSeconds: 8,
		});
	});

	it("unwraps Bingo rotation around the anchor mask angle", () => {
		const element = media({ overrides: { duration: 3, startTime: 0 } });
		const resolvedMask = {
			...createMediaMask({ id: "mask", type: "object", index: 0 }),
			rotation: 20,
		};
		const samples = jianyingResultToMaskSamples({
			element,
			fps: 1,
			result: result({ rotations: [358, 359, 1] }),
			resolvedMask,
		});

		expect(samples.map((sample) => sample.rotation)).toEqual([19, 20, 22]);
		expect(samples.map((sample) => sample.frame)).toEqual([0, 1, 2]);
		expect(samples[1].width).toBeCloseTo(resolvedMask.width);
		expect(samples[1].height).toBeCloseTo(resolvedMask.height);
	});

	it("writes tracked rectangles and simplified rotation into the mask", async () => {
		const nativeResult = result({ rotations: [0, 2, 4] });
		const track = vi.fn().mockResolvedValue(nativeResult);
		const api: JianyingMotionTrackingAPI = {
			cancel: vi.fn().mockResolvedValue(undefined),
			inspect: vi.fn(),
			onProgress: vi.fn(() => vi.fn()),
			track,
		};
		const element = media({ overrides: { duration: 3, startTime: 0 } });
		const mask = createMediaMask({ id: "mask", type: "object", index: 0 });
		const tracked = await trackMediaMaskWithJianying({
			api,
			currentFrame: 1,
			direction: "both",
			element,
			fps: 1,
			mask,
			sourcePath: "/tmp/source.mp4",
			taskId: "task",
		});

		expect(track).toHaveBeenCalledWith(
			expect.objectContaining({
				anchorTimeSeconds: 1,
				initialRect: expect.any(Object),
			})
		);
		expect(tracked.tracking).toMatchObject({
			status: "ready",
			source: "jianying-bingo",
			trackedFrames: 3,
			totalFrames: 3,
		});
		expect(tracked.keyframes?.centerX?.map(({ frame }) => frame)).toEqual([
			0, 2,
		]);
		expect(tracked.keyframes?.rotation?.map(({ value }) => value)).toEqual([
			-2, 2,
		]);
	});

	it("rejects freeze-frame clips before invoking the private runtime", () => {
		const element = media({ overrides: { freezeFrameDuration: 1 } });
		const mask = createMediaMask({ id: "mask", type: "object", index: 0 });
		expect(() =>
			prepareJianyingMotionTrackingRequest({
				currentFrame: 0,
				direction: "both",
				element,
				fps: 30,
				mask,
				sourcePath: "/tmp/source.mp4",
				taskId: "task",
			})
		).toThrow("暂不支持带定格");
	});
});
