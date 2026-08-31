// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildComposeEditorProjectPatch } from "../native-pipeline/compose/compose-editor-project.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";

function emptySnapshot(): ComposeSnapshot {
	const project = {
		id: "project-1",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 0,
	};
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-31T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media: [],
			captions: [],
		}),
		project,
		media: [],
		captions: [],
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

async function writeManifest({
	value,
}: {
	value: unknown;
}): Promise<{ configPath: string; configDirectory: string }> {
	const configDirectory = await mkdtemp(join(tmpdir(), "compose-editor-"));
	const configPath = join(configDirectory, "edit.qcut-compose.json");
	await writeFile(configPath, JSON.stringify(value, null, 2));
	return { configPath, configDirectory };
}

const fakeProbe = async ({ filePath }: { filePath: string }) => ({
	duration: filePath.endsWith("a.mp4")
		? 12
		: filePath.endsWith("b.mp4")
			? 5
			: 3,
	width: 1920,
	height: 1080,
	frameRate: 30,
	hasVideo: !filePath.endsWith(".mp3"),
	hasAudio: true,
});

describe("buildComposeEditorProjectPatch", () => {
	it("compiles the manifest and attaches absolute local paths", async () => {
		const { configPath, configDirectory } = await writeManifest({
			value: {
				schemaVersion: 1,
				clips: [
					{ id: "a", source: "a.mp4", trim: { in: 1, out: 11 } },
					{ id: "b", source: "b.mp4" },
				],
				transitions: [{ between: ["a", "b"], duration: 0.5 }],
				audio: [
					{
						type: "sound-effect",
						source: "fx.mp3",
						start: 1,
						trim: { in: 0, out: 2 },
					},
				],
			},
		});
		const build = await buildComposeEditorProjectPatch({
			configPath,
			projectId: "project-1",
			snapshot: emptySnapshot(),
			signal: new AbortController().signal,
			createdAt: "2026-08-31T00:00:00.000Z",
			probe: fakeProbe,
		});
		expect(build.timelineDuration).toBeCloseTo(14.5, 6);
		const clips = build.patch.operations.filter(
			(operation) => operation.kind === "insert-media-clip"
		);
		expect(clips).toHaveLength(2);
		for (const clip of clips) {
			// Platform-neutral: Windows absolute paths start with a drive letter.
			expect(isAbsolute(clip.asset.localPath ?? "")).toBe(true);
			expect(clip.asset.localPath?.startsWith(resolve(configDirectory))).toBe(
				true
			);
		}
		const sound = build.patch.operations.find(
			(operation) => operation.kind === "add-sound-effect"
		);
		expect(sound?.asset.localPath).toBe(resolve(configDirectory, "fx.mp3"));
	});

	it("is deterministic for the same manifest and project", async () => {
		const { configPath } = await writeManifest({
			value: {
				schemaVersion: 1,
				clips: [{ id: "a", source: "a.mp4" }],
			},
		});
		const input = {
			configPath,
			projectId: "project-1",
			snapshot: emptySnapshot(),
			signal: new AbortController().signal,
			createdAt: "2026-08-31T00:00:00.000Z",
			probe: fakeProbe,
		};
		const first = await buildComposeEditorProjectPatch(input);
		const second = await buildComposeEditorProjectPatch(input);
		expect(second.patch).toEqual(first.patch);
		expect(second.manifestSha256).toBe(first.manifestSha256);
	});

	it("rejects manifest file overlays for the editor target", async () => {
		const { configPath } = await writeManifest({
			value: {
				schemaVersion: 1,
				clips: [{ id: "a", source: "a.mp4" }],
				overlays: [{ type: "sticker", source: "s.gif", start: 1, duration: 2 }],
			},
		});
		await expect(
			buildComposeEditorProjectPatch({
				configPath,
				projectId: "project-1",
				snapshot: emptySnapshot(),
				signal: new AbortController().signal,
				probe: fakeProbe,
			})
		).rejects.toThrow(/Sticker Lab asset ids/);
	});
});
