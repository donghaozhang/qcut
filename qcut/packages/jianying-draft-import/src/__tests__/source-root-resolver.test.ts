import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverDraftDirectory } from "../discovery.js";

let projectRoot: string;

beforeEach(async () => {
	projectRoot = await realpath(
		await mkdtemp(join(tmpdir(), "qcut-jianying-root-"))
	);
});

afterEach(async () => {
	await rm(projectRoot, { recursive: true, force: true });
});

async function createMultiTimelineProject({
	activeContent,
	subdraftIds,
}: {
	activeContent?: Record<string, unknown>;
	subdraftIds: string[];
}): Promise<void> {
	await mkdir(join(projectRoot, "Timelines"));
	await writeFile(
		join(projectRoot, "Timelines", "project.json"),
		JSON.stringify({ main_timeline_id: "timeline-1", timelines: [] })
	);
	await writeFile(
		join(projectRoot, "draft_info.json"),
		Buffer.from([0xff, 0x00, 0x11])
	);
	await mkdir(join(projectRoot, "subdraft"));
	if (activeContent !== undefined) {
		await writeFile(
			join(projectRoot, "subdraft", "draft_content.json"),
			JSON.stringify(activeContent)
		);
	}
	await Promise.all(
		subdraftIds.map(async (subdraftId) => {
			const subdraftRoot = join(projectRoot, "subdraft", subdraftId);
			await mkdir(subdraftRoot);
			await writeFile(
				join(subdraftRoot, "draft_content.json"),
				JSON.stringify({ id: subdraftId, tracks: [], materials: {} })
			);
		})
	);
}

describe("Jianying source root resolution", () => {
	it("selects the sole plaintext compound subdraft from a root project", async () => {
		await createMultiTimelineProject({ subdraftIds: ["compound-1"] });

		const result = await discoverDraftDirectory({
			draftDirectory: projectRoot,
		});

		expect(result).toMatchObject({
			sourceScope: "compound-subdraft",
			subdraftCandidateCount: 1,
			selectedSubdraftId: "compound-1",
			hasContentFile: true,
		});
		expect(result.rootRealPath).toBe(
			join(projectRoot, "subdraft", "compound-1")
		);
		expect(result.files).toEqual([
			{
				relativePath: "draft_content.json",
				role: "content",
				byteLength: expect.any(Number),
			},
		]);
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "FEATURE_OPAQUE",
				severity: "warning",
				subjectId: "compound-1",
			}),
		]);
	});

	it("marks an explicitly selected compound subdraft with the same scope", async () => {
		await createMultiTimelineProject({ subdraftIds: ["compound-1"] });

		const result = await discoverDraftDirectory({
			draftDirectory: join(projectRoot, "subdraft", "compound-1"),
		});

		expect(result).toMatchObject({
			sourceScope: "compound-subdraft",
			subdraftCandidateCount: 1,
			selectedSubdraftId: "compound-1",
		});
		expect(result.issues).toEqual([]);
	});

	it("prefers the active compound content over its stale id-named copy", async () => {
		await createMultiTimelineProject({
			activeContent: { id: "active-wrapper", tracks: [], materials: {} },
			subdraftIds: ["compound-1"],
		});

		const result = await discoverDraftDirectory({
			draftDirectory: projectRoot,
		});

		expect(result).toMatchObject({
			rootRealPath: join(projectRoot, "subdraft"),
			sourceScope: "compound-subdraft",
			subdraftCandidateCount: 1,
			selectedSubdraftId: "compound-1",
			hasContentFile: true,
		});
		expect(result.files).toContainEqual({
			relativePath: "draft_content.json",
			role: "content",
			byteLength: expect.any(Number),
		});
	});

	it("does not guess when more than one compound subdraft exists", async () => {
		await createMultiTimelineProject({
			subdraftIds: ["compound-1", "compound-2"],
		});

		const result = await discoverDraftDirectory({
			draftDirectory: projectRoot,
		});

		expect(result.rootRealPath).toBe(projectRoot);
		expect(result).toMatchObject({
			sourceScope: "selected-directory",
			subdraftCandidateCount: 2,
			hasContentFile: true,
		});
		expect(result.selectedSubdraftId).toBeUndefined();
		expect(result.issues).toEqual([]);
	});

	it("rejects root and direct-subdraft reads while Jianying holds a lock", async () => {
		await createMultiTimelineProject({ subdraftIds: ["compound-1"] });
		await writeFile(join(projectRoot, ".locked"), "active");

		await expect(
			discoverDraftDirectory({ draftDirectory: projectRoot })
		).rejects.toThrow(/close the Jianying Professional draft/i);
		await expect(
			discoverDraftDirectory({
				draftDirectory: join(projectRoot, "subdraft", "compound-1"),
			})
		).rejects.toThrow(/close the Jianying Professional draft/i);
	});
});
