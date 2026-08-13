import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
} from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	Jianying113RegisteredProjectWritebackError,
	jianying113RegisteredProjectWriterTesting,
	recoverJianying113RegisteredProjectWriteback,
	writeJianying113RegisteredProjectContent,
} from "../index.js";

const SUBDRAFT_ID = "99E7BA11-DA10-4DCB-B74A-A215020F610D";
const DOCUMENT_ID = "1DCF6F0F-80B5-4893-B664-1B8A1DCFF776";

let rootDirectory = "";
let projectDirectory = "";

function contentBytes({
	appVersion = JIANYING_11_3_BETA3_APP_VERSION,
	documentId = DOCUMENT_ID,
	startUs = 0,
}: {
	appVersion?: string;
	documentId?: string;
	startUs?: number;
} = {}): Uint8Array {
	const content: Record<string, unknown> = Object.fromEntries(
		JIANYING_11_3_BETA2_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	Object.assign(content, {
		id: documentId,
		last_modified_platform: {
			app_id: JIANYING_11_3_BETA2_APP_ID,
			app_source: JIANYING_11_3_BETA2_APP_SOURCE,
			app_version: appVersion,
		},
		new_version: JIANYING_11_3_BETA2_NEW_VERSION,
		tracks: [
			{
				id: "track-1",
				segments: [
					{
						id: "segment-1",
						target_timerange: { duration: 3_000_000, start: startUs },
						unknown: { preserve: true },
					},
				],
			},
		],
		version: JIANYING_11_3_BETA2_SCHEMA_VERSION,
	});
	return new TextEncoder().encode(JSON.stringify(content));
}

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function createProject({
	originalBytes = contentBytes(),
}: {
	originalBytes?: Uint8Array;
} = {}): Promise<{
	contentPath: string;
	originalBytes: Uint8Array;
	sidecarPath: string;
}> {
	const contentDirectory = join(projectDirectory, "subdraft", SUBDRAFT_ID);
	const contentPath = join(contentDirectory, "draft_content.json");
	const sidecarPath = join(projectDirectory, "draft_info.json");
	await mkdir(contentDirectory, { recursive: true });
	await Promise.all([
		writeFile(contentPath, originalBytes),
		writeFile(sidecarPath, Buffer.from([0xff, 0x00, 0x7f])),
	]);
	return { contentPath, originalBytes, sidecarPath };
}

async function listQCutArtifacts({
	contentPath,
}: {
	contentPath: string;
}): Promise<string[]> {
	const [projectEntries, contentEntries] = await Promise.all([
		readdir(projectDirectory),
		readdir(dirname(contentPath)),
	]);
	return [...projectEntries, ...contentEntries]
		.filter((name) => name.includes("qcut-jianying") || name.includes(".qcut-"))
		.sort();
}

const assertClosed = async (): Promise<void> => undefined;

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-jianying-registered-"));
	projectDirectory = join(rootDirectory, "registered-project");
	await mkdir(projectDirectory);
});

afterEach(async () => {
	await rm(rootDirectory, { force: true, recursive: true });
});

