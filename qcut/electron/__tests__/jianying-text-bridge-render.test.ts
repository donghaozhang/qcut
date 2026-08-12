// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	resolveJianyingTextBridgeLaunch,
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

describe("Jianying text bridge launch", () => {
	it("launches the prepared bridge without a DYLD environment dependency", () => {
		const runtime = createRuntime();
		const launch = resolveJianyingTextBridgeLaunch({ runtime });

		expect(launch.command).toBe(runtime.bridgePath);
		expect(launch.args).toEqual([runtime.runtimeRoot]);
		expect(launch.environment.DYLD_LIBRARY_PATH).toBeUndefined();
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
