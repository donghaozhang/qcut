import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseComposeManifest } from "../compose-manifest";
import { renderResolvedComposeProject } from "../compose-render";
import type { ResolvedComposeProject } from "../compose-resolver";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

function resolvedProject({
	clipSource,
	soundSource,
}: {
	clipSource: string;
	soundSource?: string;
}): ResolvedComposeProject {
	const manifest = parseComposeManifest({
		value: {
			schemaVersion: 1,
			canvas: { width: 640, height: 360, fps: 24 },
			clips: [{ id: "clip-a", source: clipSource }],
			...(soundSource
				? {
						audio: [
							{
								type: "sound-effect",
								source: soundSource,
								start: 0,
								trim: { in: 0, out: 0.5 },
							},
						],
					}
				: {}),
		},
	});
	const media = {
		duration: 1,
		width: 640,
		height: 360,
		frameRate: 24,
		hasVideo: true,
		hasAudio: true,
	};
	const audio = soundSource
		? [
				{
					audio: manifest.audio[0],
					sourcePath: soundSource,
					media: { ...media, hasVideo: false, width: 0, height: 0 },
					duration: 0.5,
					identity: { sha256: "b".repeat(64), bytes: 10 },
				},
			]
		: [];
	return {
		loaded: {
			configPath: "/tmp/edit.qcut-compose.json",
			configDirectory: "/tmp",
			manifest,
		},
		clips: [
			{
				clip: manifest.clips[0],
				sourcePath: clipSource,
				media,
				duration: 1,
				filterPlans: [],
			},
		],
		transitionsByCut: [],
		overlays: [],
		audio,
		duration: 1,
		lock: {
			schemaVersion: 1,
			kind: "qcut-compose-lock-v1",
			configSha256: "a".repeat(64),
			canvas: manifest.canvas,
			duration: 1,
			assets: [],
			filters: [],
			transitions: [],
		},
	};
}

describe("compose render publication", () => {
	it("does not replace a sound-effect input", async () => {
		const outputPath = "/tmp/sound-source.mp4";

		await expect(
			renderResolvedComposeProject({
				resolved: resolvedProject({
					clipSource: "/tmp/clip.mp4",
					soundSource: outputPath,
				}),
				outputPath,
				force: true,
				signal: new AbortController().signal,
			})
		).rejects.toThrow(/cannot replace an input asset/);
	});

	it("rejects a staged output with the wrong frame rate", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "qcut-compose-render-test-")
		);
		temporaryDirectories.push(directory);
		const outputPath = join(directory, "result.mp4");

		await expect(
			renderResolvedComposeProject({
				resolved: resolvedProject({ clipSource: join(directory, "clip.mp4") }),
				outputPath,
				force: false,
				signal: new AbortController().signal,
				dependencies: {
					runFfmpeg: async ({ args }) => {
						await writeFile(args.at(-1) ?? "", "staged video");
					},
					probeMedia: async () => ({
						duration: 1,
						width: 640,
						height: 360,
						frameRate: 25,
						hasVideo: true,
						hasAudio: true,
					}),
				},
			})
		).rejects.toThrow(/25\.000 fps/);
	});
});
