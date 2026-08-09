import { mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	QCutDraftExportImageMedia,
	QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapCut81MigrationExportSession } from "../capcut-8-1-migration-session.js";
import {
	StandaloneJianyingDraftExportSession,
	StandaloneJianyingDraftPlanStateChangedError,
} from "../export-session.js";
import { cloneJsonValue, type JsonValue } from "../runtime-json.js";
import type { NormalizedStandaloneJianyingDraftPlanRequest } from "../runtime-validation.js";
import { validateSnapshot } from "../snapshot-runtime-validation.js";
import { TrustedJianyingDraftExportSessionCore } from "../trusted-export-session.js";

const temporaryDirectories: string[] = [];
const TRUSTED_FFPROBE_PATH = "/trusted/qcut/ffprobe-8";

function createEmptySnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name: "Runtime security",
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [],
	};
}

function createMediaSnapshot({
	sourcePath,
}: {
	sourcePath: string;
}): QCutDraftExportSnapshotV1 {
	const media: QCutDraftExportImageMedia = {
		height: 1,
		id: "image",
		name: "proof.png",
		sourcePath,
		type: "image",
		width: 1,
	};
	return {
		...createEmptySnapshot(),
		media: [media],
		project: {
			...createEmptySnapshot().project,
			height: 1,
			width: 1,
		},
		timelineDurationByElementId: { clip: 1 },
		tracks: [
			{
				elements: [
					{
						duration: 1,
						id: "clip",
						mediaId: media.id,
						name: media.name,
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				id: "track",
				name: "Track",
				type: "media",
			},
		],
	};
}

function createNormalizedRequest(): NormalizedStandaloneJianyingDraftPlanRequest {
	return {
		createdAtUnixSeconds: 1,
		draftName: "Reserved plan",
		mediaSourceIdentities: [],
		outputParentDirectory: tmpdir(),
		snapshot: createEmptySnapshot(),
		targetPlatform: "macos",
	};
}

function createGate(): { open: () => void; promise: Promise<void> } {
	let open = (): void => {
		throw new Error("Gate was opened before initialization.");
	};
	const promise = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { open, promise };
}

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-runtime-security-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("snapshot transition identity", () => {
	it("accepts persisted local transition identity", () => {
		const snapshot = createEmptySnapshot();
		snapshot.tracks = [
			{
				elements: [],
				id: "main",
				name: "Main",
				transitions: [
					{
						duration: 1,
						easing: "linear",
						engine: "jianying-local",
						fromElementId: "clip-a",
						id: "local-transition",
						packageHash: "a".repeat(64),
						presetId: "jianying-local-3d-space",
						toElementId: "clip-b",
						type: "dissolve",
					},
				],
				type: "media",
			},
		];

		expect(
			validateSnapshot({
				path: "$.snapshot",
				value: snapshot as unknown as JsonValue,
			})
		).toEqual(snapshot);
	});
});

describe("runtime request budgets", () => {
	it("rejects aggregate string data below the per-string limit", () => {
		const chunk = "x".repeat(4 * 1024 * 1024);

		expect(() =>
			cloneJsonValue({ value: [chunk, chunk, chunk, chunk, chunk] })
		).toThrow("total string characters");
	});

	it("caps media, tracks, and total track elements", () => {
		const mediaEntry: QCutDraftExportImageMedia = {
			height: 1,
			id: "image",
			name: "image",
			sourcePath: "/tmp/image.png",
			type: "image",
			width: 1,
		};
		const mediaHeavySnapshot = {
			...createEmptySnapshot(),
			media: Array.from({ length: 10_001 }, () => mediaEntry),
		};
		expect(() =>
			validateSnapshot({
				path: "$.snapshot",
				value: mediaHeavySnapshot as unknown as JsonValue,
			})
		).toThrow("Media exceeds 10000 entries");

		const trackEntry = {
			elements: [],
			id: "track",
			name: "Track",
			type: "media" as const,
		};
		const trackHeavySnapshot = {
			...createEmptySnapshot(),
			tracks: Array.from({ length: 1_001 }, () => trackEntry),
		};
		expect(() =>
			validateSnapshot({
				path: "$.snapshot",
				value: trackHeavySnapshot as unknown as JsonValue,
			})
		).toThrow("Tracks exceed 1000 entries");

		const element = {
			duration: 1,
			id: "clip",
			mediaId: "image",
			name: "Clip",
			startTime: 0,
			trimEnd: 0,
			trimStart: 0,
			type: "media" as const,
		};
		const elementHeavySnapshot = {
			...createEmptySnapshot(),
			tracks: [
				{
					...trackEntry,
					elements: Array.from({ length: 20_001 }, () => element),
				},
			],
		};
		expect(() =>
			validateSnapshot({
				path: "$.snapshot",
				value: elementHeavySnapshot as unknown as JsonValue,
			})
		).toThrow("Snapshot exceeds 20000 track elements");
	});
});

describe("trusted export session concurrency", () => {
	it("reserves stored-plan capacity before asynchronous normalization", async () => {
		const normalizeGate = createGate();
		const normalizePlanRequest = vi.fn(async () => {
			await normalizeGate.promise;
			return createNormalizedRequest();
		});
		const core = new TrustedJianyingDraftExportSessionCore({
			maxStoredPlans: 1,
			normalizePlanRequest,
			preflight: () => ({ issues: [] }),
			trustedBinding: {},
			write: async () => "written",
		});

		const firstPlan = core.plan({ input: {} });
		await expect(core.plan({ input: {} })).rejects.toThrow(
			"too many outstanding plans"
		);
		expect(normalizePlanRequest).toHaveBeenCalledTimes(1);

		normalizeGate.open();
		await expect(firstPlan).resolves.toMatchObject({ canCommit: true });
	});

	it("caps plan work already in flight", async () => {
		const normalizeGate = createGate();
		const core = new TrustedJianyingDraftExportSessionCore({
			maxConcurrentPlans: 2,
			maxStoredPlans: 8,
			normalizePlanRequest: async () => {
				await normalizeGate.promise;
				return createNormalizedRequest();
			},
			preflight: () => ({ issues: [] }),
			trustedBinding: {},
			write: async () => "written",
		});

		const firstPlan = core.plan({ input: {} });
		const secondPlan = core.plan({ input: {} });
		await expect(core.plan({ input: {} })).rejects.toThrow(
			"too many plan operations in flight"
		);

		normalizeGate.open();
		await Promise.all([firstPlan, secondPlan]);
	});

	it("releases a stored-plan reservation when normalization fails", async () => {
		let rejectNextNormalization = true;
		const core = new TrustedJianyingDraftExportSessionCore({
			maxStoredPlans: 1,
			normalizePlanRequest: async () => {
				if (rejectNextNormalization) {
					rejectNextNormalization = false;
					throw new Error("normalization failed");
				}
				return createNormalizedRequest();
			},
			preflight: () => ({ issues: [] }),
			trustedBinding: {},
			write: async () => "written",
		});

		await expect(core.plan({ input: {} })).rejects.toThrow(
			"normalization failed"
		);
		await expect(core.plan({ input: {} })).resolves.toMatchObject({
			canCommit: true,
		});
	});

	it("limits concurrent commits without consuming the rejected plan", async () => {
		const writeGate = createGate();
		const write = vi.fn(async () => {
			await writeGate.promise;
			return "written";
		});
		const core = new TrustedJianyingDraftExportSessionCore({
			maxConcurrentCommits: 1,
			normalizePlanRequest: async () => createNormalizedRequest(),
			preflight: () => ({ issues: [] }),
			trustedBinding: {},
			write,
		});
		const firstPlan = await core.plan({ input: { id: "first" } });
		const secondPlan = await core.plan({ input: { id: "second" } });

		const firstCommit = core.commit({
			input: { planToken: firstPlan.planToken },
		});
		await vi.waitFor(() => {
			expect(write).toHaveBeenCalledTimes(1);
		});
		await expect(
			core.commit({ input: { planToken: secondPlan.planToken } })
		).rejects.toThrow("too many commit operations in flight");

		writeGate.open();
		await expect(firstCommit).resolves.toBe("written");
		await expect(
			core.commit({ input: { planToken: secondPlan.planToken } })
		).resolves.toBe("written");
	});

	it("releases commit capacity when a writer fails", async () => {
		let rejectNextWrite = true;
		const core = new TrustedJianyingDraftExportSessionCore({
			maxConcurrentCommits: 1,
			normalizePlanRequest: async () => createNormalizedRequest(),
			preflight: () => ({ issues: [] }),
			trustedBinding: {},
			write: async () => {
				if (rejectNextWrite) {
					rejectNextWrite = false;
					throw new Error("write failed");
				}
				return "written";
			},
		});
		const firstPlan = await core.plan({ input: { id: "first" } });
		const secondPlan = await core.plan({ input: { id: "second" } });

		await expect(
			core.commit({ input: { planToken: firstPlan.planToken } })
		).rejects.toThrow("write failed");
		await expect(
			core.commit({ input: { planToken: secondPlan.planToken } })
		).resolves.toBe("written");
	});
});

describe("planned media identity", () => {
	it("rejects a same-path source replacement before commit", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const sourcePath = join(outputParentDirectory, "proof.png");
		const replacedPath = join(outputParentDirectory, "proof.original.png");
		await writeFile(sourcePath, "same-size-proof");
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const plan = await session.plan({
			input: {
				draftName: "Source replacement",
				outputParentDirectory,
				snapshot: createMediaSnapshot({ sourcePath }),
				targetPlatform: "macos",
			},
		});

		await rename(sourcePath, replacedPath);
		await writeFile(sourcePath, "same-size-proof");

		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(StandaloneJianyingDraftPlanStateChangedError);
	});

	it("rejects an in-place source mutation before commit", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const sourcePath = join(outputParentDirectory, "proof.png");
		await writeFile(sourcePath, "original");
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const plan = await session.plan({
			input: {
				draftName: "Source mutation",
				outputParentDirectory,
				snapshot: createMediaSnapshot({ sourcePath }),
				targetPlatform: "macos",
			},
		});

		await writeFile(sourcePath, "mutated-source");

		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(StandaloneJianyingDraftPlanStateChangedError);
	});
});

