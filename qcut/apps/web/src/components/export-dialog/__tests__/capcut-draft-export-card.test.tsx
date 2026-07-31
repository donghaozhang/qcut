import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@/test/test-utils";
import type { CapCutDraftExportElectronAPI } from "@/hooks/export/use-capcut-draft-export";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	CapCut81MigrationCommitDto,
	CapCut81MigrationInstallDto,
	CapCut81MigrationPlanDto,
	JianyingDraftExportAPI,
} from "@/types/electron/api-jianying-draft-export";
import type { MediaImportResult } from "@/types/electron/media-import";
import type { TProject } from "@/types/project";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { CapCutDraftExportCard } from "../capcut-draft-export-card";

const createdAt = new Date("2026-07-31T00:00:00.000Z");

function createDeferred<Value>() {
	let resolvePromise: (value: Value) => void;
	const promise = new Promise<Value>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve: (value: Value) => resolvePromise(value),
	};
}

function createProject(): TProject {
	return {
		canvasMode: "preset",
		canvasSize: { height: 1080, width: 1920 },
		createdAt,
		currentSceneId: "scene-1",
		fps: 30,
		id: "project-1",
		name: "CapCut project",
		scenes: [
			{
				createdAt,
				id: "scene-1",
				isMain: true,
				name: "Main",
				updatedAt: createdAt,
			},
		],
		thumbnail: "",
		updatedAt: createdAt,
	};
}

