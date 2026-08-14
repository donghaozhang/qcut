// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	parseMachOUuidOutput,
	verifyPackagedJianyingTextRuntimeBridge,
} from "../verify-packaged-jianying-text-runtime-bridge.js";

const BRIDGE_NAME = "jianying-text-runtime-bridge";
const temporaryDirectories: string[] = [];

async function createFixture({
	packagedContents = "bridge-v1",
}: {
	packagedContents?: string;
} = {}) {
	const projectRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-packaged-text-bridge-")
	);
	temporaryDirectories.push(projectRoot);
	const distRoot = path.join(projectRoot, "dist-electron");
	const stagedPath = path.join(
		projectRoot,
		"electron",
		"resources",
		"bin",
		BRIDGE_NAME
	);
	const packagedPath = path.join(
		distRoot,
		"mac-arm64",
		"QCut AI Video Editor.app",
		"Contents",
		"Resources",
		"bin",
		BRIDGE_NAME
	);
	await Promise.all([
		mkdir(path.dirname(stagedPath), { recursive: true }),
		mkdir(path.dirname(packagedPath), { recursive: true }),
	]);
	await Promise.all([
		writeFile(stagedPath, "bridge-v1"),
		writeFile(packagedPath, packagedContents),
	]);
	await Promise.all([chmod(stagedPath, 0o755), chmod(packagedPath, 0o755)]);
	return { distRoot, packagedPath, projectRoot };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("packaged Jianying text runtime bridge verification", () => {
	it("normalizes Mach-O UUIDs by architecture", () => {
		expect(
			parseMachOUuidOutput({
				output: [
					"UUID: AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE (x86_64) bridge",
					"UUID: 11111111-2222-3333-4444-555555555555 (arm64) bridge",
				].join("\n"),
			})
		).toEqual([
			"arm64:11111111-2222-3333-4444-555555555555",
			"x86_64:AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
		]);
	});

	it("accepts the exact executable staged by the current build", async () => {
		const fixture = await createFixture();
		await expect(
			verifyPackagedJianyingTextRuntimeBridge(fixture)
		).resolves.toBe(fixture.packagedPath);
	});

	it("rejects a stale bridge inside the packaged application", async () => {
		const fixture = await createFixture({ packagedContents: "stale-bridge" });
		await expect(
			verifyPackagedJianyingTextRuntimeBridge(fixture)
		).rejects.toThrow("differs from the staged binary");
	});
});
