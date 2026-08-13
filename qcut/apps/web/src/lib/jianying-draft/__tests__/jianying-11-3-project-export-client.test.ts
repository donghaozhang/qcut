import { createHash } from "node:crypto";
import type { JianyingProjectExportAPI } from "@/types/electron/api-jianying-project-export";
import type { TProject } from "@/types/project";
import {
	JIANYING_11_3_BETA2_APP_ID,
	JIANYING_11_3_BETA2_APP_SOURCE,
	JIANYING_11_3_BETA2_APP_VERSION,
	JIANYING_11_3_BETA2_NEW_VERSION,
	JIANYING_11_3_BETA2_PROFILE_ID,
	JIANYING_11_3_BETA2_SCHEMA_VERSION,
	JIANYING_11_3_BETA2_TOP_LEVEL_KEYS,
	JIANYING_11_3_BETA3_APP_VERSION,
	JIANYING_11_3_BETA3_PROFILE_ID,
	normalizeRawDraft,
	type Jianying113WritebackTimingSnapshot,
} from "@qcut/editor-core/jianying-draft";
import type { ForeignDraftEnvelopeV1 } from "@qcut/editor-core/draft-interop";
import { describe, expect, it, vi } from "vitest";
import { runJianying113ProjectExport } from "../jianying-11-3-project-export-client";

const TRACK_ID = "qcut-track-1";
const SEGMENT_ID = "qcut-segment-1";
const RESOURCE_ID = "qcut-resource-1";
const DURATION_US = 3_000_000;

function innerDraft(): Record<string, unknown> {
	return {
		id: "inner-draft",
		name: "Compound Clip 1",
		canvas_config: { width: 1280, height: 720 },
		duration: DURATION_US,
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
						source_timerange: { start: 0, duration: DURATION_US },
						target_timerange: { start: 0, duration: DURATION_US },
						speed: 1,
						unknown_inner_segment: { preserve: true },
					},
				],
			},
		],
		materials: {
			videos: [
				{
					id: "inner-video",
					type: "video",
					duration: DURATION_US,
					material_name: "calibration.mp4",
					path: "/private/calibration.mp4",
				},
			],
		},
		unknown_inner_top_level: { preserve: [1, 2, 3] },
	};
}

function sourceContent({
	appVersion = JIANYING_11_3_BETA2_APP_VERSION,
}: {
	appVersion?: string;
} = {}): Record<string, unknown> {
	const content = Object.fromEntries(
		JIANYING_11_3_BETA2_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	return Object.assign(content, {
		id: "outer-wrapper",
		name: "",
		canvas_config: { width: 0, height: 0 },
		duration: 0,
		fps: 30,
		version: JIANYING_11_3_BETA2_SCHEMA_VERSION,
		new_version: JIANYING_11_3_BETA2_NEW_VERSION,
		last_modified_platform: {
			app_id: JIANYING_11_3_BETA2_APP_ID,
			app_source: JIANYING_11_3_BETA2_APP_SOURCE,
			app_version: appVersion,
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
						source_timerange: { start: 0, duration: DURATION_US },
						target_timerange: { start: 0, duration: DURATION_US },
						speed: 1,
					},
				],
			},
		],
		materials: {
			drafts: [
				{
					id: "compound-material",
					draft: innerDraft(),
					draft_file_path: "##_subdraft_placeholder_##/draft_content.json",
					type: "combination",
				},
			],
			videos: [
				{
					id: "outer-video",
					type: "video",
					duration: DURATION_US,
					material_name: "Compound Clip 1",
					path: "",
				},
			],
		},
		extra_info: { preserve: "outer-sentinel" },
	});
}

