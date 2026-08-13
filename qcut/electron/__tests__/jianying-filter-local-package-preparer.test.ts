import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	jianyingFilterPackagePreparerTestUtils,
	prepareJianyingNativeMultiPassPackage,
	supportsJianyingNativeMultiPass,
} from "../jianying-filter-local-runtime/package-preparer.js";

const temporaryDirectories: string[] = [];

async function fixture({
	version,
	script,
}: {
	version: string;
	script: string;
}) {
	const root = await mkdtemp(
		path.join(os.tmpdir(), "qcut-filter-package-test-")
	);
	temporaryDirectories.push(root);
	const packagePath = path.join(root, version);
	const luaDirectory = path.join(packagePath, "AmazingFeature", "lua");
	await mkdir(luaDirectory, { recursive: true });
	await writeFile(path.join(luaDirectory, "SeekModeScript.lua"), script);
	return { root, packagePath };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying native multi-pass package preparation", () => {
	it("only advertises pinned resource and version pairs", () => {
		expect(
			supportsJianyingNativeMultiPass({
				resourceId: "7403664041945681191",
				version: "59f14f9555fc38667c3ddb0814346cc8",
			})
		).toBe(true);
		expect(
			supportsJianyingNativeMultiPass({
				resourceId: "7403664041945681191",
				version: "changed",
			})
		).toBe(false);
		expect(
			supportsJianyingNativeMultiPass({
				resourceId: "7447126702137904420",
				version: "9673f80b8e2f5a07f02f9ce1130b784a",
			})
		).toBe(true);
	});

	it("rejects a package whose script no longer matches the verified hash", async () => {
		const { root, packagePath } = await fixture({
			version: "59f14f9555fc38667c3ddb0814346cc8",
			script: "changed",
		});
		await expect(
			prepareJianyingNativeMultiPassPackage({
				resourceId: "7403664041945681191",
				packagePath,
				destinationDirectory: root,
				intensity: 100,
			})
		).rejects.toThrow("changed since verification");
	});

	it("rejects a changed package for an unchanged-package profile", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "qcut-filter-package-test-")
		);
		temporaryDirectories.push(root);
		const packagePath = path.join(root, "9673f80b8e2f5a07f02f9ce1130b784a");
		await mkdir(packagePath, { recursive: true });
		await writeFile(path.join(packagePath, "changed"), "package");

		await expect(
			prepareJianyingNativeMultiPassPackage({
				resourceId: "7447126702137904420",
				packagePath,
				destinationDirectory: root,
				intensity: 100,
			})
		).rejects.toThrow("changed since verification");
	});

	it("hashes package trees independently of file creation order", async () => {
		const roots = await Promise.all(
			["left", "right"].map(async (name) => {
				const root = await mkdtemp(
					path.join(os.tmpdir(), `qcut-filter-package-${name}-`)
				);
				temporaryDirectories.push(root);
				return root;
			})
		);
		await mkdir(path.join(roots[0], "nested"));
		await writeFile(path.join(roots[0], "a"), "first");
		await writeFile(path.join(roots[0], "nested", "b"), "second");
		await mkdir(path.join(roots[1], "nested"));
		await writeFile(path.join(roots[1], "nested", "b"), "second");
		await writeFile(path.join(roots[1], "a"), "first");

		await expect(
			jianyingFilterPackagePreparerTestUtils.hashPackageTree({ root: roots[0] })
		).resolves.toBe(
			await jianyingFilterPackagePreparerTestUtils.hashPackageTree({
				root: roots[1],
			})
		);
	});

	it("maps one UI intensity into every fog pass", () => {
		const source =
			'    self.pass2Material = comp.entity:getComponent("MeshRenderer").material\n';
		const prepared = jianyingFilterPackagePreparerTestUtils.bootstrap({
			resourceId: "7160594413847203085",
			source,
			intensity: 0.5,
		});
		expect(prepared).toContain('setFloat("intensity", 0.75)');
		expect(prepared.match(/setFloat\("blurSize", 1\.8\)/g)).toHaveLength(2);
		expect(prepared).toContain('filterMaterial:setFloat("intensity", 0.5)');
	});

	it("rejects ambiguous bootstrap anchors", () => {
		const anchor = "    data.intensity = 1\n";
		expect(() =>
			jianyingFilterPackagePreparerTestUtils.bootstrap({
				resourceId: "7647099764940557618",
				source: `${anchor}${anchor}`,
				intensity: 1,
			})
		).toThrow("missing or ambiguous");
	});
});
