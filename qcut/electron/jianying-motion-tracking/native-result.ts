import type {
	JianyingMotionTrackingDirection,
	JianyingMotionTrackingSample,
} from "../jianying-motion-tracking-contract.js";
import { JIANYING_MOTION_TRACKING_ROUTE } from "./runtime-assets.js";

function parseNullableNumber({ value }: { value: unknown }) {
	if (value === null) return null;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error("运动跟踪结果含无效数值");
	}
	return value;
}

function parseResultNumber({ value }: { value: unknown }) {
	const parsed = parseNullableNumber({ value });
	if (parsed === null) throw new Error("运动跟踪矩形含无效数值");
	return parsed;
}

function parseSample({
	value,
}: {
	value: unknown;
}): JianyingMotionTrackingSample {
	if (!value || typeof value !== "object") {
		throw new Error("运动跟踪结果含无效帧");
	}
	const sample = value as Partial<JianyingMotionTrackingSample>;
	if (
		!Number.isSafeInteger(sample.frameIndex) ||
		(sample.frameIndex ?? -1) < 0 ||
		!Number.isSafeInteger(sample.sourceTimeUs) ||
		(sample.sourceTimeUs ?? -1) < 0 ||
		typeof sample.anchor !== "boolean" ||
		(sample.status !== "tracked" && sample.status !== "lost") ||
		!Number.isSafeInteger(sample.rawStatus) ||
		!sample.rect
	) {
		throw new Error("运动跟踪结果含无效帧");
	}
	return {
		anchor: sample.anchor,
		frameIndex: sample.frameIndex as number,
		rawRotationCentidegrees: parseNullableNumber({
			value: sample.rawRotationCentidegrees,
		}),
		rawStatus: sample.rawStatus as number,
		rect: {
			bottom: parseResultNumber({ value: sample.rect.bottom }),
			left: parseResultNumber({ value: sample.rect.left }),
			right: parseResultNumber({ value: sample.rect.right }),
			top: parseResultNumber({ value: sample.rect.top }),
		},
		rotationDegrees: parseNullableNumber({ value: sample.rotationDegrees }),
		sourceTimeUs: sample.sourceTimeUs as number,
		status: sample.status,
	};
}

function parseNativeResult({
	direction,
	value,
}: {
	direction: JianyingMotionTrackingDirection;
	value: unknown;
}) {
	if (!value || typeof value !== "object") {
		throw new Error("运动跟踪桥没有返回有效结果");
	}
	const result = value as {
		anchorFrameIndex?: unknown;
		direction?: unknown;
		fps?: unknown;
		frameCount?: unknown;
		height?: unknown;
		route?: unknown;
		samples?: unknown;
		schemaVersion?: unknown;
		width?: unknown;
	};
	if (
		result.schemaVersion !== 1 ||
		result.route !== JIANYING_MOTION_TRACKING_ROUTE ||
		result.direction !== direction ||
		!Number.isSafeInteger(result.frameCount) ||
		!Number.isSafeInteger(result.anchorFrameIndex) ||
		!Number.isSafeInteger(result.width) ||
		!Number.isSafeInteger(result.height) ||
		(result.frameCount as number) <= 0 ||
		(result.anchorFrameIndex as number) < 0 ||
		(result.anchorFrameIndex as number) >= (result.frameCount as number) ||
		(result.width as number) <= 0 ||
		(result.height as number) <= 0 ||
		typeof result.fps !== "number" ||
		!Number.isFinite(result.fps) ||
		!Array.isArray(result.samples)
	) {
		throw new Error("运动跟踪桥结果不符合固定合同");
	}
	return {
		anchorFrameIndex: result.anchorFrameIndex as number,
		fps: result.fps,
		frameCount: result.frameCount as number,
		height: result.height as number,
		samples: result.samples.map((sample) => parseSample({ value: sample })),
		width: result.width as number,
	};
}

function expectedSampleCount({
	anchorFrame,
	direction,
	frameCount,
}: {
	anchorFrame: number;
	direction: JianyingMotionTrackingDirection;
	frameCount: number;
}) {
	if (direction === "backward") return anchorFrame + 1;
	if (direction === "forward") return frameCount - anchorFrame;
	return frameCount;
}

export function validateNativeTrackingResult({
	anchorFrame,
	direction,
	fps,
	frameCount,
	height,
	value,
	width,
}: {
	anchorFrame: number;
	direction: JianyingMotionTrackingDirection;
	fps: number;
	frameCount: number;
	height: number;
	value: unknown;
	width: number;
}) {
	const result = parseNativeResult({ direction, value });
	if (
		result.frameCount !== frameCount ||
		result.anchorFrameIndex !== anchorFrame ||
		result.width !== width ||
		result.height !== height ||
		Math.abs(result.fps - fps) > 0.0001 ||
		result.samples.length !==
			expectedSampleCount({ anchorFrame, direction, frameCount })
	) {
		throw new Error("运动跟踪桥返回的媒体合同不匹配");
	}
	const sampleFrames = new Set(
		result.samples.map((sample) => sample.frameIndex)
	);
	if (
		sampleFrames.size !== result.samples.length ||
		result.samples.some(
			(sample) =>
				sample.frameIndex < 0 ||
				sample.frameIndex >= frameCount ||
				(direction === "forward" && sample.frameIndex < anchorFrame) ||
				(direction === "backward" && sample.frameIndex > anchorFrame) ||
				Math.abs(
					sample.sourceTimeUs -
						Math.round((sample.frameIndex * 1_000_000) / fps)
				) > 1
		)
	) {
		throw new Error("运动跟踪桥返回了重复或越界帧");
	}
	if (
		result.samples.filter((sample) => sample.anchor).length !== 1 ||
		!result.samples.some(
			(sample) => sample.anchor && sample.frameIndex === anchorFrame
		)
	) {
		throw new Error("运动跟踪桥没有返回唯一锚点帧");
	}
	const anchorSample = result.samples.find(
		(sample) => sample.anchor && sample.frameIndex === anchorFrame
	);
	if (
		anchorSample?.status !== "tracked" ||
		anchorSample.rect.right <= anchorSample.rect.left ||
		anchorSample.rect.bottom <= anchorSample.rect.top
	) {
		throw new Error("运动跟踪桥返回的锚点框无效");
	}
	return result;
}
