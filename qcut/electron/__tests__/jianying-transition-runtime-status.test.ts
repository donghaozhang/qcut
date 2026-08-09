import { describe, expect, it } from "vitest";
import { JIANYING_TRANSITIONS } from "../jianying-transition-catalog.js";
import { buildJianyingRuntimeStatus } from "../jianying-transition/runtime-discovery.js";

function allLocalPackagePaths(): Map<string, string> {
	return new Map(
		JIANYING_TRANSITIONS.filter(
			(transition) => transition.runtimeKind === "transition-segment"
		).map((transition) => [transition.id, `/ignored/${transition.resourceId}`])
	);
}

describe("Jianying transition runtime status", () => {
	it("reports all binary-backed entries when the runtime ABI is compatible", () => {
		const status = buildJianyingRuntimeStatus({
			appBundlePath: "/Applications/VideoFusion-macOS.app",
			runtimeRootPath: "/ignored/runtime",
			bridgePath: "/ignored/bridge",
			packagePaths: allLocalPackagePaths(),
		});

		expect(status.state).toBe("ready");
		expect(status.availableCount).toBe(67);
		expect(
			status.transitions.filter((transition) => transition.available)
		).toHaveLength(67);
		const aiGenerationEntries = status.transitions.filter(
			(transition) => transition.runtimeKind === "ai-generation"
		);
		expect(aiGenerationEntries).toHaveLength(5);
		expect(
			aiGenerationEntries.every((transition) => !transition.available)
		).toBe(true);
	});

	it("marks every package unavailable when the runtime ABI is incompatible", () => {
		const status = buildJianyingRuntimeStatus({
			appBundlePath: "/Applications/VideoFusion-macOS.app",
			runtimeRootPath: null,
			bridgePath: "/ignored/bridge",
			packagePaths: allLocalPackagePaths(),
			runtimeError: "UUID mismatch",
		});

		expect(status.state).toBe("runtime-incompatible");
		expect(status.availableCount).toBe(0);
		expect(status.message).toBe("UUID mismatch");
		expect(
			status.transitions.every((transition) => !transition.available)
		).toBe(true);
	});

	it("can use an explicit compatible local runtime without an app bundle", () => {
		const status = buildJianyingRuntimeStatus({
			appBundlePath: null,
			runtimeRootPath: "/ignored/runtime",
			bridgePath: "/ignored/bridge",
			packagePaths: allLocalPackagePaths(),
		});

		expect(status.state).toBe("ready");
		expect(status.appInstalled).toBe(false);
		expect(status.availableCount).toBe(67);
	});
});
