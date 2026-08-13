import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildJianyingDraft,
	JIANYING_11_3_BETA2_TOP_LEVEL_KEYS,
} from "@qcut/editor-core/jianying-draft";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImportPlanConsumedError } from "../import-plan-store.js";
import { enqueueDesktopImportFromGrants } from "../desktop-import-inbox-grants.js";
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
let metricsNowMs: number;
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

async function writeJianyingCompoundRoot({
	root,
}: {
	root: string;
}): Promise<void> {
	const durationUs = 3_000_000;
	const subdraftId = "compound-1";
	const mediaPath = join(root, "clip.mp4");
	await writeFile(mediaPath, "compound-media");
	await mkdir(join(root, "Timelines"));
	await writeFile(
		join(root, "Timelines", "project.json"),
		JSON.stringify({ main_timeline_id: "timeline-1", timelines: [] })
	);
	await writeFile(join(root, "draft_info.json"), Buffer.from([0xff, 0x00]));
	const subdraftRoot = join(root, "subdraft", subdraftId);
	await mkdir(subdraftRoot, { recursive: true });

	const innerDraft = {
		id: subdraftId,
		name: "Compound Clip 1",
		canvas_config: { width: 1280, height: 720 },
		duration: durationUs,
		fps: 30,
		tracks: [
			{
				id: "inner-track",
				type: "mixed",
				segments: [
					{
						id: "inner-segment",
						material_id: "inner-video",
						extra_material_refs: [],
						source_timerange: { start: 0, duration: durationUs },
						target_timerange: { start: 0, duration: durationUs },
						speed: 1,
					},
				],
			},
		],
		materials: {
			videos: [
				{
					id: "inner-video",
					type: "video",
					duration: durationUs,
					material_name: "clip.mp4",
					path: mediaPath,
				},
			],
		},
	};
	const content: Record<string, unknown> = Object.fromEntries(
		JIANYING_11_3_BETA2_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	Object.assign(content, {
		id: "outer-wrapper",
		name: "",
		canvas_config: { width: 0, height: 0 },
		duration: 0,
		fps: 30,
		version: 360_000,
		new_version: "183.0.0",
		platform: { app_id: 0, app_source: "", app_version: "" },
		last_modified_platform: {
			app_id: 3704,
			app_source: "lv",
			app_version: "11.3.0-beta2",
		},
		tracks: [
			{
				id: "outer-track",
				type: "mixed",
				segments: [
					{
						id: "outer-segment",
						material_id: "outer-video",
						extra_material_refs: ["compound-material"],
						source_timerange: { start: 0, duration: durationUs },
						target_timerange: { start: 0, duration: durationUs },
						speed: 1,
					},
				],
			},
		],
		materials: {
			drafts: [
				{
					id: "compound-material",
					draft: innerDraft,
					type: "combination",
				},
			],
			videos: [
				{
					id: "outer-video",
					type: "video",
					duration: durationUs,
					path: "",
				},
			],
		},
	});
	await writeFile(
		join(subdraftRoot, "draft_content.json"),
		JSON.stringify(content)
	);
}

beforeEach(async () => {
	draftRoot = await mkdtemp(join(tmpdir(), "qcut-session-test-"));
	planStoreRoot = await mkdtemp(join(tmpdir(), "qcut-session-store-test-"));
	metricsNowMs = 0;
	nowMs = 1_000_000;
	session = new JianyingDraftImportSession({
		buildIdentity: BUILD,
		metricsNow: () => {
			metricsNowMs += 1;
			return metricsNowMs;
		},
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
		expect(inspect.fileCount).toBe(3);
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
		expect(plan.cacheMetrics).toEqual({
			assetResolution: {
				schemaVersion: 1,
				fileProbeHits: 0,
				fileProbeMisses: 2,
				nameSearchHits: 0,
				nameSearchMisses: 1,
				evictions: 0,
				hashedBytes: 11,
			},
		});
		expect(plan.stageMetrics).toEqual({
			schemaVersion: 1,
			phase: "runtime-plan",
			measuredDurationMilliseconds: 9,
			stages: {
				"request-validation": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"source-discovery": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"snapshot-read": { durationMilliseconds: 1, invocationCount: 1 },
				"profile-detection": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"document-normalization": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"asset-resolution": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"timeline-mapping": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"bundle-validation": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
				"plan-persistence": {
					durationMilliseconds: 1,
					invocationCount: 1,
				},
			},
		});
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
	it("rebuilds an auto-selected compound plan from the requested root", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-jianying-session-root-"));
		try {
			await writeJianyingCompoundRoot({ root });
			const plan = await session.plan({ input: { draftPath: root } });
			expect(plan.inspect).toMatchObject({
				outcome: "exact",
				sourceScope: "compound-subdraft",
				selectedSubdraftId: "compound-1",
			});
			expect(plan.plan.warningFingerprints).toHaveLength(1);

			const commit = await session.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
				},
			});
			expect(commit.bundle.document.source.product).toBe("jianying");
			expect(commit.mediaPayloads).toHaveLength(1);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

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
		const mediaSha256 = createHash("sha256")
			.update("media-bytes")
			.digest("hex");
		expect(commit.bundle.document.resources).toEqual([
			expect.objectContaining({
				status: "resolved",
				sha256: mediaSha256,
				byteLength: 11,
			}),
		]);
		expect(commit.bundle.resourceStaging).toEqual([
			expect.objectContaining({
				status: "resolved",
				sha256: mediaSha256,
				byteLength: 11,
			}),
		]);
		expect(
			Buffer.from(commit.mediaPayloads[0].bytesBase64, "base64").toString()
		).toBe("media-bytes");
		expect(commit.mediaPayloads[0].mimeType).toBe("video/mp4");
		expect(commit.envelopeCapture?.envelope).toMatchObject({
			importId: plan.plan.planToken,
			profileId: "jianying-synthetic-plaintext-5.9",
			entries: [expect.objectContaining({ relativePath: "draft_info.json" })],
		});
		const envelopePayload = JSON.parse(
			Buffer.from(
				commit.envelopeCapture?.payloadBase64 ?? "",
				"base64"
			).toString()
		) as { entries: Array<{ relativePath: string }> };
		expect(envelopePayload.entries).toEqual([
			expect.objectContaining({ relativePath: "draft_info.json" }),
		]);

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

	it("returns path-free media grants and serves bounded chunks", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		const commit = await session.commitWithMediaGrants({
			input: {
				planToken: plan.plan.planToken,
				acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
			},
		});
		expect(commit.mediaGrants).toHaveLength(1);
		const [grant] = commit.mediaGrants;
		expect(grant).toMatchObject({
			schemaVersion: 1,
			resourceId: commit.bundle.resourceStaging[0].resourceId,
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			byteLength: 11,
		});
		const serialized = JSON.stringify(commit);
		expect(serialized).not.toContain(draftRoot);
		expect(serialized).not.toContain("bytesBase64");

		const first = await session.readMediaPayloadChunk({
			input: { grantToken: grant.grantToken, offset: 0, maxBytes: 5 },
		});
		const second = await session.readMediaPayloadChunk({
			input: { grantToken: grant.grantToken, offset: 5, maxBytes: 20 },
		});
		expect(
			Buffer.concat([
				Buffer.from(first.bytes),
				Buffer.from(second.bytes),
			]).toString()
		).toBe("media-bytes");
		expect(first.eof).toBe(false);
		expect(second.eof).toBe(true);
		expect(
			session.releaseMediaPayloadGrants({
				input: { grantTokens: [grant.grantToken] },
			})
		).toEqual({ releasedCount: 1 });
		await expect(
			session.readMediaPayloadChunk({
				input: { grantToken: grant.grantToken, offset: 0, maxBytes: 1 },
			})
		).rejects.toMatchObject({ code: "grant-not-found" });
	});

	it("invalidates granted media if the source changes before chunking", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		const commit = await session.commitWithMediaGrants({
			input: {
				planToken: plan.plan.planToken,
				acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
			},
		});
		const [grant] = commit.mediaGrants;
		await writeFile(join(draftRoot, "assets", "clip.mp4"), "other-bytes");

		await expect(
			session.readMediaPayloadChunk({
				input: { grantToken: grant.grantToken, offset: 0, maxBytes: 4 },
			})
		).rejects.toMatchObject({ code: "source-changed" });
	});

	it("reopens a private inbox entry as session-owned media grants", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		const commit = await session.commitWithMediaGrants({
			input: {
				planToken: plan.plan.planToken,
				acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
			},
		});
		const originalTokens = commit.mediaGrants.map(
			({ grantToken }) => grantToken
		);
		const entry = await enqueueDesktopImportFromGrants({
			inboxDirectory: planStoreRoot,
			commit,
			entryId: "session-inbox-entry",
			readChunk: (options) => session.readMediaPayloadChunk(options),
		});
		session.releaseMediaPayloadGrants({
			input: { grantTokens: originalTokens },
		});

		const reopened = await session.readPendingDesktopImport({
			entryId: entry.entryId,
			inboxDirectory: planStoreRoot,
		});
		const [grant] = reopened.mediaGrants;
		expect(grant.grantToken).not.toBe(originalTokens[0]);
		const chunk = await session.readMediaPayloadChunk({
			input: {
				grantToken: grant.grantToken,
				offset: 0,
				maxBytes: 1024,
			},
		});
		expect(Buffer.from(chunk.bytes).toString()).toBe("media-bytes");
		expect(chunk.eof).toBe(true);
		expect(
			session.releaseMediaPayloadGrants({
				input: { grantTokens: [grant.grantToken] },
			})
		).toEqual({ releasedCount: 1 });
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

	it("refuses to commit after resolved media bytes changed", async () => {
		const plan = await session.plan({ input: { draftPath: draftRoot } });
		await writeFile(
			join(draftRoot, "assets", "clip.mp4"),
			"changed-media-bytes"
		);
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
