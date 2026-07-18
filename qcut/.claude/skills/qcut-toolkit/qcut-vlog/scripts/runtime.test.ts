import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { isArtifactFresh } from "./runtime";

describe("qcut-vlog artifact freshness", () => {
	test("requires an existing artifact newer than every dependency", () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-vlog-freshness-"));
		const dependency = join(directory, "clean-video.mp4");
		const secondDependency = join(directory, "transcription.srt");
		const artifact = join(directory, "final-video.mp4");
		const missing = join(directory, "missing.mp4");
		const now = Date.now() / 1000;

		writeFileSync(dependency, "clean-video");
		writeFileSync(secondDependency, "subtitles");
		writeFileSync(artifact, "final-video");
		utimesSync(dependency, now - 30, now - 30);
		utimesSync(secondDependency, now - 20, now - 20);
		utimesSync(artifact, now - 10, now - 10);

		expect(
			isArtifactFresh({
				artifact,
				dependencies: [dependency, secondDependency],
			})
		).toBe(true);
		expect(
			isArtifactFresh({ artifact: missing, dependencies: [dependency] })
		).toBe(false);
		expect(
			isArtifactFresh({ artifact, dependencies: [dependency, missing] })
		).toBe(false);

		utimesSync(dependency, now, now);
		expect(
			isArtifactFresh({
				artifact,
				dependencies: [dependency, secondDependency],
			})
		).toBe(false);
	});
});