describe("CapCut trusted media root", () => {
	it("rejects paths that escape the root while allowing an in-root symlink", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const projectDirectory = await createTemporaryDirectory();
		const externalDirectory = await createTemporaryDirectory();
		const externalSourcePath = join(externalDirectory, "external.png");
		const internalSourcePath = join(projectDirectory, "internal.png");
		const internalLinkedSourcePath = join(
			projectDirectory,
			"internal-linked.png"
		);
		const linkedSourcePath = join(projectDirectory, "linked.png");
		await writeFile(externalSourcePath, "external-source");
		await writeFile(internalSourcePath, "internal-source");
		await symlink(internalSourcePath, internalLinkedSourcePath);
		await symlink(externalSourcePath, linkedSourcePath);
		const session = new CapCut81MigrationExportSession({
			allowedSourceRootDirectory: projectDirectory,
			ffprobePath: TRUSTED_FFPROBE_PATH,
			outputParentDirectory,
		});

		await expect(
			session.plan({
				input: {
					draftName: "Outside source",
					snapshot: createMediaSnapshot({
						sourcePath: externalSourcePath,
					}),
					targetPlatform: "macos",
				},
			})
		).rejects.toMatchObject({
			issues: [
				{
					message: "Media source is outside the trusted project root.",
					path: "$.snapshot.media[0].sourcePath",
				},
			],
			name: "StandaloneJianyingDraftRequestValidationError",
		});

		await expect(
			session.plan({
				input: {
					draftName: "Linked source",
					snapshot: createMediaSnapshot({
						sourcePath: linkedSourcePath,
					}),
					targetPlatform: "macos",
				},
			})
		).rejects.toMatchObject({
			issues: [
				{
					message: "Media source resolves outside the trusted project root.",
					path: "$.snapshot.media[0].sourcePath",
				},
			],
			name: "StandaloneJianyingDraftRequestValidationError",
		});

		await expect(
			session.plan({
				input: {
					draftName: "Internal linked source",
					snapshot: createMediaSnapshot({
						sourcePath: internalLinkedSourcePath,
					}),
					targetPlatform: "macos",
				},
			})
		).resolves.toMatchObject({ canCommit: true });
	});

	it("keeps the trusted source root out of renderer plan input", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const projectDirectory = await createTemporaryDirectory();
		expect(
			() =>
				new CapCut81MigrationExportSession({
					allowedSourceRootDirectory: "relative-projects",
					ffprobePath: TRUSTED_FFPROBE_PATH,
					outputParentDirectory,
				})
		).toThrow("allowedSourceRootDirectory must be absolute");
		const session = new CapCut81MigrationExportSession({
			allowedSourceRootDirectory: projectDirectory,
			ffprobePath: TRUSTED_FFPROBE_PATH,
			outputParentDirectory,
		});

		await expect(
			session.plan({
				input: {
					allowedSourceRootDirectory: projectDirectory,
					draftName: "Renderer root override",
					snapshot: createEmptySnapshot(),
					targetPlatform: "macos",
				},
			})
		).rejects.toMatchObject({
			issues: [{ path: "$" }],
			name: "StandaloneJianyingDraftRequestValidationError",
		});
	});
});
