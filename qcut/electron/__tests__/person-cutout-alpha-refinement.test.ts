import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const describeOnMac = process.platform === "darwin" ? describe : describe.skip;
let temporaryDirectory = "";

describeOnMac("person cutout alpha refinement", () => {
	beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			path.join(os.tmpdir(), "qcut-alpha-refinement-test-")
		);
	});

	afterAll(async () => {
		if (!temporaryDirectory) return;
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("keeps parity defaults and applies advanced controls", async () => {
		const nativeDirectory = path.resolve(
			__dirname,
			"../jianying-person-cutout/native"
		);
		const executablePath = path.join(
			temporaryDirectory,
			"alpha-refinement-test"
		);
		await execFileAsync("xcrun", [
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			path.join(nativeDirectory, "alpha-refinement.cpp"),
			path.join(nativeDirectory, "alpha-refinement.test.cpp"),
			"-o",
			executablePath,
		]);
		await expect(execFileAsync(executablePath)).resolves.toBeDefined();
	});
});
