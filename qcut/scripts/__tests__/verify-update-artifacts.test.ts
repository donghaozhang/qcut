import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	getUpdateArtifactNames,
	verifyUpdateArtifacts,
} from "../verify-update-artifacts";

const temporaryDirectories: string[] = [];

function createDistDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "qcut-update-artifacts-"));
	temporaryDirectories.push(directory);
	mkdirSync(directory, { recursive: true });
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("getUpdateArtifactNames", () => {
	it("deduplicates the primary path and file entry", () => {
		expect(
			getUpdateArtifactNames({
				manifestText: [
					"files:",
					"  - url: QCut-AI-Video-Editor-1.2.3-arm64-mac.zip",
					"path: QCut-AI-Video-Editor-1.2.3-arm64-mac.zip",
				].join("\n"),
			})
		).toEqual(["QCut-AI-Video-Editor-1.2.3-arm64-mac.zip"]);
	});

	it("includes a differential blockmap when the manifest requires one", () => {
		expect(
			getUpdateArtifactNames({
				manifestText: [
					"files:",
					"  - url: QCut-AI-Video-Editor-1.2.3.AppImage",
					"    blockMapSize: 1200",
					"path: QCut-AI-Video-Editor-1.2.3.AppImage",
				].join("\n"),
			})
		).toEqual([
			"QCut-AI-Video-Editor-1.2.3.AppImage",
			"QCut-AI-Video-Editor-1.2.3.AppImage.blockmap",
		]);
	});

	it("rejects paths that could escape the release artifact directory", () => {
		expect(() =>
			getUpdateArtifactNames({
				manifestText: "path: ../QCut.zip",
			})
		).toThrow("non-local path");
	});
});

describe("verifyUpdateArtifacts", () => {
	it("accepts a manifest when every referenced artifact exists", () => {
		const distDir = createDistDirectory();
		const artifactName = "QCut-AI-Video-Editor-1.2.3-arm64-mac.zip";
		writeFileSync(join(distDir, artifactName), "archive");
		writeFileSync(
			join(distDir, "latest-mac.yml"),
			`files:\n  - url: ${artifactName}\npath: ${artifactName}\n`
		);

		expect(
			verifyUpdateArtifacts({
				distDir,
				manifestNames: ["latest-mac.yml"],
			})
		).toEqual([artifactName]);
	});

	it("fails before publishing a manifest with a missing artifact", () => {
		const distDir = createDistDirectory();
		writeFileSync(
			join(distDir, "latest.yml"),
			"path: QCut-AI-Video-Editor-Setup-1.2.3.exe\n"
		);

		expect(() =>
			verifyUpdateArtifacts({
				distDir,
				manifestNames: ["latest.yml"],
			})
		).toThrow("references missing artifact");
	});
});
