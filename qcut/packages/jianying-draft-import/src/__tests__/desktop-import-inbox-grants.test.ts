import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildJianyingDraft,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	enqueueDesktopImportFromGrants,
	readDesktopImportWithGrants,
} from "../desktop-import-inbox-grants.js";
import {
	DesktopImportInboxMalformedError,
	listDesktopImports,
} from "../desktop-import-inbox.js";
import { JianyingDraftImportSession } from "../import-session.js";
import {
	MediaPayloadGrantStore,
	type MediaPayloadGrantDto,
} from "../media-payload-grant-store.js";
import { MAX_MEDIA_PAYLOAD_CHUNK_BYTES } from "../media-payload-reader.js";

const BUILD = { appVersion: "2026.08.05.1", interopSchemaVersion: 1 };
const NOW = 1_000_000;

let draftRoot: string;
let inboxDirectory: string;
let session: JianyingDraftImportSession;

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
			name: "Grant Inbox Fixture",
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

async function writeSyntheticDraft({
	mediaBytes,
}: {
	mediaBytes: Uint8Array;
}): Promise<void> {
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: draftRoot,
		snapshot: createExportSnapshot(),
		targetPlatform: "macos",
	});
	await Promise.all([
		writeFile(join(draftRoot, "draft_info.json"), JSON.stringify(content)),
		writeFile(
			join(draftRoot, "draft_meta_info.json"),
			JSON.stringify({ draft_name: "Grant Inbox Fixture" })
		),
		mkdir(join(draftRoot, "assets"), { recursive: true }),
	]);
	await writeFile(join(draftRoot, "assets", "clip.mp4"), mediaBytes);
}

async function createGrantedCommit({
	mediaBytes = new TextEncoder().encode("media-bytes"),
}: {
	mediaBytes?: Uint8Array;
} = {}) {
	await writeSyntheticDraft({ mediaBytes });
	const plan = await session.plan({ input: { draftPath: draftRoot } });
	return session.commitWithMediaGrants({
		input: {
			planToken: plan.plan.planToken,
			acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
		},
	});
}

beforeEach(async () => {
	draftRoot = await mkdtemp(join(tmpdir(), "qcut-inbox-grant-draft-"));
	inboxDirectory = await mkdtemp(join(tmpdir(), "qcut-inbox-grant-store-"));
	session = new JianyingDraftImportSession({
		buildIdentity: BUILD,
		now: () => NOW,
	});
});

afterEach(async () => {
	session.dispose();
	await Promise.all([
		rm(draftRoot, { recursive: true, force: true }),
		rm(inboxDirectory, { recursive: true, force: true }),
	]);
});