function sourceBytes({ appVersion }: { appVersion?: string } = {}): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify(sourceContent({ appVersion }))
	);
}

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function fixture({
	profileId = JIANYING_11_3_BETA2_PROFILE_ID,
}: {
	profileId?: string;
} = {}): {
	bytes: Uint8Array;
	envelope: ForeignDraftEnvelopeV1;
	project: TProject;
} {
	const appVersion =
		profileId === JIANYING_11_3_BETA3_PROFILE_ID
			? JIANYING_11_3_BETA3_APP_VERSION
			: JIANYING_11_3_BETA2_APP_VERSION;
	const bytes = sourceBytes({ appVersion });
	const source = {
		product: "jianying" as const,
		profileId,
		platform: "macos" as const,
		files: [
			{
				relativePath: "draft_content.json",
				byteLength: bytes.byteLength,
				sha256: sha256({ bytes }),
				role: "content" as const,
				classification: "plaintext-json" as const,
			},
		],
	};
	const normalized = normalizeRawDraft({
		content: sourceContent({ appVersion }),
		contentFileName: "draft_content.json",
		source,
	});
	const envelope: ForeignDraftEnvelopeV1 = {
		schemaVersion: 1,
		importId: "import-jianying-compound",
		profileId,
		entries: [
			{
				relativePath: "draft_content.json",
				sha256: sha256({ bytes }),
				byteLength: bytes.byteLength,
				allowlistEntryId: "jianying-11.3-subdraft-content",
				storage: "raw",
			},
		],
		bindings: normalized.bindings,
		unknownSubtrees: [],
		dirtyDomains: [],
		acceptedDowngradeFingerprints: [],
		payloadRef: {
			keyVersion: 1,
			cipher: "os-keychain-wrapped",
			location: "envelopes/import-jianying-compound.bin",
		},
	};
	const timestamp = new Date("2026-08-13T00:00:00.000Z");
	const project: TProject = {
		id: "project-1",
		name: "Imported Jianying Project",
		thumbnail: "",
		createdAt: timestamp,
		updatedAt: timestamp,
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1280, height: 720 },
		canvasMode: "custom",
		fps: 30,
		draftInterop: {
			schemaVersion: 1,
			importId: envelope.importId,
			profileId,
			bundleDigest: "b".repeat(64),
			sourceFileSha256: [sha256({ bytes })],
			internalIdBySemanticId: {
				"inner-track": TRACK_ID,
				"inner-segment": SEGMENT_ID,
				"inner-video": RESOURCE_ID,
			},
			baselineDocument: normalized.document,
			writeback: {
				status: "unavailable",
				reason: "profile-not-writable",
			},
			envelope,
		},
	};
	return { bytes, envelope, project };
}

function snapshot({
	changed = false,
}: {
	changed?: boolean;
} = {}): Jianying113WritebackTimingSnapshot {
	return {
		tracks: [
			{
				id: TRACK_ID,
				name: "Video",
				type: "media",
				order: 0,
				isMain: true,
				elements: [
					{
						id: SEGMENT_ID,
						type: "media",
						mediaId: RESOURCE_ID,
						name: "calibration.mp4",
						duration: 3,
						startTime: changed ? 1 : 0,
						trimStart: changed ? 0.5 : 0,
						trimEnd: 0,
						playbackRate: 1,
					},
				],
			},
		],
		timelineDurationByElementId: { [SEGMENT_ID]: changed ? 2 : 3 },
	};
}

function bridge({
	profileId = JIANYING_11_3_BETA2_PROFILE_ID,
}: {
	profileId?: string;
} = {}): JianyingProjectExportAPI {
	return {
		chooseJianying113ProjectExportDirectory: vi.fn(async () => ({
			ok: true as const,
			value: {
				expiresAtUnixMilliseconds: Date.now() + 60_000,
				projectDirectory: "/selected/registered-project",
				selectionToken: "selection-1",
			},
		})),
		commitJianying113ProjectExport: vi.fn(async () => ({
			ok: true as const,
			value: {
				contentRelativePath: "subdraft/subdraft-1/draft_content.json",
				contentSha256: "c".repeat(64),
				profileId,
				subdraftId: "subdraft-1",
				transactionId: "transaction-1",
				warnings: [],
			},
		})),
	};
}

function envelopeReader({ bytes }: { bytes: Uint8Array }) {
	return vi.fn(async () => ({
		ok: true as const,
		value: {
			bytesByPath: new Map([["draft_content.json", bytes]]),
			keyVersion: 1,
		},
	}));
}

