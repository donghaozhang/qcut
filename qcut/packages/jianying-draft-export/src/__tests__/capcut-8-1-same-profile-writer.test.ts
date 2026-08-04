import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAPCUT_8_1_PROFILE_ID } from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CapCut81SameProfileWritebackError } from "../capcut-8-1-same-profile-contract.js";
import {
	capCut81SameProfileWriterTesting,
	recoverCapCut81SameProfileWriteback,
} from "../capcut-8-1-same-profile-transaction.js";
import { writeCapCut81SameProfileContent } from "../capcut-8-1-same-profile-writer.js";
import {
	contentBytes,
	createCapCut81SameProfileTestFixture,
	listQCutArtifacts,
	readMirrors,
	sha256,
} from "./support/capcut-8-1-same-profile-fixture.js";

let rootDirectory = "";

function createDraftFixture() {
	return createCapCut81SameProfileTestFixture({ rootDirectory });
}

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-capcut-writeback-"));
});

afterEach(async () => {
	await rm(rootDirectory, { force: true, recursive: true });
});

describe("CapCut 8.1 same-profile writer", () => {
	it("atomically replaces four active mirrors and leaves backups untouched", async () => {
		const fixture = await createDraftFixture();
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});

		const result = await writeCapCut81SameProfileContent({
			contentBytes: patchedBytes,
			draftDirectory: fixture.draftDirectory,
			expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
			profileId: CAPCUT_8_1_PROFILE_ID,
		});

		expect(result.replacedMirrorCount).toBe(4);
		for (const bytes of await readMirrors(fixture)) {
			expect([...bytes]).toEqual([...patchedBytes]);
		}
		for (const backupPath of fixture.backupPaths) {
			expect([...(await readFile(backupPath))]).toEqual([
				...fixture.originalBytes,
			]);
		}
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("rejects divergent mirrors before creating a transaction", async () => {
		const fixture = await createDraftFixture();
		const divergentPath = join(
			fixture.draftDirectory,
			...fixture.mirrorRelativePaths[1].split("/")
		);
		const divergentBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 1_000_000,
		});
		await writeFile(divergentPath, divergentBytes);

		await expect(
			writeCapCut81SameProfileContent({
				contentBytes: contentBytes({ timelineId: fixture.timelineId }),
				draftDirectory: fixture.draftDirectory,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				profileId: CAPCUT_8_1_PROFILE_ID,
			})
		).rejects.toMatchObject({
			code: "MIRROR_CONTENT_MISMATCH",
		});
		const mirrors = await readMirrors(fixture);
		expect([...mirrors[0]]).toEqual([...fixture.originalBytes]);
		expect([...mirrors[1]]).toEqual([...divergentBytes]);
		expect([...mirrors[2]]).toEqual([...fixture.originalBytes]);
		expect([...mirrors[3]]).toEqual([...fixture.originalBytes]);
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("rolls every mirror back when a replacement step fails", async () => {
		const fixture = await createDraftFixture();
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});

		await expect(
			writeCapCut81SameProfileContent({
				contentBytes: patchedBytes,
				draftDirectory: fixture.draftDirectory,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				instrumentation: {
					afterMirrorReplaced: ({ replacedCount }) => {
						if (replacedCount === 2) throw new Error("injected failure");
					},
				},
				profileId: CAPCUT_8_1_PROFILE_ID,
			})
		).rejects.toThrow("injected failure");

		for (const bytes of await readMirrors(fixture)) {
			expect([...bytes]).toEqual([...fixture.originalBytes]);
		}
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("refuses to write while CapCut owns the project", async () => {
		const fixture = await createDraftFixture();
		await writeFile(join(fixture.draftDirectory, ".locked"), "owned");

		await expect(
			writeCapCut81SameProfileContent({
				contentBytes: contentBytes({ timelineId: fixture.timelineId }),
				draftDirectory: fixture.draftDirectory,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				profileId: CAPCUT_8_1_PROFILE_ID,
			})
		).rejects.toMatchObject({ code: "CAPCUT_PROJECT_LOCKED" });
	});

	it("recovers an interrupted uncommitted journal", async () => {
		const fixture = await createDraftFixture();
		const transactionId = randomUUID();
		const mirrors = capCut81SameProfileWriterTesting.buildMirrorStates({
			draftDirectory: fixture.draftDirectory,
			timelineId: fixture.timelineId,
			transactionId,
		});
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});
		for (const mirror of mirrors) {
			await writeFile(mirror.rollbackPath, fixture.originalBytes);
			await writeFile(mirror.absolutePath, patchedBytes);
		}
		await writeFile(
			join(
				fixture.draftDirectory,
				capCut81SameProfileWriterTesting.JOURNAL_FILE_NAME
			),
			JSON.stringify({
				schema: "qcut.capcut-8.1.same-profile-writeback-journal",
				schemaVersion: 1,
				transactionId,
				timelineId: fixture.timelineId,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				contentSha256: sha256({ bytes: patchedBytes }),
				committed: false,
			})
		);
		await writeFile(
			join(
				fixture.draftDirectory,
				capCut81SameProfileWriterTesting.QCUT_LOCK_FILE_NAME
			),
			transactionId
		);

		const result = await recoverCapCut81SameProfileWriteback({
			draftDirectory: fixture.draftDirectory,
		});

		expect(result.action).toBe("rolled-back");
		for (const bytes of await readMirrors(fixture)) {
			expect([...bytes]).toEqual([...fixture.originalBytes]);
		}
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("keeps a journal when CapCut opens mid-transaction, then recovers", async () => {
		const fixture = await createDraftFixture();
		const capCutLockPath = join(fixture.draftDirectory, ".locked");

		await expect(
			writeCapCut81SameProfileContent({
				contentBytes: contentBytes({
					timelineId: fixture.timelineId,
					timing: 2_000_000,
				}),
				draftDirectory: fixture.draftDirectory,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				instrumentation: {
					afterMirrorReplaced: async ({ replacedCount }) => {
						if (replacedCount === 1) await writeFile(capCutLockPath, "owned");
					},
				},
				profileId: CAPCUT_8_1_PROFILE_ID,
			})
		).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).not.toEqual([]);

		await rm(capCutLockPath);
		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).resolves.toMatchObject({ action: "rolled-back" });
		for (const bytes of await readMirrors(fixture)) {
			expect([...bytes]).toEqual([...fixture.originalBytes]);
		}
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("keeps committed content when recovering cleanup after a crash", async () => {
		const fixture = await createDraftFixture();
		const transactionId = randomUUID();
		const mirrors = capCut81SameProfileWriterTesting.buildMirrorStates({
			draftDirectory: fixture.draftDirectory,
			timelineId: fixture.timelineId,
			transactionId,
		});
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});
		await Promise.all(
			mirrors.flatMap((mirror) => [
				writeFile(mirror.rollbackPath, fixture.originalBytes),
				writeFile(mirror.absolutePath, patchedBytes),
			])
		);
		await writeFile(
			join(
				fixture.draftDirectory,
				capCut81SameProfileWriterTesting.JOURNAL_FILE_NAME
			),
			JSON.stringify({
				schema: "qcut.capcut-8.1.same-profile-writeback-journal",
				schemaVersion: 1,
				transactionId,
				timelineId: fixture.timelineId,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				contentSha256: sha256({ bytes: patchedBytes }),
				committed: true,
			})
		);

		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).resolves.toMatchObject({ action: "committed-cleanup" });
		for (const bytes of await readMirrors(fixture)) {
			expect([...bytes]).toEqual([...patchedBytes]);
		}
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("rejects unsafe mirror symlinks", async () => {
		const fixture = await createDraftFixture();
		const mirrorPath = join(
			fixture.draftDirectory,
			...fixture.mirrorRelativePaths[0].split("/")
		);
		const outsidePath = join(rootDirectory, "outside.json");
		await writeFile(outsidePath, fixture.originalBytes);
		await rm(mirrorPath);
		await import("node:fs/promises").then(({ symlink }) =>
			symlink(outsidePath, mirrorPath)
		);

		await expect(
			writeCapCut81SameProfileContent({
				contentBytes: contentBytes({ timelineId: fixture.timelineId }),
				draftDirectory: fixture.draftDirectory,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				profileId: CAPCUT_8_1_PROFILE_ID,
			})
		).rejects.toBeInstanceOf(CapCut81SameProfileWritebackError);
		expect([...(await readFile(outsidePath))]).toEqual([
			...fixture.originalBytes,
		]);
	});
});