function createTimelineFixture(): {
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
} {
	const element: MediaElement = {
		duration: 5,
		id: "element-1",
		mediaId: "media-1",
		name: "clip.mov",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
	return {
		mediaItems: [
			{
				duration: 5,
				file: new File([], "clip.mov"),
				height: 1080,
				id: "media-1",
				localPath: "/outside/clip.mov",
				name: "clip.mov",
				type: "video",
				width: 1920,
			},
		],
		tracks: [
			{
				elements: [element],
				id: "track-1",
				name: "Video",
				type: "media",
			},
		],
	};
}

function createTwoMediaFixture(): {
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
} {
	const fixture = createTimelineFixture();
	return {
		...fixture,
		mediaItems: [
			...fixture.mediaItems,
			{
				duration: 3,
				file: new File([], "unused.mov"),
				height: 1080,
				id: "media-2",
				localPath: "/outside/unused.mov",
				name: "unused.mov",
				type: "video",
				width: 1920,
			},
		],
	};
}

function createPlan(): CapCut81MigrationPlanDto {
	return {
		blockerFingerprints: [],
		canCommit: true,
		expiresAtUnixMilliseconds: Date.now() + 60_000,
		issueSetFingerprint: "issue-set",
		issues: [
			{
				code: "TEXT_STYLE_APPROXIMATED",
				elementId: "text-1",
				message: "A text style will be approximated.",
				severity: "warning",
				trackId: "track-1",
			},
			{
				code: "FILTER_APPROXIMATED",
				message: "A filter will be approximated.",
				severity: "warning",
			},
		],
		planToken: "plan-token",
		requestFingerprint: "request",
		warningFingerprints: ["warning-1", "warning-2"],
	};
}

function createCommitResult(): CapCut81MigrationCommitDto {
	return {
		assetCount: 1,
		completeMarkerPath: "/exports/bundle/QCUT_EXPORT_COMPLETE.json",
		contentSha256: "content-sha",
		draftDirectory: "/exports/bundle/draft",
		draftFolderName: "draft",
		draftStoreDirectory: "/exports/bundle/com.lveditor.draft",
		durability: "fsync-complete",
		durabilityWarnings: [],
		ffprobeVersion: {
			banner: "ffprobe version 8.1.2",
			major: 8,
			version: "8.1.2",
		},
		ids: {
			draftId: "draft-id",
			placeholderId: "placeholder-id",
			projectId: "project-id",
			timelineId: "timeline-id",
		},
		manifestPath: "/exports/bundle/manifest.json",
		outputDirectory: "/exports/bundle",
		timelineMaterialsSize: 42,
	};
}

function createInstallResult(): CapCut81MigrationInstallDto {
	return {
		contentMirrorCount: 1,
		draftDirectory: "/capcut/draft",
		draftFolderName: "draft",
		draftId: "draft-id",
		installedContentSha256: "installed-sha",
		rootMetaInfoBackupPath: "/capcut/root_meta_info.json.backup",
		rootMetaInfoPath: "/capcut/root_meta_info.json",
		targetDraftStoreDirectory: "/capcut/com.lveditor.draft",
		timelineId: "timeline-id",
	};
}

function createElectronAPI({
	commitResult = { ok: true as const, value: createCommitResult() },
	plan = createPlan(),
}: {
	commitResult?:
		| { ok: true; value: CapCut81MigrationCommitDto }
		| {
				error: {
					code: "plan-consumed";
					message: string;
					name: string;
				};
				ok: false;
		  };
	plan?: CapCut81MigrationPlanDto;
} = {}) {
	const planCapCut81Migration = vi.fn(
		async (
			_request: Parameters<JianyingDraftExportAPI["planCapCut81Migration"]>[0]
		) => ({
			ok: true as const,
			value: plan,
		})
	);
	const commitCapCut81Migration = vi.fn(
		async (
			_request: Parameters<JianyingDraftExportAPI["commitCapCut81Migration"]>[0]
		) => commitResult
	);
	const installCapCut81Migration = vi.fn(
		async (
			_request: Parameters<
				JianyingDraftExportAPI["installCapCut81Migration"]
			>[0]
		) => ({
			ok: true as const,
			value: createInstallResult(),
		})
	);
	const remove = vi.fn(async () => undefined);
	const showItemInFolder = vi.fn(async () => undefined);
	const electronAPI: CapCutDraftExportElectronAPI = {
		getFileInfo: vi.fn(async (filePath) => ({
			lastModified: new Date("2026-07-31T00:00:00.000Z"),
			name: filePath.split("/").at(-1) ?? "media",
			path: filePath,
			size: 10,
			type: "video/quicktime",
		})),
		getPathForFile: vi.fn(() => "/outside/clip.mov"),
		jianyingDraftExport: {
			commitCapCut81Migration,
			installCapCut81Migration,
			planCapCut81Migration,
		},
		mediaImport: {
			checkSymlinkSupport: vi.fn(async () => true),
			getMediaPath: vi.fn(
				async () => "/Documents/QCut/Projects/project-1/media/imported"
			),
			import: vi.fn(async () => ({
				fileSize: 10,
				importMethod: "symlink" as const,
				originalPath: "/outside/clip.mov",
				success: true,
				targetPath:
					"/Documents/QCut/Projects/project-1/media/imported/export-grant.mov",
			})),
			locateOriginal: vi.fn(async () => null),
			relinkMedia: vi.fn(async () => ({
				fileSize: 10,
				importMethod: "copy" as const,
				originalPath: "/outside/clip.mov",
				success: true,
				targetPath:
					"/Documents/QCut/Projects/project-1/media/imported/relinked.mov",
			})),
			remove,
			validateSymlink: vi.fn(async () => true),
		},
		platform: "darwin",
		shell: {
			openExternal: vi.fn(async () => undefined),
			showItemInFolder,
		},
	};
	return {
		commitCapCut81Migration,
		electronAPI,
		installCapCut81Migration,
		planCapCut81Migration,
		remove,
		showItemInFolder,
	};
}

describe("CapCutDraftExportCard", () => {
	it("does not offer an unverified Windows export or installation path", () => {
		const api = createElectronAPI();
		api.electronAPI.platform = "win32";
		render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={[]}
				project={createProject()}
				tracks={[]}
			/>
		);

		expect(
			screen.getByRole("button", { name: "Review draft export" })
		).toBeDisabled();
		expect(
			screen.getByText("CapCut draft export currently supports macOS.")
		).toBeInTheDocument();
		expect(api.planCapCut81Migration).not.toHaveBeenCalled();
	});

	it("stages sources, requires one warning acknowledgement, commits exact fingerprints, installs, and reveals", async () => {
		const fixture = createTimelineFixture();
		const api = createElectronAPI();
		render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={fixture.mediaItems}
				project={createProject()}
				tracks={fixture.tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("Warnings (2)");

		const planRequest = api.planCapCut81Migration.mock.calls[0]?.[0];
		expect(planRequest).toMatchObject({
			draftName: "CapCut project",
			snapshot: {
				media: [
					expect.objectContaining({
						sourcePath:
							"/Documents/QCut/Projects/project-1/media/imported/export-grant.mov",
					}),
				],
			},
			targetPlatform: "macos",
		});
		const commitButton = screen.getByTestId("capcut-draft-commit");
		expect(commitButton).toBeDisabled();

		fireEvent.click(screen.getByRole("checkbox"));
		expect(commitButton).toBeEnabled();
		fireEvent.click(commitButton);

		await screen.findByText("Draft bundle created");
		expect(
			screen.getByText(
				"Automatic installation is available only for this bundle in the current QCut session."
			)
		).toBeInTheDocument();
		expect(api.commitCapCut81Migration).toHaveBeenCalledWith({
			acceptedWarningFingerprints: ["warning-1", "warning-2"],
			planToken: "plan-token",
		});
		expect(api.remove).toHaveBeenCalledWith(
			"project-1",
			expect.stringMatching(/^qcut-capcut-export-/u)
		);

		fireEvent.click(screen.getByRole("button", { name: "Show output" }));
		await waitFor(() =>
			expect(api.showItemInFolder).toHaveBeenCalledWith("/exports/bundle")
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Install into CapCut" })
		);
		await screen.findByText("Installed into CapCut");
		expect(api.installCapCut81Migration).toHaveBeenCalledWith({
			outputDirectory: "/exports/bundle",
		});
	});

	it("cleans staged grants when the review is cancelled", async () => {
		const fixture = createTimelineFixture();
		const api = createElectronAPI({
			plan: { ...createPlan(), issues: [], warningFingerprints: [] },
		});
		render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={fixture.mediaItems}
				project={createProject()}
				tracks={fixture.tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("No compatibility issues were found.");
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(api.remove).toHaveBeenCalledOnce());
		expect(
			screen.getByRole("button", { name: "Review draft export" })
		).toBeInTheDocument();
	});

	it("reports cleanup failures and retries retained grants", async () => {
		const fixture = createTimelineFixture();
		const api = createElectronAPI({
			plan: { ...createPlan(), issues: [], warningFingerprints: [] },
		});
		api.remove
			.mockRejectedValueOnce(new Error("file is locked"))
			.mockResolvedValueOnce(undefined);
		render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={fixture.mediaItems}
				project={createProject()}
				tracks={fixture.tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("No compatibility issues were found.");
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await screen.findByText(
			"Some temporary CapCut export sources could not be removed."
		);
		expect(
			screen.getByText("SOURCE_STAGING_CLEANUP_FAILED")
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

		await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(2));
		expect(
			screen.getByRole("button", { name: "Review draft export" })
		).toBeInTheDocument();
	});

	it("shows every snapshot adapter issue and never sends an invalid plan", async () => {
		const api = createElectronAPI();
		const missingMediaTrack: TimelineTrack = {
			elements: [
				{
					duration: 5,
					id: "missing-element",
					mediaId: "missing-media",
					name: "Missing",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				},
			],
			id: "missing-track",
			name: "Missing",
			type: "media",
		};
		render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={[]}
				project={createProject()}
				tracks={[missingMediaTrack]}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("MISSING_MEDIA");
		expect(screen.getAllByText(/missing-media/u)).toHaveLength(2);
		expect(screen.getByText(/Element missing-element/u)).toBeInTheDocument();
		expect(api.planCapCut81Migration).not.toHaveBeenCalled();
	});

	it("defers staged-source cleanup until an in-flight commit settles", async () => {
		const fixture = createTimelineFixture();
		const api = createElectronAPI({
			plan: { ...createPlan(), issues: [], warningFingerprints: [] },
		});
		const deferredCommit =
			createDeferred<Awaited<ReturnType<typeof api.commitCapCut81Migration>>>();
		api.commitCapCut81Migration.mockImplementation(
			async () => deferredCommit.promise
		);
		const { unmount } = render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={fixture.mediaItems}
				project={createProject()}
				tracks={fixture.tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("No compatibility issues were found.");
		fireEvent.click(screen.getByTestId("capcut-draft-commit"));
		await waitFor(() =>
			expect(api.commitCapCut81Migration).toHaveBeenCalledOnce()
		);

		unmount();
		expect(api.remove).not.toHaveBeenCalled();

		deferredCommit.resolve({ ok: true, value: createCommitResult() });
		await waitFor(() => expect(api.remove).toHaveBeenCalledOnce());
	});

	it.each([
		"complete",
		"fail",
	] as const)("keeps a newer plan's staged copies when an older generation finishes with %s", async (olderGenerationOutcome) => {
		const initialFixture = createTwoMediaFixture();
		const updatedFixture = createTwoMediaFixture();
		const project = createProject();
		const api = createElectronAPI({
			plan: { ...createPlan(), issues: [], warningFingerprints: [] },
		});
		const olderImports = [
			createDeferred<MediaImportResult>(),
			createDeferred<MediaImportResult>(),
		] as const;
		const importMedia = vi.mocked(api.electronAPI.mediaImport!.import);
		importMedia.mockImplementation(async (request) => {
			const callIndex = importMedia.mock.calls.length - 1;
			const olderImport = olderImports[callIndex];
			if (olderImport) return olderImport.promise;
			return {
				fileSize: 10,
				importMethod: "copy",
				originalPath: request.sourcePath,
				success: true,
				targetPath: `/Documents/QCut/Projects/project-1/media/imported/${request.mediaId}.mov`,
			};
		});
		const { rerender } = render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={initialFixture.mediaItems}
				project={project}
				tracks={initialFixture.tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await waitFor(() => expect(importMedia).toHaveBeenCalledTimes(2));

		rerender(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={updatedFixture.mediaItems}
				project={project}
				tracks={updatedFixture.tracks}
			/>
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("No compatibility issues were found.");
		expect(importMedia).toHaveBeenCalledTimes(4);

		const olderGrantIds = importMedia.mock.calls
			.slice(0, 2)
			.map(([request]) => request.mediaId);
		const newerGrantIds = importMedia.mock.calls
			.slice(2, 4)
			.map(([request]) => request.mediaId);
		olderImports[0].resolve({
			fileSize: 10,
			importMethod: "copy",
			originalPath: "/outside/clip.mov",
			success: true,
			targetPath: `/Documents/QCut/Projects/project-1/media/imported/${olderGrantIds[0]}.mov`,
		});
		olderImports[1].resolve(
			olderGenerationOutcome === "complete"
				? {
						fileSize: 10,
						importMethod: "copy",
						originalPath: "/outside/unused.mov",
						success: true,
						targetPath: `/Documents/QCut/Projects/project-1/media/imported/${olderGrantIds[1]}.mov`,
					}
				: {
						error: "copy failed",
						fileSize: 0,
						importMethod: "copy",
						originalPath: "/outside/unused.mov",
						success: false,
						targetPath: "",
					}
		);

		await waitFor(() =>
			expect(api.remove).toHaveBeenCalledWith("project-1", olderGrantIds[0])
		);
		if (olderGenerationOutcome === "complete") {
			expect(api.remove).toHaveBeenCalledWith("project-1", olderGrantIds[1]);
		}
		for (const grantId of newerGrantIds) {
			expect(api.remove).not.toHaveBeenCalledWith("project-1", grantId);
		}
		expect(api.planCapCut81Migration).toHaveBeenCalledOnce();

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => {
			for (const grantId of newerGrantIds) {
				expect(api.remove).toHaveBeenCalledWith("project-1", grantId);
			}
		});
	});

	it("clears a failed commit plan and requires a fresh review", async () => {
		const fixture = createTimelineFixture();
		const api = createElectronAPI({
			commitResult: {
				error: {
					code: "plan-consumed",
					message: "The export review can no longer be used.",
					name: "PlanConsumedError",
				},
				ok: false,
			},
			plan: { ...createPlan(), issues: [], warningFingerprints: [] },
		});
		render(
			<CapCutDraftExportCard
				electronAPI={api.electronAPI}
				mediaItems={fixture.mediaItems}
				project={createProject()}
				tracks={fixture.tracks}
			/>
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Review draft export" })
		);
		await screen.findByText("No compatibility issues were found.");
		fireEvent.click(screen.getByTestId("capcut-draft-commit"));
		await screen.findByText("The export review can no longer be used.");
		expect(api.remove).toHaveBeenCalledOnce();

		fireEvent.click(screen.getByRole("button", { name: "Run a fresh review" }));
		await waitFor(() =>
			expect(api.planCapCut81Migration).toHaveBeenCalledTimes(2)
		);
		expect(api.commitCapCut81Migration).toHaveBeenCalledOnce();
	});
});
