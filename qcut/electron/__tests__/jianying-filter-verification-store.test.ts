// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
	it("atomically upserts one record per resource", async () => {
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
		expect(records.get("one")).toMatchObject({ rgbRmse: 1, version: "v1" });
		const persisted = JSON.parse(await readFile(storePath, "utf8")) as {
			schemaVersion: number;
			records: unknown[];
		};
		expect(persisted).toMatchObject({ schemaVersion: 1 });
		expect(persisted.records).toHaveLength(2);
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
