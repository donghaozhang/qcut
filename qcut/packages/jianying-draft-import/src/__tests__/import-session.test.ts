import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildJianyingDraft } from "@qcut/editor-core/jianying-draft";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImportPlanConsumedError } from "../import-plan-store.js";
import {
	ImportSessionError,
	JianyingDraftImportSession,
} from "../import-session.js";

/**
 * JYI-012 acceptance (runtime side): the inspect/plan/commit lifecycle over
 * a real synthetic draft directory, with CAS tokens, warning acceptance,
 * and live-source re-verification.
 */

let draftRoot: string;
let planStoreRoot: string;
let session: JianyingDraftImportSession;
let nowMs: number;

const BUILD = { appVersion: "2026.08.04.1", interopSchemaVersion: 1 };

function createExportSnapshot(): QCutDraftExportSnapshotV1 {
	return {
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
			name: "Session Fixture",
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
	};
}

async function writeSyntheticDraft(): Promise<void> {
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: draftRoot,
		snapshot: createExportSnapshot(),
		targetPlatform: "macos",
	});
	await writeFile(join(draftRoot, "draft_info.json"), JSON.stringify(content));
	await writeFile(
		join(draftRoot, "draft_meta_info.json"),
		JSON.stringify({ draft_name: "Session Fixture" })
	);
	// The media file the resolver should find by name search.
	await mkdir(join(draftRoot, "assets"), { recursive: true });
	await writeFile(join(draftRoot, "assets", "clip.mp4"), "media-bytes");
}

beforeEach(async () => {
	draftRoot = await mkdtemp(join(tmpdir(), "qcut-session-test-"));
	planStoreRoot = await mkdtemp(join(tmpdir(), "qcut-session-store-test-"));
	nowMs = 1_000_000;
	session = new JianyingDraftImportSession({
		buildIdentity: BUILD,
		now: () => nowMs,
	});
	await writeSyntheticDraft();
});

afterEach(async () => {
	session.dispose();
	await Promise.all([
		rm(draftRoot, { recursive: true, force: true }),
		rm(planStoreRoot, { recursive: true, force: true }),
	]);
});

describe("inspect", () => {
	it("detects the synthetic 5.9 profile and reports semantics", async () => {
		const inspect = await session.inspect({
			input: { draftPath: draftRoot },
		});
		expect(inspect.outcome).toBe("exact");
		expect(inspect.profileId).toBe("jianying-synthetic-plaintext-5.9");
		expect(inspect.canWrite).toBe(false);
		expect(inspect.hasContentFile).toBe(true);
		expect(inspect.semantic?.trackCount).toBe(1);
		expect(inspect.semantic?.segmentCount).toBe(1);
		expect(inspect.semantic?.resourceCount).toBe(1);
		expect(inspect.semantic?.capabilityCounts.exact).toBe(1);
	});

	it("rejects malformed requests fail-closed", async () => {
		await expect(
			session.inspect({ input: { draftPath: "relative/path" } })
		).rejects.toThrow(ImportSessionError);
		await expect(
			session.inspect({ input: { draftPath: draftRoot, extra: true } })
		).rejects.toThrow(/unknown key|extra/);
	});

	it("reports unsupported layouts without normalizing", async () => {
		const foreignRoot = await mkdtemp(join(tmpdir(), "qcut-foreign-"));
		try {
			await writeFile(
				join(foreignRoot, "project.json"),
				JSON.stringify({ scenes: [] })
			);
			const inspect = await session.inspect({
				input: { draftPath: foreignRoot },
			});
			expect(inspect.outcome).toBe("unsupported");
			expect(inspect.semantic).toBeUndefined();
		} finally {
			await rm(foreignRoot, { recursive: true, force: true });
		}
	});
});

describe("plan", () => {
	it("produces a redacted plan, asset statuses, and no absolute paths", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		expect(plan.plan.canCommit).toBe(true);
		expect(plan.plan.planToken).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(Object.values(plan.assetStatuses)).toEqual(["resolved"]);
		const serialized = JSON.stringify(plan);
		expect(serialized).not.toContain(draftRoot);
		expect(serialized).not.toContain(tmpdir());
	});

	it("refuses to plan a non-exact profile", async () => {
		const foreignRoot = await mkdtemp(join(tmpdir(), "qcut-foreign-"));
		try {
			await writeFile(join(foreignRoot, "whatever.json"), "{}");
			await expect(
				session.plan({ input: { draftPath: foreignRoot } })
			).rejects.toMatchObject({ code: "profile-not-exact" });
		} finally {
			await rm(foreignRoot, { recursive: true, force: true });
		}
	});
});

describe("commit", () => {
	it("returns the bundle and media payloads exactly once", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		const commit = await session.commit({
			input: {
				planToken: plan.plan.planToken,
				acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
			},
		});
		expect(commit.bundle.planToken).toBe(plan.plan.planToken);
		expect(commit.mediaPayloads).toHaveLength(1);
		expect(
			Buffer.from(commit.mediaPayloads[0].bytesBase64, "base64").toString()
		).toBe("media-bytes");
		expect(commit.mediaPayloads[0].mimeType).toBe("video/mp4");

		// Replay is refused by the CAS store.
		await expect(
			session.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
				},
			})
		).rejects.toThrow(ImportPlanConsumedError);
	});

	it("demands exact warning acceptance", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		await expect(
			session.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: ["bogus-fingerprint"],
				},
			})
		).rejects.toMatchObject({ code: "warning-acceptance-mismatch" });
		await expect(
			session.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
				},
			})
		).resolves.toMatchObject({
			bundle: { planToken: plan.plan.planToken },
		});
	});

	it("rebuilds and commits a durable plan after session reopen", async () => {
		const first = await JianyingDraftImportSession.open({
			buildIdentity: BUILD,
			now: () => nowMs,
			storageDirectory: planStoreRoot,
		});
		const plan = await first.plan({ input: { draftPath: draftRoot } });
		first.dispose();

		const reopened = await JianyingDraftImportSession.open({
			buildIdentity: BUILD,
			now: () => nowMs,
			storageDirectory: planStoreRoot,
		});
		try {
			const commit = await reopened.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
				},
			});
			expect(commit.bundle.planToken).toBe(plan.plan.planToken);
			expect(commit.mediaPayloads).toHaveLength(1);
		} finally {
			reopened.dispose();
		}
	});

	it("refuses to commit after the source changed", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		await writeFile(join(draftRoot, "draft_info.json"), "{}");
		await expect(
			session.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
				},
			})
		).rejects.toMatchObject({ code: "source-changed" });
	});

	it("refuses expired plans", async () => {
		const shortSession = new JianyingDraftImportSession({
			buildIdentity: BUILD,
			planTtlMilliseconds: 500,
			now: () => nowMs,
		});
		try {
			const plan = await shortSession.plan({
				input: { draftPath: draftRoot },
			});
			nowMs += 501;
			await expect(
				shortSession.commit({
					input: {
						planToken: plan.plan.planToken,
						acceptedWarningFingerprints: [],
					},
				})
			).rejects.toThrow(/expired/i);
		} finally {
			shortSession.dispose();
		}
	});
});
