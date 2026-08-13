// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	resolveJianyingTextBridgeLaunch,
	resolveJianyingTextBridgeEnvironment,
	type JianyingTextBridgeRuntime,
	verifyJianyingRuntimeParameterFrames,
} from "../jianying-text-runtime/bridge-render.js";

function frame({ color }: { color?: [number, number, number] }) {
	return color
		? Buffer.from([...color, 255, 0, 0, 0, 0])
		: Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
}

function createRuntime(): JianyingTextBridgeRuntime {
	return {
		bridgePath:
			"/Applications/QCut.app/Contents/Resources/bin/jianying-text-runtime-bridge",
		runtimeRoot: "/Applications/JianyingPro.app/Contents",
		runtimeFingerprint: "test-runtime",
	};
}

const animationManifest = {
	schemaVersion: 1 as const,
	packageVersion: "test",
	fileCount: 1,
	shaderFileCount: 1,
	meshFileCount: 0,
	renderTargetCount: 0,
	scriptFileCount: 1,
	textureFileCount: 0,
	capabilities: {
		staticTexture: false,
		multipleStrokes: false,
		animationComponents: true,
		scriptInfoSticker: false,
		shaderComponents: true,
		threeDimensional: false,
		feedbackComponents: false,
	},
	fingerprint: "test-animation-package",
};

describe("Jianying text bridge launch", () => {
	it("launches the prepared bridge without a DYLD environment dependency", () => {
		const runtime = createRuntime();
		const launch = resolveJianyingTextBridgeLaunch({ runtime });

		expect(launch.command).toBe(runtime.bridgePath);
		expect(launch.args).toEqual([runtime.runtimeRoot]);
		expect(launch.environment.DYLD_LIBRARY_PATH).toBeUndefined();
	});

	it("maps entrance, exit, and loop animations into isolated bridge slots", () => {
		const environment = resolveJianyingTextBridgeEnvironment({
			environment: { EXISTING_VALUE: "kept" },
			request: {
				requestId: "animation-slots",
				packagePath: "/cache/artistEffect/style/hash",
				packageKind: "TextStyle",
				outputPath: "/tmp/frames.rgba",
				width: 960,
				height: 540,
				frameCount: 90,
				startTimestamp: 0,
				timestampStep: 33_333.333,
				timelineDuration: 3_000_000,
				animations: [
					{
						slot: "entrance",
						animationType: 1,
						packagePath: "/cache/effect/entrance/hash",
						resourceId: "1001",
						packageHash: "a".repeat(32),
						duration: 0.5,
						manifest: animationManifest,
					},
					{
						slot: "exit",
						animationType: 2,
						packagePath: "/cache/effect/exit/hash",
						resourceId: "1002",
						packageHash: "b".repeat(32),
						duration: 0.75,
						manifest: animationManifest,
					},
					{
						slot: "loop",
						animationType: 3,
						packagePath: "/cache/effect/loop/hash",
						resourceId: "1003",
						packageHash: "c".repeat(32),
						duration: 1.2,
						manifest: animationManifest,
					},
				],
			},
		});

		expect(environment).toMatchObject({
			EXISTING_VALUE: "kept",
			JY_TEXT_TIMELINE_DURATION: "3000000",
			JY_TEXT_ANIMATION_1_PATH: "/cache/effect/entrance/hash",
			JY_TEXT_ANIMATION_1_DURATION: "500000",
			JY_TEXT_ANIMATION_2_PATH: "/cache/effect/exit/hash",
			JY_TEXT_ANIMATION_2_DURATION: "750000",
			JY_TEXT_ANIMATION_3_PATH: "/cache/effect/loop/hash",
			JY_TEXT_ANIMATION_3_DURATION: "1200000",
		});
	});

	it("preserves a fractional sequence origin for seek parity", () => {
		const environment = resolveJianyingTextBridgeEnvironment({
			environment: {},
			request: {
				requestId: "fractional-timing",
				packagePath: "/cache/artistEffect/style/hash",
				packageKind: "TextStyle",
				outputPath: "/tmp/frames.rgba",
				width: 320,
				height: 180,
				frameCount: 2,
				startTimestamp: 123_456.75,
				timestampStep: 33_333.333,
				timelineDuration: 3_000_000,
			},
		});

		expect(environment.JY_TEXT_TIMESTAMP).toBe("123456.75");
		expect(environment.JY_TEXT_TIMESTAMP_STEP).toBe("33333.333");
		expect(environment.JY_TEXT_RESOLUTION_TYPE).toBe("-1");
	});

	it("requires parameter editing to match every preloaded reference frame", () => {
		const referenceFrames = Buffer.concat([
			frame({ color: [0, 255, 0] }),
			frame({ color: [0, 0, 255] }),
		]);
		const staleFirstFrame = Buffer.concat([
			frame({ color: [255, 0, 0] }),
			frame({ color: [0, 0, 255] }),
		]);

		expect(
			verifyJianyingRuntimeParameterFrames({
				referenceBytes: referenceFrames,
				candidateBytes: referenceFrames,
				width: 2,
				height: 1,
				frameCount: 2,
			})
		).toBe(true);
		expect(
			verifyJianyingRuntimeParameterFrames({
				referenceBytes: referenceFrames,
				candidateBytes: staleFirstFrame,
				width: 2,
				height: 1,
				frameCount: 2,
			})
		).toBe(false);
		expect(
			verifyJianyingRuntimeParameterFrames({
				referenceBytes: referenceFrames,
				candidateBytes: Buffer.concat([frame({}), frame({})]),
				width: 2,
				height: 1,
				frameCount: 2,
			})
		).toBe(false);
	});
});
