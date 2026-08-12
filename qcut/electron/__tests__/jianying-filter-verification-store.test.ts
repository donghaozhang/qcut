// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	LEGACY_INPUT_DIGEST,
	readJianyingFilterVerificationRecords,
	readJianyingFilterVerifications,
	saveJianyingFilterVerification,
} from "../jianying-filter-verification-store.js";

const tempDirectories: string[] = [];

async function createStorePath() {
	const directory = await mkdtemp(join(tmpdir(), "qcut-filter-lab-store-"));
	tempDirectories.push(directory);
	const nested = join(directory, "nested");
	await mkdir(nested);
	return join(nested, "verifications.json");
}

function record({
	resourceId,
	rgbRmse,
}: {
	resourceId: string;
	rgbRmse: number;
}) {
	return {
		resourceId,
		version: "v1",
		status: "close" as const,
		width: 16,
		height: 9,
		rgbRmse,
		referenceSha256: "a".repeat(64),
		candidateSha256: "b".repeat(64),
		verifiedAt: "2026-08-11T00:00:00.000Z",
	};
}

afterEach(async () => {
	await Promise.all(
		tempDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying Filter Lab verification store", () => {
	it("atomically upserts one record per composite identity", async () => {
		const storePath = await createStorePath();
		await saveJianyingFilterVerification({
			storePath,
			record: record({ resourceId: "one", rgbRmse: 2 }),
		});
		await saveJianyingFilterVerification({
			storePath,
			record: record({ resourceId: "two", rgbRmse: 3 }),
		});
		await saveJianyingFilterVerification({
			storePath,
			record: record({ resourceId: "one", rgbRmse: 1 }),
		});
		const records = await readJianyingFilterVerifications({ storePath });
		expect(records).toHaveLength(2);
		expect(records.get("one")).toEqual([
			expect.objectContaining({ rgbRmse: 1, version: "v1" }),
		]);
		const persisted = JSON.parse(await readFile(storePath, "utf8")) as {
			schemaVersion: number;
			records: unknown[];
		};
		expect(persisted).toMatchObject({ schemaVersion: 2 });
		expect(persisted.records).toHaveLength(2);
	});

	it("keeps history for distinct inputs of the same resource (v2)", async () => {
		const storePath = await createStorePath();
		await saveJianyingFilterVerification({
			storePath,
			record: record({ resourceId: "one", rgbRmse: 2 }),
		});
		// Same card, different comparison material → a new history entry.
		await saveJianyingFilterVerification({
			storePath,
			record: {
				...record({ resourceId: "one", rgbRmse: 5 }),
				candidateSha256: "c".repeat(64),
				verifiedAt: "2026-08-12T00:00:00.000Z",
			},
		});
		const all = await readJianyingFilterVerificationRecords({ storePath });
		expect(all).toHaveLength(2);
		// The catalog sees one candidate per version, choosing the latest input.
		const latest = await readJianyingFilterVerifications({ storePath });
		expect(latest.size).toBe(1);
		expect(latest.get("one")).toEqual([
			expect.objectContaining({ rgbRmse: 5, version: "v1" }),
		]);
	});

	it("keeps concurrent saves instead of losing read-modify-write updates", async () => {
		const storePath = await createStorePath();
		const records = Array.from({ length: 20 }, (_, index) => ({
			...record({ resourceId: `resource-${index}`, rgbRmse: index + 1 }),
			verifiedAt: `2026-08-12T00:00:${String(index).padStart(2, "0")}.000Z`,
		}));
		await Promise.all(
			records.map((candidate) =>
				saveJianyingFilterVerification({ record: candidate, storePath })
			)
		);

		const saved = await readJianyingFilterVerificationRecords({ storePath });
		expect(saved).toHaveLength(records.length);
		expect(new Set(saved.map(({ resourceId }) => resourceId)).size).toBe(
			records.length
		);
		expect(
			await readFile(`${storePath}.lock`, "utf8").catch(
				(error: NodeJS.ErrnoException) => error.code
			)
		).toBe("ENOENT");
	});

	it("migrates a v1 store without losing records", async () => {
		const storePath = await createStorePath();
		await writeFile(
			storePath,
			JSON.stringify({
				schemaVersion: 1,
				records: [record({ resourceId: "old", rgbRmse: 3 })],
			})
		);
		const all = await readJianyingFilterVerificationRecords({ storePath });
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({
			resourceId: "old",
			inputDigest: LEGACY_INPUT_DIGEST,
		});
		// A save on top of the migrated store keeps the legacy record.
		await saveJianyingFilterVerification({
			storePath,
			record: {
				...record({ resourceId: "old", rgbRmse: 1 }),
				verifiedAt: "2026-08-12T00:00:00.000Z",
			},
		});
		const persisted = JSON.parse(await readFile(storePath, "utf8")) as {
			schemaVersion: number;
			records: { inputDigest?: string }[];
		};
		expect(persisted.schemaVersion).toBe(2);
		expect(persisted.records).toHaveLength(2);
		expect(
			persisted.records.some(
				(entry) => entry.inputDigest === LEGACY_INPUT_DIGEST
			)
		).toBe(true);
	});

	it("does not expose malformed state to the catalog", async () => {
		const storePath = await createStorePath();
		await writeFile(storePath, '{"schemaVersion":99,"records":[]}');
		const warning = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const records = await readJianyingFilterVerifications({ storePath });
		expect(records.size).toBe(0);
		expect(warning).toHaveBeenCalledOnce();
		warning.mockRestore();
	});
});
