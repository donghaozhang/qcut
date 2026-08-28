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

describeOnMac("video-object CoreML tensor preprocessing", () => {
  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "qcut-video-object-coreml-preprocess-test-"),
    );
  });

  afterAll(async () => {
    if (!temporaryDirectory) return;
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  it("compiles and verifies color, temporal-state, reset, and raw Alpha contracts", async () => {
    const nativeDirectory = path.resolve(
      "electron",
      "jianying-person-cutout",
      "native",
    );
    const executablePath = path.join(
      temporaryDirectory,
      "video-object-coreml-preprocess-test",
    );
    await execFileAsync("xcrun", [
      "clang++",
      "-std=c++20",
      "-Wall",
      "-Wextra",
      "-Werror",
      path.join(nativeDirectory, "alpha-resize.cpp"),
      path.join(nativeDirectory, "video-object-coreml-preprocess.cpp"),
      path.join(nativeDirectory, "video-object-coreml-preprocess.test.cpp"),
      "-o",
      executablePath,
    ]);
    await expect(execFileAsync(executablePath)).resolves.toBeDefined();
  });
});
