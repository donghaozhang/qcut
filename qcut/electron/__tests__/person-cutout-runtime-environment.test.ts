// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPersonCutoutBridgeEnvironment } from "../jianying-person-cutout/runtime.js";

describe("person-cutout child environment", () => {
	it("never inherits the diagnostic video-object reset probe", () => {
		const directCoreML = createPersonCutoutBridgeEnvironment({
			frameworkDirectory: null,
			sourceEnvironment: { QCUT_VIDEO_OBJECT_RESET_FRAMES: "30" },
		});
		const hostInterop = createPersonCutoutBridgeEnvironment({
			frameworkDirectory: "/private/frameworks",
			sourceEnvironment: { QCUT_VIDEO_OBJECT_RESET_FRAMES: "30" },
		});

		expect(directCoreML.QCUT_VIDEO_OBJECT_RESET_FRAMES).toBeUndefined();
		expect(hostInterop.QCUT_VIDEO_OBJECT_RESET_FRAMES).toBeUndefined();
		expect(hostInterop.DYLD_LIBRARY_PATH).toBe("/private/frameworks");
	});

	it("removes every DYLD override and restores only the audited framework path", () => {
		const sourceEnvironment = {
			DYLD_FALLBACK_LIBRARY_PATH: "/untrusted/fallback",
			DYLD_FRAMEWORK_PATH: "/untrusted/frameworks",
			DYLD_INSERT_LIBRARIES: "/untrusted/injected.dylib",
			DYLD_LIBRARY_PATH: "/untrusted/libraries",
			DYLD_PRIVATE_OVERRIDE: "untrusted",
			QCUT_SAFE_SETTING: "preserved",
		};

		const environment = createPersonCutoutBridgeEnvironment({
			frameworkDirectory: "/audited/frameworks",
			sourceEnvironment,
		});

		expect(environment).toMatchObject({
			DYLD_LIBRARY_PATH: "/audited/frameworks",
			QCUT_SAFE_SETTING: "preserved",
		});
		expect(environment.DYLD_FALLBACK_LIBRARY_PATH).toBeUndefined();
		expect(environment.DYLD_FRAMEWORK_PATH).toBeUndefined();
		expect(environment.DYLD_INSERT_LIBRARIES).toBeUndefined();
		expect(environment.DYLD_PRIVATE_OVERRIDE).toBeUndefined();
		expect(sourceEnvironment.DYLD_INSERT_LIBRARIES).toBe(
			"/untrusted/injected.dylib"
		);
	});
});
