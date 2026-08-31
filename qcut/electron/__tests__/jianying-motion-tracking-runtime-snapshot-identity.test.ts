// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtimeSnapshotIdentity } from "../jianying-motion-tracking/runtime-snapshot-identity.js";

const temporaryDirectories: string[] = [];

async function temporarySnapshot() {
	const snapshotPath = await mkdtemp(
		path.join(os.tmpdir(), "qcut-runtime-identity-test-")
	);
	temporaryDirectories.push(snapshotPath);
	await writeFile(path.join(snapshotPath, "manifest.json"), "manifest-a");
	await writeFile(path.join(snapshotPath, "runtime.bin"), "payload-a");
	return snapshotPath;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("Jianying runtime snapshot identity", () => {
	it("changes when same-sized runtime contents are replaced", async () => {
		const snapshotPath = await temporarySnapshot();
		const first = await runtimeSnapshotIdentity({
			relativePaths: ["runtime.bin"],
			snapshotPath,
		});
		await writeFile(path.join(snapshotPath, "runtime.bin"), "payload-b");
		const second = await runtimeSnapshotIdentity({
			relativePaths: ["runtime.bin"],
			snapshotPath,
		});

		expect(second).not.toBe(first);
	});

	it("changes when the manifest changes", async () => {
		const snapshotPath = await temporarySnapshot();
		const first = await runtimeSnapshotIdentity({
			relativePaths: ["runtime.bin"],
			snapshotPath,
		});
		await writeFile(path.join(snapshotPath, "manifest.json"), "manifest-b");
		const second = await runtimeSnapshotIdentity({
			relativePaths: ["runtime.bin"],
			snapshotPath,
		});

		expect(second).not.toBe(first);
	});
});
