import { describe, expect, it, vi } from "vitest";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import type { ElectronAPI } from "@/types/electron/electron-api";
import {
	CapCutDraftSourceStagingError,
	cleanupCapCutDraftSourceGrants,
	stageCapCutDraftSources,
} from "../capcut-draft-source-staging";

type MediaImportAPI = NonNullable<ElectronAPI["mediaImport"]>;

function createSnapshot({
	count,
	sourceDirectory = "/outside",
}: {
	count: number;
	sourceDirectory?: string;
}): QCutDraftExportSnapshotV1 {
	return {
		media: Array.from({ length: count }, (_, index) => ({
			height: 100,
			id: `media-${index}`,
			name: `image-${index}.png`,
			sourcePath: `${sourceDirectory}/image-${index}.png`,
			type: "image" as const,
			width: 100,
		})),
		project: {
			backgroundColor: "#000000",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Project",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [],
	};
}

function createMediaImportAPI(): MediaImportAPI {
	return {
		checkSymlinkSupport: vi.fn(async () => true),
		getMediaPath: vi.fn(async () => "/project/media/imported"),
		import: vi.fn(async ({ mediaId, sourcePath }) => ({
			fileSize: 10,
			importMethod: "symlink" as const,
			originalPath: sourcePath,
			success: true,
			targetPath: `/project/media/imported/${mediaId}.png`,
		})),
		locateOriginal: vi.fn(async () => null),
		relinkMedia: vi.fn(async (_projectId, _mediaId, newSourcePath) => ({
			fileSize: 10,
			importMethod: "copy" as const,
			originalPath: newSourcePath,
			success: true,
			targetPath: "/project/media/imported/relinked.png",
		})),
		remove: vi.fn(async () => undefined),
		validateSymlink: vi.fn(async () => true),
	};
}

describe("CapCut draft source staging", () => {
	it("bounds concurrent imports and rewrites every staged source", async () => {
		const mediaImport = createMediaImportAPI();
		let activeImports = 0;
		let maxActiveImports = 0;
		vi.mocked(mediaImport.import).mockImplementation(
			async ({ mediaId, sourcePath }) => {
				activeImports += 1;
				maxActiveImports = Math.max(maxActiveImports, activeImports);
				await new Promise((resolve) => setTimeout(resolve, 2));
				activeImports -= 1;
				return {
					fileSize: 10,
					importMethod: "copy",
					originalPath: sourcePath,
					success: true,
					targetPath: `/project/media/imported/${mediaId}.png`,
				};
			}
		);

		const result = await stageCapCutDraftSources({
			mediaImport,
			projectId: "project-1",
			sessionId: "session",
			snapshot: createSnapshot({ count: 24 }),
		});

		expect(maxActiveImports).toBeGreaterThan(1);
		expect(maxActiveImports).toBeLessThanOrEqual(8);
		expect(result.grants).toHaveLength(24);
		expect(result.snapshot.media).toHaveLength(24);
		expect(mediaImport.import).toHaveBeenCalledWith(
			expect.objectContaining({ preferSymlink: false })
		);
		expect(
			vi
				.mocked(mediaImport.import)
				.mock.calls.every(([request]) => request.preferSymlink === false)
		).toBe(true);
		expect(
			result.snapshot.media.every(({ sourcePath }) =>
				sourcePath.startsWith("/project/media/imported/")
			)
		).toBe(true);
	});

	it("copies media already inside the project directory into isolated grants", async () => {
		const mediaImport = createMediaImportAPI();
		const snapshot = createSnapshot({
			count: 2,
			sourceDirectory: "/project/media/imported",
		});

		const result = await stageCapCutDraftSources({
			mediaImport,
			projectId: "project-1",
			sessionId: "session",
			snapshot,
		});

		expect(result.grants).toHaveLength(2);
		expect(mediaImport.import).toHaveBeenCalledTimes(2);
		expect(mediaImport.import).toHaveBeenCalledWith(
			expect.objectContaining({
				preferSymlink: false,
				sourcePath: "/project/media/imported/image-0.png",
			})
		);
	});

	it("falls back across source candidates and reports every attempted path", async () => {
		const mediaImport = createMediaImportAPI();
		vi.mocked(mediaImport.import)
			.mockResolvedValueOnce({
				error: "stale path",
				fileSize: 0,
				importMethod: "copy",
				originalPath: "/stale/image.png",
				success: false,
				targetPath: "",
			})
			.mockResolvedValueOnce({
				fileSize: 10,
				importMethod: "copy",
				originalPath: "/original/image.png",
				success: true,
				targetPath: "/project/media/imported/grant.png",
			});

		const result = await stageCapCutDraftSources({
			mediaImport,
			projectId: "project-1",
			sessionId: "session",
			sourceCandidatesByMediaId: {
				"media-0": ["/stale/image-0.png", "/original/image.png"],
			},
			snapshot: createSnapshot({
				count: 1,
				sourceDirectory: "/stale",
			}),
		});

		expect(mediaImport.import).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				preferSymlink: false,
				sourcePath: "/stale/image-0.png",
			})
		);
		expect(mediaImport.import).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				preferSymlink: false,
				sourcePath: "/original/image.png",
			})
		);
		expect(result.snapshot.media[0].sourcePath).toBe(
			"/project/media/imported/grant.png"
		);
	});

	it("returns successful grants on partial failure and reports cleanup failures", async () => {
		const mediaImport = createMediaImportAPI();
		vi.mocked(mediaImport.import)
			.mockResolvedValueOnce({
				fileSize: 10,
				importMethod: "copy",
				originalPath: "/outside/image-0.png",
				success: true,
				targetPath: "/project/media/imported/grant-0.png",
			})
			.mockResolvedValueOnce({
				error: "disk full",
				fileSize: 0,
				importMethod: "copy",
				originalPath: "/outside/image-1.png",
				success: false,
				targetPath: "",
			});

		let stagingError: CapCutDraftSourceStagingError | null = null;
		try {
			await stageCapCutDraftSources({
				mediaImport,
				projectId: "project-1",
				sessionId: "session",
				snapshot: createSnapshot({ count: 2 }),
			});
		} catch (error) {
			if (error instanceof CapCutDraftSourceStagingError) {
				stagingError = error;
			}
		}
		expect(stagingError).not.toBeNull();
		expect(stagingError?.grants).toHaveLength(1);
		expect(stagingError?.issues).toEqual([
			expect.objectContaining({
				code: "SOURCE_STAGING_FAILED",
				mediaId: "media-1",
				message: expect.stringContaining("/outside/image-1.png (disk full)"),
			}),
		]);

		vi.mocked(mediaImport.remove)
			.mockRejectedValueOnce(new Error("locked"))
			.mockResolvedValueOnce(undefined);
		const firstCleanupIssues = await cleanupCapCutDraftSourceGrants({
			grants: stagingError?.grants ?? [],
			mediaImport,
		});
		const retryCleanupIssues = await cleanupCapCutDraftSourceGrants({
			grants: stagingError?.grants ?? [],
			mediaImport,
		});

		expect(firstCleanupIssues).toEqual([
			expect.objectContaining({ code: "SOURCE_STAGING_CLEANUP_FAILED" }),
		]);
		expect(retryCleanupIssues).toEqual([]);
		expect(mediaImport.remove).toHaveBeenCalledTimes(2);
	});
});
