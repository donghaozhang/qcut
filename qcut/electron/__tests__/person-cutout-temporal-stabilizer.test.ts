import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const describeOnMac = process.platform === "darwin" ? describe : describe.skip;
let temporaryDirectory = "";

describeOnMac("person cutout temporal foreground stabilizer", () => {
	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			path.join(os.tmpdir(), "qcut-temporal-stabilizer-test-")
		);
	});

	afterAll(async () => {
		if (!temporaryDirectory) return;
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("holds stable-color foreground confidence without retaining background", async () => {
		const nativeDirectory = path.resolve(
			"electron",
			"jianying-person-cutout",
			"native"
		);
		const executablePath = path.join(temporaryDirectory, "stabilizer-test");
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "alpha-temporal-stabilizer.cpp"),
			path.join(nativeDirectory, "alpha-temporal-stabilizer.test.cpp"),
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	});
});
