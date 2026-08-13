// @vitest-environment node
import { describe, expect, it } from "vitest";
import { jianyingTextRuntimeDiscoveryTestUtils } from "../jianying-text-runtime/runtime-discovery.js";

const ABI_PROFILE = "jianying-text-d634-arm64-v1";
const CORE_UUID = "D6342ECD-5432-33F0-A2AD-0C28F5699994";
const CURRENT_ABI_PROFILE = "jianying-text-fdf4-arm64-v1";
const CURRENT_CORE_UUID = "FDF42EF4-427D-30DF-9310-A8C7B352C5CD";

describe("Jianying text runtime discovery", () => {
	it("prefers the installed Jianying runtime over the private fallback", () => {
		expect(
			jianyingTextRuntimeDiscoveryTestUtils.runtimeCandidates({
				environment: {},
				homeDirectory: "/Users/tester",
			})
		).toEqual([
			"/Applications/VideoFusion-macOS.app/Contents",
			"/Users/tester/Applications/VideoFusion-macOS.app/Contents",
			"/Users/tester/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current",
		]);
	});

	it("uses explicit runtime overrides without silently falling back", () => {
		expect(
			jianyingTextRuntimeDiscoveryTestUtils.runtimeCandidates({
				environment: {
					JY_RUNTIME_ROOT: "/legacy-runtime",
					QCUT_JIANYING_RUNTIME_ROOT: "/shared-runtime",
					QCUT_JIANYING_TEXT_RUNTIME_ROOT: "/text-runtime",
				},
				homeDirectory: "/Users/tester",
			})
		).toEqual(["/text-runtime", "/shared-runtime", "/legacy-runtime"]);
	});

	it("parses the exact ABI identity emitted by the isolated bridge", () => {
		expect(
			jianyingTextRuntimeDiscoveryTestUtils.parseRuntimeProbeOutput({
				stdout: [
					"[load] libcccreator.dylib",
					`[text-runtime] abi-profile=${ABI_PROFILE} core-uuid=${CORE_UUID.toLowerCase()}`,
				].join("\n"),
			})
		).toEqual({
			abiProfile: ABI_PROFILE,
			coreUuid: CORE_UUID,
		});
	});

	it("parses the current Jianying ABI identity", () => {
		expect(
			jianyingTextRuntimeDiscoveryTestUtils.parseRuntimeProbeOutput({
				stdout: `[text-runtime] abi-profile=${CURRENT_ABI_PROFILE} core-uuid=${CURRENT_CORE_UUID}`,
			})
		).toEqual({
			abiProfile: CURRENT_ABI_PROFILE,
			coreUuid: CURRENT_CORE_UUID,
		});
	});

	it("requires an identity marker instead of trusting a zero exit code", async () => {
		const result = await jianyingTextRuntimeDiscoveryTestUtils.probeRuntimeRoot(
			{
				runtimeRoot: "/runtime",
				bridgePath: "/bridge",
				execute: async ({ args, timeoutMs }) => {
					expect(args).toEqual(["/runtime", "inspect"]);
					expect(timeoutMs).toBe(15_000);
					return { stdout: "bridge exited successfully" };
				},
			}
		);

		expect(result.compatibility).toBeNull();
		expect(result.error).toContain("未返回可识别的 ABI 身份");
	});

	it("accepts a candidate only after the bridge reports its ABI identity", async () => {
		const result = await jianyingTextRuntimeDiscoveryTestUtils.probeRuntimeRoot(
			{
				runtimeRoot: "/runtime",
				bridgePath: "/bridge",
				execute: async ({ command, environment }) => {
					expect(command).toBe("/bridge");
					expect(environment.DYLD_LIBRARY_PATH).toBeUndefined();
					return {
						stdout: `[text-runtime] abi-profile=${ABI_PROFILE} core-uuid=${CORE_UUID}`,
					};
				},
			}
		);

		expect(result).toMatchObject({
			runtimeRoot: "/runtime",
			bridgePath: "/bridge",
			compatibility: {
				abiProfile: ABI_PROFILE,
				coreUuid: CORE_UUID,
			},
		});
	});

	it("surfaces the bridge error without dumping unrelated process output", () => {
		const cause = Object.assign(new Error("process exited"), {
			stderr: "loader noise\n[error] libcccreator UUID mismatch\nmore noise",
		});

		expect(
			jianyingTextRuntimeDiscoveryTestUtils.runtimeProbeError({ cause })
		).toBe("libcccreator UUID mismatch");
	});
});
