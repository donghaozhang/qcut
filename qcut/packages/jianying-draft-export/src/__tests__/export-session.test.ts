import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	QCutDraftExportImageMedia,
	QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	StandaloneJianyingDraftCommitValidationError,
	StandaloneJianyingDraftExportSession,
	StandaloneJianyingDraftPlanBlockedError,
	StandaloneJianyingDraftPlanConsumedError,
	StandaloneJianyingDraftPlanExpiredError,
	StandaloneJianyingDraftRequestValidationError,
	StandaloneJianyingDraftWarningAcceptanceError,
} from "../index.js";

const temporaryDirectories: string[] = [];
const TRUSTED_FFPROBE_PATH = "/trusted/qcut/ffprobe-8";

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-export-session-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createEmptySnapshot({
	name = "Immutable plan",
	width = 1920,
}: {
	name?: string;
	width?: number;
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
			width,
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
		...createEmptySnapshot({ width: 1 }),
		media: [media],
		project: {
			...createEmptySnapshot({ width: 1 }).project,
			height: 1,
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

function createPlanInput({
	draftName = "Trust boundary",
	outputParentDirectory,
	snapshot = createEmptySnapshot(),
}: {
	draftName?: string;
	outputParentDirectory: string;
	snapshot?: QCutDraftExportSnapshotV1;
}): {
	draftName: string;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: "macos";
} {
	return {
		draftName,
		outputParentDirectory,
		snapshot,
		targetPlatform: "macos",
	};
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("standalone JianYing export trust boundary", () => {
	it("requires an absolute main-owned FFprobe path", () => {
		expect(() =>
			Reflect.construct(StandaloneJianyingDraftExportSession, [])
		).toThrow("ffprobePath must not be empty");
		expect(
			() =>
				new StandaloneJianyingDraftExportSession({
					ffprobePath: "ffprobe",
				})
		).toThrow("ffprobePath must be absolute");
	});

	it("binds an immutable normalized request and rejects replacement commit data", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const tamperedOutputParent = await createTemporaryDirectory();
		const snapshot = createEmptySnapshot();
		const input = createPlanInput({
			draftName: "Original draft",
			outputParentDirectory,
			snapshot,
		});
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const plan = await session.plan({ input });

		expect(plan.planToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(plan.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(plan.issueSetFingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(plan.canCommit).toBe(true);

		input.draftName = "Tampered draft";
		input.outputParentDirectory = tamperedOutputParent;
		snapshot.project.name = "Tampered project";
		await expect(
			session.commit({
				input: {
					outputParentDirectory: tamperedOutputParent,
					planToken: plan.planToken,
					snapshot,
				},
			})
		).rejects.toBeInstanceOf(StandaloneJianyingDraftCommitValidationError);

		const result = await session.commit({
			input: { planToken: plan.planToken },
		});
		expect(
			result.outputDirectory.startsWith(await realpath(outputParentDirectory))
		).toBe(true);
		expect(
			result.outputDirectory.startsWith(await realpath(tamperedOutputParent))
		).toBe(false);
		expect(result.buildResult.content.name).toBe("Immutable plan");
		expect(JSON.parse(await readFile(result.contentPath, "utf8")).name).toBe(
			"Immutable plan"
		);
	});

	it("makes plans single-use even after a successful commit", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const plan = await session.plan({
			input: createPlanInput({ outputParentDirectory }),
		});

		await session.commit({ input: { planToken: plan.planToken } });
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(StandaloneJianyingDraftPlanConsumedError);
	});

	it("requires exact planned warning confirmation and consumes failed commits", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const snapshot = createEmptySnapshot();
		snapshot.tracks = [
			{
				elements: [],
				height: 96,
				id: "empty-custom-height",
				name: "Custom height",
				type: "media",
			},
		];
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const plan = await session.plan({
			input: createPlanInput({ outputParentDirectory, snapshot }),
		});

		expect(plan.warningFingerprints.length).toBeGreaterThan(0);
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(StandaloneJianyingDraftWarningAcceptanceError);
		await expect(
			session.commit({
				input: {
					acceptedWarningFingerprints: plan.warningFingerprints,
					planToken: plan.planToken,
				},
			})
		).rejects.toBeInstanceOf(StandaloneJianyingDraftPlanConsumedError);

		const confirmedPlan = await session.plan({
			input: createPlanInput({ outputParentDirectory, snapshot }),
		});
		const result = await session.commit({
			input: {
				acceptedWarningFingerprints: confirmedPlan.warningFingerprints,
				planToken: confirmedPlan.planToken,
			},
		});
		expect(result.buildResult.canWrite).toBe(true);
	});

	it("expires plans according to the configured TTL", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		let nowUnixMilliseconds = 10_000;
		vi.spyOn(Date, "now").mockImplementation(() => nowUnixMilliseconds);
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
			planTtlMilliseconds: 5,
		});
		const plan = await session.plan({
			input: createPlanInput({ outputParentDirectory }),
		});

		expect(plan.expiresAtUnixMilliseconds).toBe(10_005);
		nowUnixMilliseconds = 10_006;
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(StandaloneJianyingDraftPlanExpiredError);
	});

	it("binds blockers and refuses to commit a blocked plan", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const plan = await session.plan({
			input: createPlanInput({
				outputParentDirectory,
				snapshot: createEmptySnapshot({ width: 0 }),
			}),
		});

		expect(plan.canCommit).toBe(false);
		expect(plan.blockerFingerprints.length).toBeGreaterThan(0);
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toBeInstanceOf(StandaloneJianyingDraftPlanBlockedError);
	});

	it("deeply rejects malformed nested snapshot state", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const sourcePath = join(outputParentDirectory, "proof.png");
		await writeFile(sourcePath, "not probed during planning");
		const snapshot = createMediaSnapshot({ sourcePath });
		const element = snapshot.tracks[0]?.elements[0];
		if (!element || element.type !== "media") {
			throw new Error("Test fixture did not create a media element.");
		}
		Object.assign(element, { audio: { enabled: true } });
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});

		await expect(
			session.plan({
				input: createPlanInput({ outputParentDirectory, snapshot }),
			})
		).rejects.toMatchObject({
			name: "StandaloneJianyingDraftRequestValidationError",
			issues: [
				{
					path: "$.snapshot.tracks[0].elements[0].audio.panEnabled",
				},
			],
		});
	});

	it("rejects cyclic and accessor-bearing input before reading it", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const cyclic: Record<string, unknown> = createPlanInput({
			outputParentDirectory,
		});
		cyclic.self = cyclic;
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		await expect(session.plan({ input: cyclic })).rejects.toBeInstanceOf(
			StandaloneJianyingDraftRequestValidationError
		);

		const withGetter: Record<string, unknown> = createPlanInput({
			outputParentDirectory,
		});
		Object.defineProperty(withGetter, "draftName", {
			enumerable: true,
			get: () => "getter",
		});
		await expect(session.plan({ input: withGetter })).rejects.toBeInstanceOf(
			StandaloneJianyingDraftRequestValidationError
		);
	});

	it("generates independent unguessable tokens for equivalent requests", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		const first = await session.plan({
			input: createPlanInput({ outputParentDirectory }),
		});
		const second = await session.plan({
			input: createPlanInput({ outputParentDirectory }),
		});

		expect(first.planToken).not.toBe(second.planToken);
		expect(first.requestFingerprint).toBe(second.requestFingerprint);
	});

	it("keeps FFprobe selection on the trusted session side", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});
		await expect(
			session.plan({
				input: {
					...createPlanInput({ outputParentDirectory }),
					ffprobePath: "/renderer-controlled/ffprobe",
				},
			})
		).rejects.toMatchObject({
			issues: [{ path: "$" }],
			name: "StandaloneJianyingDraftRequestValidationError",
		});

		const plan = await session.plan({
			input: createPlanInput({ outputParentDirectory }),
		});
		expect(plan.canCommit).toBe(true);
	});
});
