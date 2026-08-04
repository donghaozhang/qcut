import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	runSemanticDiffCase,
	SEMANTIC_DIFF_MANIFEST_FILE_NAME,
} from "../capcut-e2e/semantic-diff.js";

/**
 * JYI-017 acceptance (script half): the offline round-trip diff case runs
 * the real import pipeline over two draft directories and produces a
 * hash-bound, path-free evidence manifest with the right verdicts.
 */

let rootDirectory: string;

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-semantic-diff-test-"));
});

afterEach(async () => {
	await rm(rootDirectory, { recursive: true, force: true });
});

async function writeDraft({
	name,
	mutate,
}: {
	name: string;
	mutate?: (content: Record<string, unknown>) => void;
}): Promise<string> {
	// Non-literal specifier: scripts' tsc must not follow editor-core sources.
	const modulePath = join(
		process.cwd(),
		"packages",
		"editor-core",
		"src",
		"jianying-draft",
		"index.ts"
	);
	const { buildJianyingDraft } = (await import(
		pathToFileURL(modulePath).href
	)) as {
		buildJianyingDraft: (options: unknown) => {
			content: Record<string, unknown>;
		};
	};
	const draftDirectory = join(rootDirectory, name);
	await mkdir(draftDirectory, { recursive: true });
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: draftDirectory,
		snapshot: {
			media: [
				{
					duration: 5,
					height: 1080,
					id: "video-1",
					name: "clip.mp4",
					sourcePath: "/source/clip.mp4",
					type: "video",
					width: 1920,
				},
			],
			project: {
				backgroundColor: "transparent",
				backgroundType: "color",
				fps: 30,
				height: 1080,
				id: "project-1",
				name: "Diff Fixture",
				sceneId: "scene-1",
				width: 1920,
			},
			schemaVersion: 1,
			timelineDurationByElementId: { "clip-1": 5 },
			tracks: [
				{
					elements: [
						{
							duration: 5,
							id: "clip-1",
							mediaId: "video-1",
							name: "clip-1",
							startTime: 0,
							trimEnd: 0,
							trimStart: 0,
							type: "media",
						},
					],
					hidden: false,
					id: "track-1",
					muted: false,
					name: "Video",
					order: 0,
					type: "media",
				},
			],
		},
		targetPlatform: "macos",
	});
	const plain = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
	mutate?.(plain);
	await writeFile(
		join(draftDirectory, "draft_info.json"),
		JSON.stringify(plain)
	);
	return draftDirectory;
}

describe("runSemanticDiffCase", () => {
	it("reports identical drafts and writes a path-free manifest", async () => {
		const left = await writeDraft({ name: "left" });
		const right = await writeDraft({ name: "right" });
		const manifest = await runSemanticDiffCase({
			leftDraftDirectory: left,
			rightDraftDirectory: right,
			outputDirectory: rootDirectory,
			nowIso: "2026-08-05T00:00:00.000Z",
		});
		expect(manifest.verdict).toBe("identical");
		expect(manifest.left.profileId).toBe("jianying-synthetic-plaintext-5.9");
		expect(manifest.left.files.length).toBeGreaterThan(0);
		for (const file of manifest.left.files) {
			expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
		}
		const written = await readFile(
			join(rootDirectory, SEMANTIC_DIFF_MANIFEST_FILE_NAME),
			"utf8"
		);
		expect(written).not.toContain(rootDirectory);
		expect(JSON.parse(written)).toEqual(JSON.parse(JSON.stringify(manifest)));
	});

	it("classifies sub-half-frame drift as tolerable and larger as breaking", async () => {
		const shift = ({
			amountUs,
		}: {
			amountUs: number;
		}): ((content: Record<string, unknown>) => void) => {
			return (content) => {
				const tracks = content.tracks as Array<{
					segments: Array<{ target_timerange: { start: number } }>;
				}>;
				tracks[0].segments[0].target_timerange.start += amountUs;
			};
		};
		const left = await writeDraft({ name: "left" });
		const tolerable = await runSemanticDiffCase({
			leftDraftDirectory: left,
			rightDraftDirectory: await writeDraft({
				name: "right-small",
				mutate: shift({ amountUs: 10_000 }),
			}),
		});
		// 10ms < half a frame at 30fps (16.666ms).
		expect(tolerable.verdict).toBe("tolerable");

		const breaking = await runSemanticDiffCase({
			leftDraftDirectory: left,
			rightDraftDirectory: await writeDraft({
				name: "right-big",
				mutate: shift({ amountUs: 400_000 }),
			}),
		});
		expect(breaking.verdict).toBe("breaking");
	});

	it("reports non-exact sides as not-comparable", async () => {
		const left = await writeDraft({ name: "left" });
		const foreign = join(rootDirectory, "foreign");
		await mkdir(foreign);
		await writeFile(join(foreign, "project.json"), "{}");
		const manifest = await runSemanticDiffCase({
			leftDraftDirectory: left,
			rightDraftDirectory: foreign,
		});
		expect(manifest.verdict).toBe("not-comparable");
		expect(manifest.notComparableReason).toContain("right side");
	});
});