describe("Jianying 11.3 registered-project writer", () => {
	it("atomically replaces only the matching beta 3 subdraft", async () => {
		const fixture = await createProject();
		const preparedBytes = contentBytes({ startUs: 1_000_000 });
		let guardCalls = 0;

		const result = await writeJianying113RegisteredProjectContent({
			assertTargetAppClosed: async () => {
				guardCalls += 1;
			},
			contentBytes: preparedBytes,
			expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
			profileId: JIANYING_11_3_BETA3_PROFILE_ID,
			projectDirectory,
		});

		expect(guardCalls).toBe(3);
		expect(result).toMatchObject({
			contentRelativePath: `subdraft/${SUBDRAFT_ID}/draft_content.json`,
			contentSha256: sha256({ bytes: preparedBytes }),
			profileId: JIANYING_11_3_BETA3_PROFILE_ID,
			subdraftId: SUBDRAFT_ID,
		});
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(preparedBytes)
		);
		expect(await readFile(fixture.sidecarPath)).toEqual(
			Buffer.from([0xff, 0x00, 0x7f])
		);
		expect(
			await listQCutArtifacts({ contentPath: fixture.contentPath })
		).toEqual([]);
	});

	it("accepts the exact beta 2 profile without cross-version migration", async () => {
		const originalBytes = contentBytes({
			appVersion: JIANYING_11_3_BETA2_APP_VERSION,
		});
		const fixture = await createProject({ originalBytes });
		const preparedBytes = contentBytes({
			appVersion: JIANYING_11_3_BETA2_APP_VERSION,
			startUs: 500_000,
		});

		const result = await writeJianying113RegisteredProjectContent({
			assertTargetAppClosed: assertClosed,
			contentBytes: preparedBytes,
			expectedSourceSha256: sha256({ bytes: originalBytes }),
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
			projectDirectory,
		});

		expect(result.profileId).toBe(JIANYING_11_3_BETA2_PROFILE_ID);
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(preparedBytes)
		);
	});

	it("rejects a prepared document identity change before staging", async () => {
		const fixture = await createProject();

		await expect(
			writeJianying113RegisteredProjectContent({
				assertTargetAppClosed: assertClosed,
				contentBytes: contentBytes({ documentId: "different-document" }),
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				profileId: JIANYING_11_3_BETA3_PROFILE_ID,
				projectDirectory,
			})
		).rejects.toMatchObject({ code: "CONTENT_INVALID" });
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(fixture.originalBytes)
		);
		expect(
			await listQCutArtifacts({ contentPath: fixture.contentPath })
		).toEqual([]);
	});

	it("restores the original subdraft when commit verification fails", async () => {
		const fixture = await createProject();

		await expect(
			writeJianying113RegisteredProjectContent({
				assertTargetAppClosed: assertClosed,
				contentBytes: contentBytes({ startUs: 1_000_000 }),
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				instrumentation: {
					afterContentReplaced: () => {
						throw new Error("injected verification failure");
					},
				},
				profileId: JIANYING_11_3_BETA3_PROFILE_ID,
				projectDirectory,
			})
		).rejects.toThrow("injected verification failure");
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(fixture.originalBytes)
		);
		expect(
			await listQCutArtifacts({ contentPath: fixture.contentPath })
		).toEqual([]);
	});

	it("retains recovery state if Jianying opens after replacement", async () => {
		const fixture = await createProject();
		const preparedBytes = contentBytes({ startUs: 1_000_000 });
		let appOpen = false;
		const appGuard = async (): Promise<void> => {
			if (appOpen) throw new Error("Jianying is running");
		};

		await expect(
			writeJianying113RegisteredProjectContent({
				assertTargetAppClosed: appGuard,
				contentBytes: preparedBytes,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				instrumentation: {
					afterContentReplaced: () => {
						appOpen = true;
					},
				},
				profileId: JIANYING_11_3_BETA3_PROFILE_ID,
				projectDirectory,
			})
		).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(preparedBytes)
		);
		appOpen = false;

		const recovery = await recoverJianying113RegisteredProjectWriteback({
			assertTargetAppClosed: appGuard,
			projectDirectory,
		});

		expect(recovery.action).toBe("rolled-back");
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(fixture.originalBytes)
		);
		expect(
			await listQCutArtifacts({ contentPath: fixture.contentPath })
		).toEqual([]);
	});

	it("keeps committed content when recovery finishes interrupted cleanup", async () => {
		const fixture = await createProject();
		const preparedBytes = contentBytes({ startUs: 2_000_000 });

		await expect(
			writeJianying113RegisteredProjectContent({
				assertTargetAppClosed: assertClosed,
				contentBytes: preparedBytes,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				instrumentation: {
					afterJournalCommitted: () => {
						throw new Error("simulated cleanup crash");
					},
				},
				profileId: JIANYING_11_3_BETA3_PROFILE_ID,
				projectDirectory,
			})
		).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });

		const recovery = await recoverJianying113RegisteredProjectWriteback({
			assertTargetAppClosed: assertClosed,
			projectDirectory,
		});

		expect(recovery.action).toBe("committed-cleanup");
		expect(await readFile(fixture.contentPath)).toEqual(
			Buffer.from(preparedBytes)
		);
		expect(
			await listQCutArtifacts({ contentPath: fixture.contentPath })
		).toEqual([]);
	});

	it("clears a stale QCut lock only when no journal exists", async () => {
		const fixture = await createProject();
		await writeFile(
			join(
				projectDirectory,
				jianying113RegisteredProjectWriterTesting.QCUT_LOCK_FILE_NAME
			),
			"stale\n"
		);

		const recovery = await recoverJianying113RegisteredProjectWriteback({
			assertTargetAppClosed: assertClosed,
			projectDirectory,
		});

		expect(recovery.action).toBe("cleared-stale-lock");
		expect(
			await listQCutArtifacts({ contentPath: fixture.contentPath })
		).toEqual([]);
	});

	it("refuses a Jianying-owned project", async () => {
		const fixture = await createProject();
		await writeFile(join(projectDirectory, ".locked"), "owned");

		await expect(
			writeJianying113RegisteredProjectContent({
				assertTargetAppClosed: assertClosed,
				contentBytes: fixture.originalBytes,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				profileId: JIANYING_11_3_BETA3_PROFILE_ID,
				projectDirectory,
			})
		).rejects.toBeInstanceOf(Jianying113RegisteredProjectWritebackError);
	});
});