describe("stale lock recovery (JYI-018)", () => {
	it("clears a lock with no journal and unblocks the next writeback", async () => {
		const fixture = await createDraftFixture();
		// Simulate a crash between lock creation and journal creation: the
		// lock exists, no journal exists, no mirror was touched.
		const lockPath = join(
			fixture.draftDirectory,
			capCut81SameProfileWriterTesting.QCUT_LOCK_FILE_NAME
		);
		await writeFile(lockPath, `${randomUUID()}\n`);

		// Without recovery, every writeback is locked out.
		await expect(
			writeCapCut81SameProfileContent({
				contentBytes: contentBytes({
					timelineId: fixture.timelineId,
					timing: 2_000_000,
				}),
				draftDirectory: fixture.draftDirectory,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				profileId: CAPCUT_8_1_PROFILE_ID,
			})
		).rejects.toMatchObject({ code: "WRITEBACK_ALREADY_RUNNING" });

		const recovery = await recoverCapCut81SameProfileWriteback({
			draftDirectory: fixture.draftDirectory,
		});
		expect(recovery.action).toBe("cleared-stale-lock");
		// Mirrors were never touched by the crashed transaction.
		for (const bytes of await readMirrors(fixture)) {
			expect([...bytes]).toEqual([...fixture.originalBytes]);
		}

		// A second recovery is a no-op, and writeback works again.
		expect(
			(
				await recoverCapCut81SameProfileWriteback({
					draftDirectory: fixture.draftDirectory,
				})
			).action
		).toBe("none");
		const written = await writeCapCut81SameProfileContent({
			contentBytes: contentBytes({
				timelineId: fixture.timelineId,
				timing: 2_000_000,
			}),
			draftDirectory: fixture.draftDirectory,
			expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
			profileId: CAPCUT_8_1_PROFILE_ID,
		});
		expect(written.replacedMirrorCount).toBe(4);
	});

	it("still refuses recovery while a journal exists without rollbacks", async () => {
		const fixture = await createDraftFixture();
		// Lock plus a journal whose rollback mirrors are missing: this is NOT
		// the stale-lock shape and must stay a hard RECOVERY_REQUIRED.
		const transactionId = randomUUID();
		await writeFile(
			join(
				fixture.draftDirectory,
				capCut81SameProfileWriterTesting.JOURNAL_FILE_NAME
			),
			JSON.stringify({
				schema: "qcut.capcut81.writeback-journal",
				schemaVersion: 1,
				transactionId,
				timelineId: fixture.timelineId,
				expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
				contentSha256: sha256({
					bytes: contentBytes({
						timelineId: fixture.timelineId,
						timing: 2_000_000,
					}),
				}),
				committed: false,
			})
		);
		await writeFile(
			join(
				fixture.draftDirectory,
				capCut81SameProfileWriterTesting.QCUT_LOCK_FILE_NAME
			),
			`${transactionId}\n`
		);
		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
	});
});
