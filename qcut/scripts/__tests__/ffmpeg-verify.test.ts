import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FFmpegTarget } from "../ffmpeg-manifest";
import { verifyFFmpegBinaries } from "../ffmpeg-verify";

const TARGET: FFmpegTarget = {
	platform: "linux",
	arch: "x64",
	versionToken: "n8.1.2-test",
	hardwareAccelerators: ["vaapi"],
	artifacts: [],
};

async function writeTestBinary({
	filePath,
	metadata,
}: {
	filePath: string;
	metadata: string;
}): Promise<void> {
	await writeFile(
		filePath,
		Buffer.concat([Buffer.from(metadata), Buffer.alloc(1_000_001)])
	);
}

describe("FFmpeg binary verification", () => {
	it("rejects forbidden nonfree builds before packaging", async () => {
		const testRoot = await mkdtemp(join(tmpdir(), "qcut-ffmpeg-verify-"));
		const ffmpegPath = join(testRoot, "ffmpeg");
		const ffprobePath = join(testRoot, "ffprobe");
		try {
			await Promise.all([
				writeTestBinary({
					filePath: ffmpegPath,
					metadata: "n8.1.2-test --enable-libx264 --enable-nonfree vaapi",
				}),
				writeTestBinary({ filePath: ffprobePath, metadata: "n8.1.2-test" }),
			]);

			await expect(
				verifyFFmpegBinaries({
					targetKey: "linux-x64",
					target: TARGET,
					requiredBuildFlags: ["--enable-libx264"],
					forbiddenBuildFlags: ["--enable-nonfree"],
					ffmpegPath,
					ffprobePath,
					execute: false,
				})
			).rejects.toThrow("contains --enable-nonfree");
		} finally {
			await rm(testRoot, { recursive: true, force: true });
		}
	});
});