describe("Jianying 11.3 project export client", () => {
	it("writes unchanged beta 2 content into a selected registered project", async () => {
		const { bytes, project } = fixture();
		const api = bridge();

		await expect(
			runJianying113ProjectExport({
				project,
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).resolves.toMatchObject({
			ok: true,
			outcome: "exported",
			changed: false,
			patchCount: 0,
		});
		const request = vi.mocked(api.commitJianying113ProjectExport).mock
			.calls[0]![0];
		expect(Buffer.from(request.contentBase64, "base64")).toEqual(
			Buffer.from(bytes)
		);
		expect(request.profileId).toBe(JIANYING_11_3_BETA2_PROFILE_ID);
		expect(request).not.toHaveProperty("draftName");
	});

	it("writes an exact beta 3 import without migrating its profile", async () => {
		const { bytes, project } = fixture({
			profileId: JIANYING_11_3_BETA3_PROFILE_ID,
		});
		const api = bridge({ profileId: JIANYING_11_3_BETA3_PROFILE_ID });

		await expect(
			runJianying113ProjectExport({
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
				project,
				snapshot: snapshot(),
			})
		).resolves.toMatchObject({
			ok: true,
			outcome: "exported",
			projectDirectory: "/selected/registered-project",
			transactionId: "transaction-1",
		});
		const request = vi.mocked(api.commitJianying113ProjectExport).mock
			.calls[0]![0];
		expect(request.profileId).toBe(JIANYING_11_3_BETA3_PROFILE_ID);
	});

	it("patches only nested timing while preserving Jianying-owned fields", async () => {
		const { bytes, project } = fixture();
		const api = bridge();

		const result = await runJianying113ProjectExport({
			project,
			snapshot: snapshot({ changed: true }),
			deps: {
				getBridge: () => api,
				readVerifiedEnvelope: envelopeReader({ bytes }),
			},
		});

		expect(result).toMatchObject({
			ok: true,
			outcome: "exported",
			changed: true,
			patchCount: 4,
		});
		const request = vi.mocked(api.commitJianying113ProjectExport).mock
			.calls[0]![0];
		const output = JSON.parse(
			Buffer.from(request.contentBase64, "base64").toString("utf8")
		);
		expect(output.extra_info).toEqual({ preserve: "outer-sentinel" });
		const inner = output.materials.drafts[0].draft;
		expect(inner.unknown_inner_top_level).toEqual({ preserve: [1, 2, 3] });
		expect(inner.tracks[0].segments[0]).toMatchObject({
			unknown_inner_segment: { preserve: true },
			target_timerange: { start: 1_000_000, duration: 2_000_000 },
			source_timerange: { start: 500_000, duration: 2_000_000 },
		});
	});

	it("rejects non-Jianying profiles before reading the encrypted envelope", async () => {
		const { bytes, project } = fixture({
			profileId: "capcut-desktop-8.1-plaintext",
		});
		const readVerifiedEnvelope = envelopeReader({ bytes });

		expect(
			await runJianying113ProjectExport({
				project,
				snapshot: snapshot(),
				deps: { readVerifiedEnvelope },
			})
		).toMatchObject({ ok: false, reason: "project-not-imported" });
		expect(readVerifiedEnvelope).not.toHaveBeenCalled();
	});

	it("blocks structural additions before showing directory dialogs", async () => {
		const { bytes, project } = fixture();
		const api = bridge();
		const baseline = snapshot();
		const current: Jianying113WritebackTimingSnapshot = {
			...baseline,
			tracks: [
				...baseline.tracks,
				{
					id: "qcut-added-track",
					name: "Added",
					type: "media",
					elements: [
						{
							id: "qcut-added-segment",
							type: "media",
							mediaId: RESOURCE_ID,
							name: "added.mp4",
							duration: 1,
							startTime: 0,
							trimStart: 0,
							trimEnd: 0,
						},
					],
				},
			],
		};

		expect(
			await runJianying113ProjectExport({
				project,
				snapshot: current,
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).toMatchObject({
			ok: false,
			reason: "prepare-blocked",
			issues: [{ code: "WRITEBACK_TRACK_ADDED" }],
		});
		expect(api.chooseJianying113ProjectExportDirectory).not.toHaveBeenCalled();
	});

	it("does not commit if QCut changes while directories are selected", async () => {
		const { bytes, project } = fixture();
		const api = bridge();
		const verifySnapshotCurrent = vi.fn(async () => false);

		expect(
			await runJianying113ProjectExport({
				project,
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
					verifySnapshotCurrent,
				},
			})
		).toMatchObject({ ok: false, reason: "qcut-state-changed" });
		expect(api.commitJianying113ProjectExport).not.toHaveBeenCalled();
	});

	it("returns cancellation without committing", async () => {
		const { bytes, project } = fixture();
		const api = bridge();
		vi.mocked(
			api.chooseJianying113ProjectExportDirectory
		).mockResolvedValueOnce({ ok: true, value: null });

		expect(
			await runJianying113ProjectExport({
				project,
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).toEqual({ ok: true, outcome: "cancelled" });
		expect(api.commitJianying113ProjectExport).not.toHaveBeenCalled();
	});

	it("surfaces the main-process running-app guard", async () => {
		const { bytes, project } = fixture();
		const api = bridge();
		vi.mocked(api.commitJianying113ProjectExport).mockResolvedValueOnce({
			ok: false,
			error: {
				code: "app-running",
				message: "Quit Jianying Professional before exporting.",
				name: "JianyingAppRunningError",
			},
		});

		expect(
			await runJianying113ProjectExport({
				project,
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).toMatchObject({
			ok: false,
			reason: "export-failed",
			message: "Quit Jianying Professional before exporting.",
		});
	});
});