describe("grant-backed desktop import inbox", () => {
	it("streams a live grant into the inbox and reopens it as fresh grants", async () => {
		const commit = await createGrantedCommit();
		const summary = await enqueueDesktopImportFromGrants({
			inboxDirectory,
			commit,
			readChunk: (options) => session.readMediaPayloadChunk(options),
			entryId: "entry-1",
			nowUnixMilliseconds: NOW,
		});
		expect(summary).toMatchObject({
			entryId: "entry-1",
			projectName: "Grant Inbox Fixture",
			mediaCount: 1,
		});
		expect(await listDesktopImports({ inboxDirectory })).toEqual([summary]);
		expect(
			await readFile(join(inboxDirectory, "entry-1", "media-0.bin"), "utf8")
		).toBe("media-bytes");
		const manifestText = await readFile(
			join(inboxDirectory, "entry-1", "manifest.v1.json"),
			"utf8"
		);
		expect(manifestText).not.toContain("grantToken");
		expect(manifestText).not.toContain(draftRoot);

		const inboxGrantStore = new MediaPayloadGrantStore();
		try {
			const reopened = await readDesktopImportWithGrants({
				inboxDirectory,
				entryId: "entry-1",
				grantStore: inboxGrantStore,
			});
			expect(reopened.mediaGrants).toHaveLength(1);
			const [grant] = reopened.mediaGrants;
			const chunk = await inboxGrantStore.readChunk({
				input: {
					grantToken: grant.grantToken,
					offset: 0,
					maxBytes: 1024,
				},
			});
			expect(new TextDecoder().decode(chunk.bytes)).toBe("media-bytes");
			expect(chunk.eof).toBe(true);
		} finally {
			inboxGrantStore.dispose();
		}
	});

	it("uses bounded chunks for multi-megabyte media", async () => {
		const mediaBytes = Buffer.alloc(
			MAX_MEDIA_PAYLOAD_CHUNK_BYTES * 2 + 17,
			0x5a
		);
		const commit = await createGrantedCommit({ mediaBytes });
		const chunkLengths: number[] = [];
		await enqueueDesktopImportFromGrants({
			inboxDirectory,
			commit,
			readChunk: async (options) => {
				const chunk = await session.readMediaPayloadChunk(options);
				chunkLengths.push(chunk.bytes.byteLength);
				return chunk;
			},
			entryId: "large-entry",
			nowUnixMilliseconds: NOW,
		});

		expect(chunkLengths).toEqual([
			MAX_MEDIA_PAYLOAD_CHUNK_BYTES,
			MAX_MEDIA_PAYLOAD_CHUNK_BYTES,
			17,
		]);
		expect(
			(await readFile(join(inboxDirectory, "large-entry", "media-0.bin")))
				.byteLength
		).toBe(mediaBytes.byteLength);
	});

	it("removes partial entries when a chunk response is malformed", async () => {
		const commit = await createGrantedCommit();
		await expect(
			enqueueDesktopImportFromGrants({
				inboxDirectory,
				commit,
				readChunk: async (options) => {
					const chunk = await session.readMediaPayloadChunk(options);
					return { ...chunk, offset: chunk.offset + 1 };
				},
				entryId: "broken-entry",
				nowUnixMilliseconds: NOW,
			})
		).rejects.toBeInstanceOf(DesktopImportInboxMalformedError);
		expect(await listDesktopImports({ inboxDirectory })).toEqual([]);
	});

	it("rejects missing, duplicate, or mismatched grants", async () => {
		const commit = await createGrantedCommit();
		const [grant] = commit.mediaGrants;
		const invalidGrantSets = [
			[],
			[grant, grant],
			[{ ...grant, sha256: "f".repeat(64) }],
		] as MediaPayloadGrantDto[][];
		await Promise.all(
			invalidGrantSets.map(async (mediaGrants) => {
				await expect(
					enqueueDesktopImportFromGrants({
						inboxDirectory,
						commit: { ...commit, mediaGrants },
						readChunk: (options) => session.readMediaPayloadChunk(options),
						entryId: `invalid-${mediaGrants.length}-${mediaGrants[0]?.sha256[0] ?? "x"}`,
						nowUnixMilliseconds: NOW,
					})
				).rejects.toBeInstanceOf(DesktopImportInboxMalformedError);
			})
		);
	});

	it("refuses tampered persisted media before issuing inbox grants", async () => {
		const commit = await createGrantedCommit();
		await enqueueDesktopImportFromGrants({
			inboxDirectory,
			commit,
			readChunk: (options) => session.readMediaPayloadChunk(options),
			entryId: "tampered-entry",
			nowUnixMilliseconds: NOW,
		});
		await writeFile(
			join(inboxDirectory, "tampered-entry", "media-0.bin"),
			"other-bytes"
		);
		const inboxGrantStore = new MediaPayloadGrantStore();
		try {
			await expect(
				readDesktopImportWithGrants({
					inboxDirectory,
					entryId: "tampered-entry",
					grantStore: inboxGrantStore,
				})
			).rejects.toMatchObject({ code: "source-changed" });
		} finally {
			inboxGrantStore.dispose();
		}
	});
});
