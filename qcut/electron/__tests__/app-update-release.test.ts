import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	compareQCutPackageVersions,
	downloadQCutReleaseAsset,
	fetchLatestQCutRelease,
	selectQCutReleaseAsset,
	type QCutReleaseAsset,
} from "../app-update-release.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "qcut-update-release-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

function releaseAsset({
	contents,
	name = "QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
}: {
	contents: Uint8Array;
	name?: string;
}): QCutReleaseAsset {
	return {
		name,
		url: `https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.02.7/${name}`,
		size: contents.byteLength,
		digest: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
	};
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("QCut app update release client", () => {
	it("selects only an official package with a GitHub digest", () => {
		const selected = selectQCutReleaseAsset({
			kind: "mac-zip",
			arch: "arm64",
			assets: [
				{
					name: "QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
					browser_download_url: "https://example.com/untrusted.zip",
					size: 100,
					digest: `sha256:${"a".repeat(64)}`,
				},
				{
					name: "QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
					browser_download_url:
						"https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.02.7/QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
					size: 100,
				},
				{
					name: "QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
					browser_download_url:
						"https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.02.7/QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
					size: 100,
					digest: `sha256:${"b".repeat(64)}`,
				},
			],
		});

		expect(selected?.digest).toBe(`sha256:${"b".repeat(64)}`);
	});

	it("parses the latest official release", async () => {
		const asset = releaseAsset({ contents: new TextEncoder().encode("qcut") });
		const release = await fetchLatestQCutRelease({
			kind: "mac-zip",
			arch: "arm64",
			fetchImpl: async () =>
				new Response(
					JSON.stringify({
						tag_name: "v2026.08.02.7",
						published_at: "2026-08-02T07:23:35Z",
						html_url:
							"https://github.com/Quriosity-agent/qcut/releases/tag/v2026.08.02.7",
						assets: [
							{
								name: asset.name,
								browser_download_url: asset.url,
								size: asset.size,
								digest: asset.digest,
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } }
				),
		});

		expect(release.version).toBe("2026.8.207");
		expect(release.asset).toEqual(asset);
	});

	it("streams and verifies a release package before publishing it", async () => {
		const contents = new TextEncoder().encode("verified-qcut-package");
		const asset = releaseAsset({ contents });
		const destinationPath = join(temporaryDirectory(), asset.name);
		const progress: number[] = [];

		await downloadQCutReleaseAsset({
			asset,
			destinationPath,
			fetchImpl: async () => new Response(contents, { status: 200 }),
			onProgress: ({ transferred }) => progress.push(transferred),
		});

		expect(readFileSync(destinationPath)).toEqual(Buffer.from(contents));
		expect(progress.at(-1)).toBe(contents.byteLength);
	});

	it("removes a package whose digest does not match", async () => {
		const contents = new TextEncoder().encode("tampered");
		const asset = {
			...releaseAsset({ contents }),
			digest: `sha256:${"0".repeat(64)}`,
		};
		const destinationPath = join(temporaryDirectory(), asset.name);

		await expect(
			downloadQCutReleaseAsset({
				asset,
				destinationPath,
				fetchImpl: async () => new Response(contents, { status: 200 }),
			})
		).rejects.toThrow("SHA-256");
		expect(existsSync(destinationPath)).toBe(false);
	});

	it("orders installed and release package versions", () => {
		expect(
			compareQCutPackageVersions({
				current: "2026.8.103",
				latest: "2026.8.207",
			})
		).toBe(-1);
		expect(
			compareQCutPackageVersions({
				current: "2026.8.207",
				latest: "2026.8.207",
			})
		).toBe(0);
	});
});
