import { createHash } from "node:crypto";
import type { TProject } from "@/types/project";
import type { JianyingSameProfileWritebackAPI } from "@/types/electron/api-jianying-same-profile-writeback";
import {
	CAPCUT_8_1_PROFILE_ID,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { describe, expect, it, vi } from "vitest";
import { runCapCut81SameProfileWriteback } from "../capcut-same-profile-writeback-client";

const TRACK_ID = "qcut-track-1";
const SEGMENT_ID = "qcut-segment-1";
const RESOURCE_ID = "qcut-resource-1";

function sourceBytes(): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			id: "11111111-1111-4111-8111-111111111111",
			new_version: "179.0.0",
			unknown: { keep: true },
			tracks: [
				{
					segments: [
						{
							target_timerange: { start: 0, duration: 3_000_000 },
							source_timerange: { start: 0, duration: 3_000_000 },
						},
					],
				},
			],
		})
	);
}

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function project({
	bytes,
	writebackReady = true,
}: {
	bytes: Uint8Array;
	writebackReady?: boolean;
}): TProject {
	const timestamp = new Date("2026-08-04T00:00:00.000Z");
	const sourceSha256 = sha256({ bytes });
	return {
		id: "project-1",
		name: "Imported",
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
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "custom",
		draftInterop: {
			schemaVersion: 1,
			importId: "import-1",
			profileId: CAPCUT_8_1_PROFILE_ID,
			bundleDigest: "b".repeat(64),
			sourceFileSha256: [sourceSha256],
			internalIdBySemanticId: {
				"track-1": TRACK_ID,
				"segment-1": SEGMENT_ID,
				"resource-1": RESOURCE_ID,
			},
			baselineDocument: {
				schemaVersion: 1,
				timeUnit: "microseconds",
				source: {
					product: "capcut",
					profileId: CAPCUT_8_1_PROFILE_ID,
					platform: "macos",
					files: [
						{
							relativePath: "draft_info.json",
							byteLength: bytes.byteLength,
							sha256: sourceSha256,
							role: "content",
							classification: "plaintext-json",
						},
					],
				},
				project: {
					id: "draft-1",
					name: "Imported",
					width: 1920,
					height: 1080,
					fps: 30,
				},
				timelines: [
					{
						id: "draft-1",
						isRoot: true,
						tracks: [
							{
								id: "track-1",
								kind: "video",
								order: 0,
								capability: "exact",
								segments: [
									{
										id: "segment-1",
										kind: "video",
										resourceId: "resource-1",
										sourceRange: {
											startUs: 0,
											durationUs: 3_000_000,
										},
										targetRange: {
											startUs: 0,
											durationUs: 3_000_000,
										},
										speed: 1,
										capability: "exact",
										foreignRef: "segment-1",
									},
								],
							},
						],
					},
				],
				resources: [
					{
						id: "resource-1",
						kind: "video",
						status: "resolved",
						capability: "exact",
					},
				],
				links: [],
				issues: [],
			},
			writeback: writebackReady
				? { status: "ready" }
				: { status: "unavailable", reason: "profile-not-writable" },
			envelope: {
				schemaVersion: 1,
				importId: "import-1",
				profileId: CAPCUT_8_1_PROFILE_ID,
				entries: [
					{
						relativePath: "draft_info.json",
						sha256: sourceSha256,
						byteLength: bytes.byteLength,
						allowlistEntryId: "capcut-8.1-root-draft-info",
						storage: "raw",
					},
				],
				bindings: [
					{
						foreignRef: "segment-1",
						file: "draft_info.json",
						jsonPointer: "/tracks/0/segments/0",
						semanticId: "segment-1",
					},
				],
				unknownSubtrees: [],
				dirtyDomains: [],
				acceptedDowngradeFingerprints: [],
				payloadRef: {
					keyVersion: 1,
					cipher: "os-keychain-wrapped",
					location: "envelopes/import-1.bin",
				},
			},
		},
	};
}

function snapshot({
	changed = true,
}: {
	changed?: boolean;
} = {}): QCutDraftExportSnapshotV1 {
	return {
		schemaVersion: 1,
		project: {
			id: "project-1",
			name: "Imported",
			sceneId: "scene-1",
			width: 1920,
			height: 1080,
			fps: 30,
			backgroundColor: "transparent",
			backgroundType: "color",
		},
		tracks: [
			{
				id: TRACK_ID,
				name: "Video",
				type: "media",
				order: 0,
				elements: [
					{
						id: SEGMENT_ID,
						type: "media",
						mediaId: RESOURCE_ID,
						name: "clip.mp4",
						duration: 3,
						startTime: changed ? 1 : 0,
						trimStart: 0,
						trimEnd: 0,
						playbackRate: 1,
					},
				],
			},
		],
		media: [
			{
				id: RESOURCE_ID,
				name: "clip.mp4",
				sourcePath: "/private/clip.mp4",
				type: "video",
				duration: 3,
				width: 1920,
				height: 1080,
			},
		],
		timelineDurationByElementId: { [SEGMENT_ID]: 3 },
	};
}

