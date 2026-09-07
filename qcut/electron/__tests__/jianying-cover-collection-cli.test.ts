import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execute = promisify(execFile);
const directories: string[] = [];
let bundle: string;
const webp = Buffer.from(
	"UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
	"base64"
);
const definition = JSON.stringify({
	cover: { cover_draft: { materials: { texts: [] }, tracks: [] } },
});

async function temporary() {
	const directory = await realpath(
		await mkdtemp(path.join(tmpdir(), "qcut-cover-collection-"))
	);
	directories.push(directory);
	return directory;
}

beforeAll(async () => {
	bundle = path.join(await temporary(), "collect.mjs");
	await execute(
		"bun",
		[
			"build",
			"scripts/collect-jianying-covers.ts",
			"--target=node",
			`--outfile=${bundle}`,
		],
		{ cwd: process.cwd() }
	);
});
afterAll(async () => {
	await Promise.all(
		directories.map((directory) =>
			rm(directory, { recursive: true, force: true })
		)
	);
});

async function fixture() {
	const directory = await temporary();
	const source = path.join(directory, "source");
	const destination = path.join(directory, "owned");
	const backup = path.join(directory, "backup");
	const observations = path.join(directory, "observations.json");
	const first = {
		packageHash: "a".repeat(32),
		previewHash: "b".repeat(32),
		title: "First",
		categories: ["recommended", "life"],
		evidence: "native-ui-and-template-content",
	};
	const second = {
		...first,
		packageHash: "c".repeat(32),
		title: "Second",
		categories: ["games"],
	};
	await mkdir(path.join(source, "image"), { recursive: true });
	await writeFile(path.join(source, "image", first.previewHash), webp);
	await Promise.all(
		[first, second].map(async (entry) => {
			const folder = path.join(source, "template", entry.packageHash);
			await mkdir(folder, { recursive: true });
			await writeFile(path.join(folder, "template.json"), definition);
		})
	);
	await writeFile(observations, JSON.stringify([first, first, second]));
	const run = ({ extra = [] }: { extra?: string[] } = {}) =>
		execute("node", [
			bundle,
			"--source",
			source,
			"--destination",
			destination,
			"--backup",
			backup,
			"--observations",
			observations,
			"--batch-size",
			"1",
			...extra,
		]);
	const report = async ({ root = destination }: { root?: string } = {}) =>
		JSON.parse(
			await readFile(path.join(root, "collection-report.json"), "utf8")
		);
	return {
		directory,
		source,
		destination,
		backup,
		observations,
		first,
		second,
		run,
		report,
	};
}

