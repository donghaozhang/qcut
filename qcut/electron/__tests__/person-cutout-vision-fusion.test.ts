// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const describeOnMac = process.platform === "darwin" ? describe : describe.skip;
let temporaryDirectory = "";

describeOnMac("person cutout Vision fusion", () => {
	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			path.join(os.tmpdir(), "qcut-vision-fusion-test-")
		);
	});

	afterAll(async () => {
		if (!temporaryDirectory) return;
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("boosts missing person confidence without weakening the GRU alpha", async () => {
		const nativeDirectory = path.resolve(
			"electron",
			"jianying-person-cutout",
			"native"
		);
		const executablePath = path.join(temporaryDirectory, "alpha-fusion-test");
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "alpha-mask-fusion.cpp"),
			path.join(nativeDirectory, "alpha-mask-fusion.test.cpp"),
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	});

	it("resizes model alpha with centered bilinear sampling", async () => {
		const nativeDirectory = path.resolve(
			"electron",
			"jianying-person-cutout",
			"native"
		);
		const executablePath = path.join(temporaryDirectory, "alpha-resize-test");
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "alpha-resize.cpp"),
			path.join(nativeDirectory, "alpha-resize.test.cpp"),
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	});

	it("returns a full-size mask through the macOS Vision runtime", async () => {
		const nativeDirectory = path.resolve(
			"electron",
			"jianying-person-cutout",
			"native"
		);
		const executablePath = path.join(temporaryDirectory, "vision-runtime-test");
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "alpha-resize.cpp"),
			path.join(nativeDirectory, "vision-person-segmentation.mm"),
			path.join(nativeDirectory, "vision-person-segmentation.test.mm"),
			"-framework",
			"Vision",
			"-framework",
			"CoreVideo",
			"-framework",
			"Foundation",
			"-framework",
			"ImageIO",
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	}, 120_000);
});
