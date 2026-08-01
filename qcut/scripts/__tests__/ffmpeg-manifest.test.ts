import { describe, expect, it } from "vitest";
import {
	getTargetKeys,
	loadFFmpegManifest,
	manifestFingerprint,
} from "../ffmpeg-manifest";

function isMonthEndBtbNRelease({ url }: { url: string }): boolean {
	const match = url.match(/\/autobuild-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}\//);
	if (!match) return false;
	const [, rawYear, rawMonth, rawDay] = match;
	const year = Number(rawYear);
	const month = Number(rawMonth);
	const day = Number(rawDay);
	return day === new Date(Date.UTC(year, month, 0)).getUTCDate();
}

describe("FFmpeg binary manifest", () => {
	it("pins FFmpeg 8.1.2 for every desktop target", async () => {
		const manifest = await loadFFmpegManifest();
		expect(manifest.nativeVersion).toBe("8.1.2");
		expect(getTargetKeys({ manifest }).sort()).toEqual([
			"darwin-arm64",
			"darwin-x64",
			"linux-x64",
			"win32-x64",
		]);

		for (const target of Object.values(manifest.targets)) {
			expect(target.versionMarker).toContain("8.1.2");
			expect(target.hardwareAccelerators.length).toBeGreaterThan(0);
			const providedTools = target.artifacts.flatMap((artifact) =>
				Object.keys(artifact.files)
			);
			expect(providedTools).toContain("ffmpeg");
			expect(providedTools).toContain("ffprobe");
			for (const artifact of target.artifacts) {
				expect(artifact.url).toMatch(/^https:\/\//);
				expect(artifact.url).not.toContain("/latest/");
				expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
				expect(["zip", "tar.xz"]).toContain(artifact.archiveFormat);
			}
		}
	});

	it("requires the shared codec and filter capability baseline", async () => {
		const manifest = await loadFFmpegManifest();
		expect(manifest.requiredBuildFlags).toEqual([
			"--enable-libx264",
			"--enable-libx265",
			"--enable-libass",
			"--enable-libfreetype",
			"--enable-fontconfig",
			"--enable-libharfbuzz",
			"--enable-libvmaf",
			"--enable-libzimg",
		]);
		expect(manifest.forbiddenBuildFlags).toEqual(["--enable-nonfree"]);
	});

	it("pins BtbN targets to retained monthly releases", async () => {
		const manifest = await loadFFmpegManifest();
		for (const targetKey of ["linux-x64", "win32-x64"] as const) {
			for (const artifact of manifest.targets[targetKey].artifacts) {
				expect(artifact.url).toContain("github.com/BtbN/FFmpeg-Builds");
				expect(isMonthEndBtbNRelease({ url: artifact.url })).toBe(true);
			}
		}
	});

	it("invalidates staged binaries when source metadata changes", async () => {
		const manifest = await loadFFmpegManifest();
		const target = manifest.targets["darwin-arm64"];
		const original = manifestFingerprint({
			target,
			requiredBuildFlags: manifest.requiredBuildFlags,
			forbiddenBuildFlags: manifest.forbiddenBuildFlags,
		});
		const changed = manifestFingerprint({
			target: {
				...target,
				artifacts: target.artifacts.map((artifact, index) =>
					index === 0 ? { ...artifact, sha256: "0".repeat(64) } : artifact
				),
			},
			requiredBuildFlags: manifest.requiredBuildFlags,
			forbiddenBuildFlags: manifest.forbiddenBuildFlags,
		});
		expect(changed).not.toBe(original);
	});

	it("documents the upstream FFmpeg.wasm boundary", async () => {
		const manifest = await loadFFmpegManifest();
		expect(manifest.wasm).toEqual({
			packageVersion: "0.12.10",
			nativeVersion: "5.1.4",
			policy: "pinned-to-upstream",
		});
	});
});
