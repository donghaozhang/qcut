import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CAPCUT_WRITEBACK_JOURNAL_SCHEMA,
	capCut81SameProfileWriterTesting,
	recoverCapCut81SameProfileWriteback,
	type CapCutWritebackMirrorDescriptor,
} from "../capcut-8-1-same-profile-transaction.js";
import {
	contentBytes,
	createCapCut81SameProfileTestFixture,
	listQCutArtifacts,
	readMirrors,
	sha256,
	type CapCut81SameProfileTestFixture,
} from "./support/capcut-8-1-same-profile-fixture.js";

let rootDirectory = "";

async function persistUncommittedCrashState({
	fixture,
	patchedBytes,
	replacedCount,
}: {
	fixture: CapCut81SameProfileTestFixture;
	patchedBytes: Uint8Array;
	replacedCount: number;
}): Promise<{
	mirrors: CapCutWritebackMirrorDescriptor[];
	transactionId: string;
}> {
	const transactionId = randomUUID();
	const mirrors = capCut81SameProfileWriterTesting.buildMirrorStates({
		draftDirectory: fixture.draftDirectory,
		timelineId: fixture.timelineId,
		transactionId,
	});
	await writeFile(
		join(
			fixture.draftDirectory,
			capCut81SameProfileWriterTesting.QCUT_LOCK_FILE_NAME
		),
		`${transactionId}\n`
	);
	await Promise.all(
		mirrors.flatMap((mirror) => [
			writeFile(mirror.rollbackPath, fixture.originalBytes),
			writeFile(mirror.temporaryPath, patchedBytes),
		])
	);
	await writeFile(
		join(
			fixture.draftDirectory,
			capCut81SameProfileWriterTesting.JOURNAL_FILE_NAME
		),
		JSON.stringify({
			schema: CAPCUT_WRITEBACK_JOURNAL_SCHEMA,
			schemaVersion: 1,
			transactionId,
			timelineId: fixture.timelineId,
			expectedSourceSha256: sha256({ bytes: fixture.originalBytes }),
			contentSha256: sha256({ bytes: patchedBytes }),
			committed: false,
		})
	);
	await Promise.all(
		mirrors
			.slice(0, replacedCount)
			.map((mirror) => rename(mirror.temporaryPath, mirror.absolutePath))
	);
	return { mirrors, transactionId };
}

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-capcut-crash-matrix-"));
});

afterEach(async () => {
	await rm(rootDirectory, { force: true, recursive: true });
});

describe("CapCut 8.1 mid-rename crash recovery (JYI-018)", () => {
	it.each([
		{ replacedCount: 0 },
		{ replacedCount: 1 },
		{ replacedCount: 2 },
		{ replacedCount: 3 },
		{ replacedCount: 4 },
	])("restores every mirror after $replacedCount replacements", async ({
		replacedCount,
	}) => {
		const fixture = await createCapCut81SameProfileTestFixture({
			rootDirectory,
		});
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});
		const { transactionId } = await persistUncommittedCrashState({
			fixture,
			patchedBytes,
			replacedCount,
		});
		const originalDigest = sha256({ bytes: fixture.originalBytes });
		const patchedDigest = sha256({ bytes: patchedBytes });
		const interruptedDigests = (await readMirrors(fixture)).map((bytes) =>
			sha256({ bytes })
		);
		expect(interruptedDigests).toEqual(
			fixture.mirrorRelativePaths.map((_relativePath, index) =>
				index < replacedCount ? patchedDigest : originalDigest
			)
		);

		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).resolves.toMatchObject({ action: "rolled-back", transactionId });
		expect(
			(await readMirrors(fixture)).map((bytes) => sha256({ bytes }))
		).toEqual(fixture.mirrorRelativePaths.map(() => originalDigest));
		expect(
			await Promise.all(
				fixture.backupPaths.map(async (backupPath) =>
					sha256({ bytes: await readFile(backupPath) })
				)
			)
		).toEqual(fixture.backupPaths.map(() => originalDigest));
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).resolves.toMatchObject({ action: "none" });
	});
});

describe("CapCut 8.1 interrupted recovery (JYI-018)", () => {
	it.each([
		{ restoredCount: 1 },
		{ restoredCount: 2 },
		{ restoredCount: 3 },
		{ restoredCount: 4 },
	])("resumes after $restoredCount rollback mirrors were already consumed", async ({
		restoredCount,
	}) => {
		const fixture = await createCapCut81SameProfileTestFixture({
			rootDirectory,
		});
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});
		const { mirrors, transactionId } = await persistUncommittedCrashState({
			fixture,
			patchedBytes,
			replacedCount: 4,
		});
		await Promise.all(
			mirrors
				.slice(0, restoredCount)
				.map((mirror) => rename(mirror.rollbackPath, mirror.absolutePath))
		);

		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).resolves.toMatchObject({ action: "rolled-back", transactionId });
		const originalDigest = sha256({ bytes: fixture.originalBytes });
		expect(
			(await readMirrors(fixture)).map((bytes) => sha256({ bytes }))
		).toEqual(fixture.mirrorRelativePaths.map(() => originalDigest));
		expect(
			await listQCutArtifacts({ directory: fixture.draftDirectory })
		).toEqual([]);
	});

	it("refuses recovery before mutation when a rollback and original mirror are both unavailable", async () => {
		const fixture = await createCapCut81SameProfileTestFixture({
			rootDirectory,
		});
		const patchedBytes = contentBytes({
			timelineId: fixture.timelineId,
			timing: 2_000_000,
		});
		const { mirrors } = await persistUncommittedCrashState({
			fixture,
			patchedBytes,
			replacedCount: 4,
		});
		await rm(mirrors[0].rollbackPath);

		await expect(
			recoverCapCut81SameProfileWriteback({
				draftDirectory: fixture.draftDirectory,
			})
		).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
		const patchedDigest = sha256({ bytes: patchedBytes });
		expect(
			(await readMirrors(fixture)).map((bytes) => sha256({ bytes }))
		).toEqual(fixture.mirrorRelativePaths.map(() => patchedDigest));
		await expect(readFile(mirrors[1].rollbackPath)).resolves.toBeDefined();
	});
});
