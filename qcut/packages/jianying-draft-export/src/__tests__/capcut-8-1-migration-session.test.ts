import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockedWriter = vi.hoisted(() => {
	const calls: unknown[] = [];
	return {
		calls,
		write: vi.fn((options: unknown) => {
			calls.push(options);
			return Promise.reject(new Error("observed migration writer options"));
		}),
	};
});

vi.mock("../capcut-8-1-migration-writer.js", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("../capcut-8-1-migration-writer.js")>();
	return {
		...original,
		writeTrustedCapCut81MigrationBundle: mockedWriter.write,
	};
});

import {
	CapCut81MigrationExportSession,
	CapCut81MigrationPlanConsumedError,
	CapCut81MigrationPlanExpiredError,
	CapCut81MigrationWarningAcceptanceError,
	StandaloneJianyingDraftCommitValidationError,
	StandaloneJianyingDraftRequestValidationError,
} from "../index.js";
import * as publicApi from "../index.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-capcut-session-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createSnapshot({
	name = "Immutable migration",
}: {
	name?: string;
} = {}): QCutDraftExportSnapshotV1 {
	return {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name,
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [],
	};
}

function createPlanInput({
	draftName = "CapCut trust boundary",
	snapshot = createSnapshot(),
}: {
	draftName?: string;
	snapshot?: QCutDraftExportSnapshotV1;
} = {}): {
	draftName: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: "macos";
} {
	return {
		draftName,
		snapshot,
		targetPlatform: "macos",
	};
}