describe("cover collection CLI", () => {
	it("persists and backs up verified evidence bytes for later source-independent audits", async () => {
		const data = await fixture();
		await data.run();
		const receipts = path.join(data.directory, "receipts.json");
		const bytes = Buffer.from("fixture evidence");
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		await writeFile(path.join(data.directory, "proof.png"), bytes);
		await writeFile(
			receipts,
			JSON.stringify([
				{
					packageHash: data.first.packageHash,
					fingerprint: (await data.report()).entries[0].fingerprint,
					scope: "text-layout-render-save-reopen",
					verifiedAt: "2026-09-06T05:00:00.000Z",
					runtime: "fixture-no-render-claim",
					artifacts: [{ path: "proof.png", sha256 }],
				},
			])
		);
		await data.run({
			extra: [
				"--audit-only",
				"--verification",
				receipts,
				"--evidence-root",
				data.directory,
			],
		});
		expect(
			await readFile(path.join(data.backup, "collection-evidence", sha256))
		).toEqual(bytes);
		await rm(path.join(data.directory, "proof.png"));
		const secondBytes = Buffer.from("second batch evidence");
		const secondSha = createHash("sha256").update(secondBytes).digest("hex");
		await writeFile(path.join(data.directory, "second.png"), secondBytes);
		await writeFile(
			receipts,
			JSON.stringify([
				{
					packageHash: data.second.packageHash,
					fingerprint: (await data.report()).entries[1].fingerprint,
					scope: "text-layout-render-save-reopen",
					verifiedAt: "2026-09-06T06:00:00.000Z",
					runtime: "fixture-no-render-claim",
					artifacts: [{ path: "second.png", sha256: secondSha }],
				},
			])
		);
		const importOptions = {
			extra: [
				"--audit-only",
				"--verification",
				receipts,
				"--evidence-root",
				data.directory,
			],
		};
		await data.run(importOptions);
		await data.run(importOptions);
		await rm(path.join(data.directory, "second.png"));
		await data.run({ extra: ["--audit-only"] });
		expect(
			JSON.parse(
				await readFile(
					path.join(data.destination, "collection-verifications.json"),
					"utf8"
				)
			)
		).toHaveLength(2);
		expect(
			await readFile(path.join(data.backup, "collection-verifications.json"))
		).toEqual(
			await readFile(
				path.join(data.destination, "collection-verifications.json")
			)
		);
		expect(
			await readFile(path.join(data.backup, "collection-evidence", secondSha))
		).toEqual(secondBytes);
		expect((await data.report()).totals.verified).toBe(0);
	});
	it("merges new categories into cached cards without redownloading", async () => {
		const data = await fixture();
		await data.run();
		await writeFile(
			data.observations,
			JSON.stringify([{ ...data.first, categories: ["film"] }])
		);
		await data.run();
		expect((await data.report()).batches).toHaveLength(0);
		const catalog = JSON.parse(
			await readFile(path.join(data.backup, "catalog.json"), "utf8")
		);
		expect(catalog.entries[0].categories).toEqual([
			"recommended",
			"life",
			"film",
		]);
	});
	it("imports unique packages in category batches and verifies an independent backup", async () => {
		const data = await fixture();
		await data.run();
		const report = await data.report();
		expect(report.totals).toMatchObject({
			discovered: 2,
			cached: 2,
			applicable: 0,
			verified: 0,
		});
		expect(
			report.batches.map((batch: { category: string }) => batch.category)
		).toEqual(["recommended", "games"]);
		expect(await data.report({ root: data.backup })).toEqual(report);
		await rm(data.source, { recursive: true });
		await data.run({ extra: ["--audit-only"] });
		expect((await data.report()).totals.cached).toBe(2);
	});
	it("retains completed batches when a later definition is missing and resumes without duplicates", async () => {
		const data = await fixture();
		const filename = path.join(
			data.source,
			"template",
			data.second.packageHash,
			"template.json"
		);
		await rm(filename);
		await expect(data.run()).rejects.toThrow();
		const stopped = await data.report();
		expect(stopped.status).toBe("stopped-after-batch-failure");
		expect(stopped.totals).toMatchObject({ discovered: 2, cached: 1 });
		expect(
			stopped.batches.map((batch: { status: string }) => batch.status)
		).toEqual(["cached-and-backup-verified", "failed"]);
		await writeFile(filename, definition);
		await data.run();
		expect((await data.report()).batches).toHaveLength(1);
		expect((await data.report()).totals.cached).toBe(2);
	});
	it("does not remove another collector's lock", async () => {
		const data = await fixture();
		await mkdir(data.destination);
		const lock = path.join(data.destination, ".collection.lock");
		await writeFile(lock, "another collector");
		await expect(data.run()).rejects.toThrow();
		expect(await readFile(lock, "utf8")).toBe("another collector");
	});
	it("rejects corrupt verification artifacts before publishing discovery metadata", async () => {
		const data = await fixture();
		const receipts = path.join(data.directory, "receipts.json");
		await writeFile(
			path.join(data.directory, "proof.png"),
			"not the recorded bytes"
		);
		await writeFile(
			receipts,
			JSON.stringify([
				{
					packageHash: data.first.packageHash,
					fingerprint: "e".repeat(64),
					scope: "text-layout-render-save-reopen",
					verifiedAt: "2026-09-06T05:00:00.000Z",
					runtime: "test",
					artifacts: [{ path: "proof.png", sha256: "f".repeat(64) }],
				},
			])
		);
		await expect(
			data.run({
				extra: ["--verification", receipts, "--evidence-root", data.directory],
			})
		).rejects.toThrow("Evidence checksum mismatch");
		await expect(
			readFile(path.join(data.destination, "collection-observations.json"))
		).rejects.toThrow();
	});
});