function bridge(): JianyingSameProfileWritebackAPI {
	return {
		chooseCapCut81DraftDirectory: vi.fn(async () => ({
			ok: true as const,
			value: {
				draftDirectory: "/selected/draft",
				expiresAtUnixMilliseconds: Date.now() + 60_000,
				selectionToken: "selection-1",
			},
		})),
		commitCapCut81Writeback: vi.fn(async () => ({
			ok: true as const,
			value: {
				contentSha256: "c".repeat(64),
				mirrorRelativePaths: ["a", "b", "c", "d"] as [
					string,
					string,
					string,
					string,
				],
				replacedMirrorCount: 4 as const,
				timelineId: "timeline-1",
				transactionId: "transaction-1",
				warnings: [],
			},
		})),
		recoverCapCut81Writeback: vi.fn(async () => ({
			ok: true as const,
			value: { action: "none" as const, warnings: [] },
		})),
	};
}

function envelopeReader({ bytes }: { bytes: Uint8Array }) {
	return vi.fn(async () => ({
		ok: true as const,
		value: {
			bytesByPath: new Map([["draft_info.json", bytes]]),
			keyVersion: 1,
		},
	}));
}

describe("CapCut same-profile writeback client", () => {
	it("keeps the profile evidence gate closed", async () => {
		const bytes = sourceBytes();
		const readVerifiedEnvelope = envelopeReader({ bytes });

		expect(
			await runCapCut81SameProfileWriteback({
				project: project({ bytes, writebackReady: false }),
				snapshot: snapshot(),
				deps: { readVerifiedEnvelope },
			})
		).toMatchObject({ ok: false, reason: "writeback-not-ready" });
		expect(readVerifiedEnvelope).not.toHaveBeenCalled();
	});

	it("does not open a directory picker for an unchanged project", async () => {
		const bytes = sourceBytes();
		const api = bridge();

		expect(
			await runCapCut81SameProfileWriteback({
				project: project({ bytes }),
				snapshot: snapshot({ changed: false }),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).toEqual({ ok: true, outcome: "unchanged" });
		expect(api.chooseCapCut81DraftDirectory).not.toHaveBeenCalled();
	});

	it("verifies, prepares, selects, and commits changed content", async () => {
		const bytes = sourceBytes();
		const api = bridge();

		await expect(
			runCapCut81SameProfileWriteback({
				project: project({ bytes }),
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).resolves.toMatchObject({
			ok: true,
			outcome: "written",
			transactionId: "transaction-1",
		});
		expect(api.commitCapCut81Writeback).toHaveBeenCalledOnce();
		const request = vi.mocked(api.commitCapCut81Writeback).mock.calls[0]![0];
		const output = JSON.parse(
			Buffer.from(request.contentBase64, "base64").toString("utf8")
		);
		expect(output.unknown).toEqual({ keep: true });
		expect(output.tracks[0].segments[0].target_timerange.start).toBe(1_000_000);
		expect(request.expectedSourceSha256).toBe(sha256({ bytes }));
		expect(request.selectionToken).toBe("selection-1");
	});

	it("does not commit when the QCut snapshot changes during selection", async () => {
		const bytes = sourceBytes();
		const api = bridge();
		const verifySnapshotCurrent = vi.fn(async () => false);

		expect(
			await runCapCut81SameProfileWriteback({
				project: project({ bytes }),
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
					verifySnapshotCurrent,
				},
			})
		).toEqual({
			ok: false,
			reason: "qcut-state-changed",
			message:
				"The QCut project changed while the destination was selected. Review and retry the writeback.",
		});
		expect(verifySnapshotCurrent).toHaveBeenCalledOnce();
		expect(api.chooseCapCut81DraftDirectory).toHaveBeenCalledOnce();
		expect(api.commitCapCut81Writeback).not.toHaveBeenCalled();
	});

	it("returns the selection token when recovery may be required", async () => {
		const bytes = sourceBytes();
		const api = bridge();
		vi.mocked(api.commitCapCut81Writeback).mockResolvedValueOnce({
			ok: false,
			error: {
				code: "recovery-required",
				name: "CapCut81SameProfileWritebackError",
				message: "close CapCut and recover",
			},
		});

		expect(
			await runCapCut81SameProfileWriteback({
				project: project({ bytes }),
				snapshot: snapshot(),
				deps: {
					getBridge: () => api,
					readVerifiedEnvelope: envelopeReader({ bytes }),
				},
			})
		).toMatchObject({
			ok: false,
			reason: "writeback-failed",
			draftDirectory: "/selected/draft",
			selectionToken: "selection-1",
		});
	});

	it("stops before directory selection when structure changed", async () => {
		const bytes = sourceBytes();
		const api = bridge();
		const current = snapshot();
		current.tracks.push({
			id: "new-track",
			name: "New",
			type: "media",
			elements: [
				{
					id: "new-segment",
					type: "media",
					mediaId: RESOURCE_ID,
					name: "new.mp4",
					duration: 1,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		});

		expect(
			await runCapCut81SameProfileWriteback({
				project: project({ bytes }),
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
		expect(api.chooseCapCut81DraftDirectory).not.toHaveBeenCalled();
	});
});