afterEach(async () => {
	mockedWriter.calls.splice(0);
	mockedWriter.write.mockClear();
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("CapCut 8.1 migration session trust boundary", () => {
	it("exposes the session without exposing either direct migration writer name", () => {
		expect(publicApi.CapCut81MigrationExportSession).toBe(
			CapCut81MigrationExportSession
		);
		expect(publicApi).not.toHaveProperty("writeCapCut81MigrationBundle");
		expect(publicApi).not.toHaveProperty("writeTrustedCapCut81MigrationBundle");
	});

	it("rejects renderer-controlled output and FFprobe fields plus deep unknown keys", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new CapCut81MigrationExportSession({
			ffprobePath: "/trusted/qcut/ffprobe-8",
			outputParentDirectory,
		});

		for (const rendererField of [
			{ outputParentDirectory: "/renderer/output" },
			{ ffprobePath: "/renderer/ffprobe" },
		]) {
			await expect(
				session.plan({
					input: { ...createPlanInput(), ...rendererField },
				})
			).rejects.toMatchObject({
				issues: [{ path: "$" }],
				name: "StandaloneJianyingDraftRequestValidationError",
			});
		}

		const snapshot = createSnapshot() as QCutDraftExportSnapshotV1 & {
			project: QCutDraftExportSnapshotV1["project"] & { widht: number };
		};
		snapshot.project.widht = 1920;
		await expect(
			session.plan({ input: createPlanInput({ snapshot }) })
		).rejects.toMatchObject({
			issues: [{ path: "$.snapshot.project" }],
			name: "StandaloneJianyingDraftRequestValidationError",
		});
	});

	it("deeply clones the planned request and binds trusted output and FFprobe options", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const tamperedOutputParent = await createTemporaryDirectory();
		const snapshot = createSnapshot();
		const input = createPlanInput({
			draftName: "Original migration",
			snapshot,
		});
		const trustedFfprobePath = join(outputParentDirectory, "trusted-ffprobe-8");
		const session = new CapCut81MigrationExportSession({
			ffprobePath: trustedFfprobePath,
			ffprobeTimeoutMilliseconds: 4321,
			outputParentDirectory,
		});
		const plan = await session.plan({ input });

		input.draftName = "Tampered migration";
		snapshot.project.name = "Tampered project";
		await expect(
			session.commit({
				input: {
					ffprobePath: "/renderer/ffprobe",
					outputParentDirectory: tamperedOutputParent,
					planToken: plan.planToken,
					snapshot,
				},
			})
		).rejects.toBeInstanceOf(StandaloneJianyingDraftCommitValidationError);

		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toThrow("observed migration writer options");
		expect(mockedWriter.calls).toHaveLength(1);
		expect(mockedWriter.calls[0]).toMatchObject({
			draftName: "Original migration",
			ffprobePath: resolve(trustedFfprobePath),
			ffprobeTimeoutMilliseconds: 4321,
			outputParentDirectory: await realpath(outputParentDirectory),
			snapshot: {
				project: { name: "Immutable migration" },
			},
		});
		expect(
			(mockedWriter.calls[0] as { outputParentDirectory: string })
				.outputParentDirectory
		).not.toBe(await realpath(tamperedOutputParent));
	});

	it("consumes a token after the first writer attempt and rejects replay", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new CapCut81MigrationExportSession({
			ffprobePath: "/trusted/qcut/ffprobe-8",
			outputParentDirectory,
		});
		const plan = await session.plan({ input: createPlanInput() });

		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toThrow("observed migration writer options");
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(CapCut81MigrationPlanConsumedError);
		expect(mockedWriter.calls).toHaveLength(1);
	});

	it("requires the exact warning fingerprint set and consumes drifted commits", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const snapshot = createSnapshot();
		snapshot.tracks = [
			{
				elements: [],
				height: 96,
				id: "custom-height",
				name: "Custom height",
				type: "media",
			},
		];
		const session = new CapCut81MigrationExportSession({
			ffprobePath: "/trusted/qcut/ffprobe-8",
			outputParentDirectory,
		});
		const plan = await session.plan({
			input: createPlanInput({ snapshot }),
		});

		expect(plan.warningFingerprints.length).toBeGreaterThan(0);
		await expect(
			session.commit({
				input: {
					acceptedWarningFingerprints: [
						...plan.warningFingerprints,
						"renderer-warning-drift",
					],
					planToken: plan.planToken,
				},
			})
		).rejects.toBeInstanceOf(CapCut81MigrationWarningAcceptanceError);
		await expect(
			session.commit({
				input: {
					acceptedWarningFingerprints: plan.warningFingerprints,
					planToken: plan.planToken,
				},
			})
		).rejects.toBeInstanceOf(CapCut81MigrationPlanConsumedError);
		expect(mockedWriter.write).not.toHaveBeenCalled();

		const acceptedPlan = await session.plan({
			input: createPlanInput({ snapshot }),
		});
		await expect(
			session.commit({
				input: {
					acceptedWarningFingerprints: acceptedPlan.warningFingerprints,
					planToken: acceptedPlan.planToken,
				},
			})
		).rejects.toThrow("observed migration writer options");
		expect(mockedWriter.calls[0]).toMatchObject({
			acceptedWarningFingerprints: acceptedPlan.warningFingerprints,
		});
	});

	it("expires plans using the shared bounded TTL state machine", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		let nowUnixMilliseconds = 10_000;
		vi.spyOn(Date, "now").mockImplementation(() => nowUnixMilliseconds);
		const session = new CapCut81MigrationExportSession({
			ffprobePath: "/trusted/qcut/ffprobe-8",
			outputParentDirectory,
			planTtlMilliseconds: 5,
		});
		const plan = await session.plan({ input: createPlanInput() });

		nowUnixMilliseconds = 10_006;
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(CapCut81MigrationPlanExpiredError);
		expect(mockedWriter.write).not.toHaveBeenCalled();
	});

	it("rejects cyclic and accessor-bearing renderer input before reading it", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new CapCut81MigrationExportSession({
			ffprobePath: "/trusted/qcut/ffprobe-8",
			outputParentDirectory,
		});
		const cyclic: Record<string, unknown> = createPlanInput();
		cyclic.self = cyclic;
		await expect(session.plan({ input: cyclic })).rejects.toBeInstanceOf(
			StandaloneJianyingDraftRequestValidationError
		);

		const withGetter: Record<string, unknown> = createPlanInput();
		Object.defineProperty(withGetter, "draftName", {
			enumerable: true,
			get: () => "getter",
		});
		await expect(session.plan({ input: withGetter })).rejects.toBeInstanceOf(
			StandaloneJianyingDraftRequestValidationError
		);
	});
});
