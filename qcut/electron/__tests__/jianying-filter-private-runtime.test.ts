// @vitest-environment node
import {
	mkdtemp,
	mkdir,
	readFile,
	readlink,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JianyingKnownFilter } from "../jianying-filter-metadata.js";
import {
	backupJianyingFilterRuntime,
	jianyingFilterRuntimeBackupTestUtils,
} from "../jianying-filter-local-runtime/runtime-backup.js";
import {
	hasJianyingFilterPrivateRuntime,
	parseJianyingFilterPrivateRuntimeManifest,
} from "../jianying-filter-local-runtime/private-runtime.js";
import type { JianyingFilterLocalRuntimeInspection } from "../jianying-filter-local-runtime/runtime-discovery.js";

const CORE_UUID = "D6342ECD-5432-33F0-A2AD-0C28F5699994";
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-filter-backup-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

async function writeFixture({
	filePath,
	contents,
}: {
	filePath: string;
	contents: string;
}) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, contents);
}

function readyRuntime({ sourceRoot }: { sourceRoot: string }) {
	const frameworkDirectory = path.join(sourceRoot, "Frameworks");
	return {
		status: {
			state: "ready",
			message: "ready",
			provider: "jianying-local-effect-v1",
			platform: "darwin",
			bridgeReady: true,
			runtimeReady: true,
			modelReady: true,
		},
		bridgePath: path.join(sourceRoot, "bridge"),
		effectLibraryPath: path.join(frameworkDirectory, "libcccreator.dylib"),
		frameworkDirectory,
		modelDirectory: path.join(sourceRoot, "Models"),
	} satisfies JianyingFilterLocalRuntimeInspection;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying filter private runtime", () => {
	it("rejects manifests with unsafe or duplicate inventory paths", () => {
		const base = {
			schemaVersion: 1,
			createdAt: "2026-08-22T00:00:00.000Z",
			localOnly: true,
			cloudUpload: false,
			coreUuid: CORE_UUID,
			runtimeLibraryCount: 1,
			modelCount: 1,
			packageCount: 0,
			databaseFileCount: 1,
			totalBytes: 1,
		};
		const file = { bytes: 1, sha256: "a".repeat(64) };
		expect(
			parseJianyingFilterPrivateRuntimeManifest({
				value: { ...base, files: [{ ...file, path: "../outside" }] },
			})
		).toBeNull();
		expect(
			parseJianyingFilterPrivateRuntimeManifest({
				value: {
					...base,
					files: [
						{ ...file, path: "Models/a.model" },
						{ ...file, path: "Models/a.model" },
					],
				},
			})
		).toBeNull();
	});

	it("creates, verifies, and reuses a self-contained local snapshot", async () => {
		const root = await temporaryDirectory();
		const sourceRoot = path.join(root, "source-runtime");
		const sourceCacheRoot = path.join(root, "source-cache");
		const managedPackageRoot = path.join(root, "managed-packages");
		const privateRuntimeRoot = path.join(root, "private-runtime");
		await Promise.all([
			writeFixture({
				filePath: path.join(sourceRoot, "Frameworks", "libcccreator.dylib"),
				contents: "private runtime",
			}),
			writeFixture({
				filePath: path.join(sourceRoot, "Models", "tt_skin_seg.model"),
				contents: "skin model",
			}),
			writeFixture({
				filePath: path.join(sourceCacheRoot, "ressdk_db", "filter", "rp.db"),
				contents: "catalog",
			}),
			writeFixture({
				filePath: path.join(
					sourceCacheRoot,
					"ressdk_db",
					"filter",
					"rp.db-shm"
				),
				contents: "volatile sqlite state",
			}),
			writeFixture({
				filePath: path.join(
					sourceCacheRoot,
					"artistEffect",
					"100",
					"v1",
					"AmazingFeature",
					"config.json"
				),
				contents: "artist package",
			}),
			writeFixture({
				filePath: path.join(
					sourceCacheRoot,
					"effect",
					"200",
					"v1",
					"config.json"
				),
				contents: "effect package",
			}),
			writeFixture({
				filePath: path.join(managedPackageRoot, "101", "v2", "config.json"),
				contents: "managed package",
			}),
		]);
		const filters: JianyingKnownFilter[] = [
			{
				resourceId: "100",
				effectId: "200",
				title: "One",
				categories: ["Camera"],
			},
			{ resourceId: "101", title: "Two", categories: ["Portrait"] },
		];
		const options = {
			filters,
			runtime: readyRuntime({ sourceRoot }),
			privateRuntimeRoot,
			sourceCacheRoot,
			managedPackageRoot,
			readCoreUuid: async () => CORE_UUID,
		};

		const created = await backupJianyingFilterRuntime(options);
		expect(created).toMatchObject({
			created: true,
			coreUuid: CORE_UUID,
			runtimeLibraryCount: 1,
			modelCount: 1,
			packageCount: 3,
			databaseFileCount: 1,
		});
		const snapshotName = await readlink(
			path.join(privateRuntimeRoot, "current")
		);
		const snapshotRoot = path.join(privateRuntimeRoot, snapshotName);
		expect(
			await hasJianyingFilterPrivateRuntime({ runtimeRoot: snapshotRoot })
		).toBe(true);
		const manifestText = await readFile(
			path.join(snapshotRoot, "manifest.json"),
			"utf8"
		);
		expect(manifestText).not.toContain(sourceRoot);
		expect(manifestText).not.toContain(sourceCacheRoot);
		expect(
			await jianyingFilterRuntimeBackupTestUtils.parseStoredManifest({
				manifestPath: path.join(snapshotRoot, "manifest.json"),
			})
		).not.toBeNull();
		await expect(
			readFile(
				path.join(snapshotRoot, "Cache", "ressdk_db", "filter", "rp.db-shm")
			)
		).rejects.toMatchObject({ code: "ENOENT" });

		const regeneratedSharedMemoryPath = path.join(
			snapshotRoot,
			"Cache",
			"ressdk_db",
			"filter",
			"rp.db-shm"
		);
		await writeFixture({
			filePath: regeneratedSharedMemoryPath,
			contents: "sqlite regenerated this after a read-only query",
		});
		await expect(
			jianyingFilterRuntimeBackupTestUtils.verifySnapshot({
				runtimeRoot: snapshotRoot,
			})
		).resolves.toBeTruthy();
		await writeFile(regeneratedSharedMemoryPath, "sqlite mutated this again");
		await expect(
			jianyingFilterRuntimeBackupTestUtils.verifySnapshot({
				runtimeRoot: snapshotRoot,
			})
		).resolves.toBeTruthy();

		const reused = await backupJianyingFilterRuntime(options);
		expect(reused.created).toBe(false);
		expect(await readlink(path.join(privateRuntimeRoot, "current"))).toBe(
			snapshotName
		);
	});
});
