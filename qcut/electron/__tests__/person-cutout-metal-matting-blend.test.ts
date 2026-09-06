import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const describeOnMac = process.platform === "darwin" ? describe : describe.skip;
let temporaryDirectory = "";

describeOnMac("TEMattingBlendEffectV2 frame contract", () => {
	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			path.join(os.tmpdir(), "qcut-metal-matting-blend-test-")
		);
	});

	afterAll(async () => {
		if (!temporaryDirectory) return;
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("accepts low-resolution Alpha and enforces source Alpha bounds", async () => {
		const nativeDirectory = path.resolve(
			__dirname,
			"../jianying-person-cutout/native"
		);
		const executablePath = path.join(
			temporaryDirectory,
			"metal-matting-blend-test"
		);
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "metal-matting-blend.cpp"),
			path.join(nativeDirectory, "metal-matting-blend.test.cpp"),
			"-framework",
			"OpenGL",
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	});
});
