import { describe, expect, it, vi } from "vitest";
import {
	createJianyingTargetAppGuard,
	JianyingAppRunningError,
} from "../jianying-target-app-guard.js";

const guardContext = {
	outputParentDirectory: "/exports",
	sourceProjectDirectory: "/projects/source",
};

describe("Jianying target app guard", () => {
	it("rejects a running executable inside the Jianying app bundle", async () => {
		const guard = createJianyingTargetAppGuard({
			appPath: "/Applications/VideoFusion-macOS.app",
			canonicalizePath: vi.fn(async (path) => path),
			readProcessTable: vi.fn(
				async () =>
					"123 /Applications/VideoFusion-macOS.app/Contents/MacOS/VideoFusion-macOS\n"
			),
		});

		await expect(guard(guardContext)).rejects.toBeInstanceOf(
			JianyingAppRunningError
		);
	});

	it("allows export when only unrelated applications are running", async () => {
		const guard = createJianyingTargetAppGuard({
			appPath: "/Applications/VideoFusion-macOS.app",
			canonicalizePath: vi.fn(async (path) => path),
			readProcessTable: vi.fn(
				async () => "123 /Applications/QCut.app/Contents/MacOS/QCut\n"
			),
		});

		await expect(guard(guardContext)).resolves.toBeUndefined();
	});

	it("recognizes a canonicalized helper executable", async () => {
		const canonicalizePath = vi.fn(async (path: string) => {
			if (path === "/private/helper-link") {
				return "/Applications/VideoFusion-macOS.app/Contents/Frameworks/helper";
			}
			return path;
		});
		const guard = createJianyingTargetAppGuard({
			appPath: "/Applications/VideoFusion-macOS.app",
			canonicalizePath,
			readProcessTable: vi.fn(async () => "456 /private/helper-link\n"),
		});

		await expect(guard(guardContext)).rejects.toBeInstanceOf(
			JianyingAppRunningError
		);
	});
});
