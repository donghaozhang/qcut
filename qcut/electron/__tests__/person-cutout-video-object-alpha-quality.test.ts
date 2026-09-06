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

describeOnMac("video-object alpha quality gate", () => {
	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			path.join(os.tmpdir(), "qcut-video-object-alpha-quality-test-")
		);
	});

	afterAll(async () => {
		if (!temporaryDirectory) return;
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("checks complete streams without rejecting empty prefixes or all-zero masks", async () => {
		const nativeDirectory = path.resolve(
			__dirname,
			"../jianying-person-cutout/native"
		);
		const executablePath = path.join(
			temporaryDirectory,
			"video-object-alpha-quality-test"
		);
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "video-object-alpha-quality.cpp"),
			path.join(nativeDirectory, "video-object-alpha-quality.test.cpp"),
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	});
});
