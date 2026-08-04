import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildJianyingDraft,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deleteDesktopImport,
	DesktopImportInboxMalformedError,
	enqueueDesktopImport,
	listDesktopImports,
	readDesktopImport,
} from "../desktop-import-inbox.js";
import type { DraftImportCommitDto } from "../import-session.js";
import { JianyingDraftImportSession } from "../import-session.js";

const BUILD = { appVersion: "2026.08.04.1", interopSchemaVersion: 1 };
const NOW = 1_000_000;

let rootDirectory: string;
let draftDirectory: string;
let inboxDirectory: string;
let commit: DraftImportCommitDto;

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
			name: "Inbox Fixture",
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

async function createCommit(): Promise<DraftImportCommitDto> {
	const { content } = buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: draftDirectory,
		snapshot: createExportSnapshot(),
		targetPlatform: "macos",
	});
	await Promise.all([
		writeFile(join(draftDirectory, "draft_info.json"), JSON.stringify(content)),
		writeFile(
			join(draftDirectory, "draft_meta_info.json"),
			JSON.stringify({ draft_name: "Inbox Fixture" })
		),
		mkdir(join(draftDirectory, "assets"), { recursive: true }).then(() =>
			writeFile(join(draftDirectory, "assets", "clip.mp4"), "media-bytes")
		),
	]);
	const session = new JianyingDraftImportSession({
		buildIdentity: BUILD,
		now: () => NOW,
	});
	try {
		const plan = await session.plan({ input: { draftPath: draftDirectory } });
		return await session.commit({
			input: {
				planToken: plan.plan.planToken,
				acceptedWarningFingerprints: [...plan.plan.warningFingerprints],
			},
		});
	} finally {
		session.dispose();
	}
}

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-import-inbox-test-"));
	draftDirectory = join(rootDirectory, "draft");
	inboxDirectory = join(rootDirectory, "inbox");
	await mkdir(draftDirectory);
	commit = await createCommit();
});

afterEach(async () => {
	await rm(rootDirectory, { recursive: true, force: true });
});

describe("desktop import inbox", () => {
	it("atomically enqueues, lists, reads, and deletes a validated commit", async () => {
		const summary = await enqueueDesktopImport({
			inboxDirectory,
			commit,
			entryId: "entry-1",
			nowUnixMilliseconds: NOW,
		});
		expect(summary).toMatchObject({
			entryId: "entry-1",
			createdAtUnixMilliseconds: NOW,
			projectName: "Inbox Fixture",
			mediaCount: 1,
		});
		expect(await listDesktopImports({ inboxDirectory })).toEqual([summary]);
		expect(
			await readDesktopImport({ inboxDirectory, entryId: "entry-1" })
		).toEqual(commit);
		if (process.platform !== "win32") {
			expect((await stat(join(inboxDirectory, "entry-1"))).mode & 0o777).toBe(
				0o700
			);
			expect(
				(await stat(join(inboxDirectory, "entry-1", "manifest.v1.json"))).mode &
					0o777
			).toBe(0o600);
		}
		await deleteDesktopImport({ inboxDirectory, entryId: "entry-1" });
		expect(await listDesktopImports({ inboxDirectory })).toEqual([]);
	});

	it("rejects duplicate entry ids and malformed media payloads", async () => {
		await enqueueDesktopImport({
			inboxDirectory,
			commit,
			entryId: "entry-1",
		});
		await expect(
			enqueueDesktopImport({ inboxDirectory, commit, entryId: "entry-1" })
		).rejects.toBeInstanceOf(DesktopImportInboxMalformedError);
		await expect(
			enqueueDesktopImport({
				inboxDirectory,
				commit: {
					...commit,
					mediaPayloads: [
						{ ...commit.mediaPayloads[0], bytesBase64: "not-base64" },
					],
				},
				entryId: "entry-2",
			})
		).rejects.toBeInstanceOf(DesktopImportInboxMalformedError);
	});

	it("validates multi-megabyte media without overflowing the call stack", async () => {
		const bytesBase64 = Buffer.alloc(5 * 1024 * 1024, 0x5a).toString("base64");
		const largeCommit: DraftImportCommitDto = {
			...commit,
			mediaPayloads: [{ ...commit.mediaPayloads[0], bytesBase64 }],
		};
		await enqueueDesktopImport({
			inboxDirectory,
			commit: largeCommit,
			entryId: "large-media",
		});
		const restored = await readDesktopImport({
			inboxDirectory,
			entryId: "large-media",
		});
		expect(restored.mediaPayloads[0].bytesBase64).toBe(bytesBase64);
	});

	it("fails closed when persisted media or bundle bytes are tampered", async () => {
		await enqueueDesktopImport({
			inboxDirectory,
			commit,
			entryId: "media-tamper",
		});
		await writeFile(
			join(inboxDirectory, "media-tamper", "media-0.bin"),
			"changed"
		);
		await expect(
			readDesktopImport({ inboxDirectory, entryId: "media-tamper" })
		).rejects.toBeInstanceOf(DesktopImportInboxMalformedError);

		await enqueueDesktopImport({
			inboxDirectory,
			commit,
			entryId: "bundle-tamper",
		});
		const manifestPath = join(
			inboxDirectory,
			"bundle-tamper",
			"manifest.v1.json"
		);
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
			bundle: { document: { project: { name: string } } };
		};
		manifest.bundle.document.project.name = "Tampered";
		await writeFile(manifestPath, JSON.stringify(manifest));
		await expect(
			readDesktopImport({ inboxDirectory, entryId: "bundle-tamper" })
		).rejects.toBeInstanceOf(DesktopImportInboxMalformedError);
	});
});
