// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	resolveJianyingTextBridgeLaunch,
	type JianyingTextBridgeRuntime,
} from "../jianying-text-runtime/bridge-render.js";

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
});
