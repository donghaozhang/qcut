import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	collectJianyingScriptResourceReferences,
	resolveJianyingScriptResources,
} from "../jianying-text-runtime/script-dependencies.js";

async function writeJson({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(value), "utf8");
}

async function createResourcePackage({
	cacheRoot,
	container,
	resourceId,
	version,
	modifiedAt,
}: {
	cacheRoot: string;
	container: "artistEffect" | "effect";
	resourceId: string;
	version: string;
	modifiedAt: Date;
}) {
	const packagePath = path.join(cacheRoot, container, resourceId, version);
	await writeJson({
		filePath: path.join(packagePath, "config.json"),
		value: { resourceId },
	});
	await utimes(packagePath, modifiedAt, modifiedAt);
	return realpath(packagePath);
}

describe("Jianying script resource dependencies", () => {
	it("collects unique animation and sticker references from nested content", () => {
		expect(
			collectJianyingScriptResourceReferences({
				value: {
					children: [
						{ anim_resource_id: "1001" },
						{
							children: [
								{ anim_resource_id: "1001" },
								{ sticker_resource_id: "2002" },
							],
						},
					],
				},
			})
		).toEqual([
			{ resourceId: "1001", role: "animation" },
			{ resourceId: "2002", role: "sticker" },
		]);
	});

	it("rejects malformed resource IDs instead of resolving arbitrary paths", () => {
		expect(() =>
			collectJianyingScriptResourceReferences({
				value: { anim_resource_id: "../outside" },
			})
		).toThrow("anim_resource_id is invalid");
	});

	it("resolves the newest readable animation and artist sticker packages", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-dependencies-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "Cache");
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						children: [
							{ anim_resource_id: "1001", anim_resource_path: "" },
							{ sticker_resource_id: "2002", sticker_path: "" },
						],
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "extra.json"),
					value: {
						depend_resource_list: [
							{ resource_id: "2002", source: 1, type: "default" },
						],
					},
				}),
			]);
			const [oldAnimation, newAnimation, sticker] = await Promise.all([
				createResourcePackage({
					cacheRoot,
					container: "effect",
					resourceId: "1001",
					version: "old",
					modifiedAt: new Date("2024-01-01T00:00:00Z"),
				}),
				createResourcePackage({
					cacheRoot,
					container: "effect",
					resourceId: "1001",
					version: "new",
					modifiedAt: new Date("2025-01-01T00:00:00Z"),
				}),
				createResourcePackage({
					cacheRoot,
					container: "artistEffect",
					resourceId: "2002",
					version: "sticker",
					modifiedAt: new Date("2025-02-01T00:00:00Z"),
				}),
			]);
			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});
			expect(result.missing).toEqual([]);
			expect(result.resourcePaths).toEqual({
				"1001": newAnimation,
				"2002": sticker,
			});
			expect(result.resourcePaths["1001"]).not.toBe(oldAnimation);
			expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("reports every unresolved dependency without storing a path", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-missing-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			await writeJson({
				filePath: path.join(packagePath, "content.json"),
				value: {
					children: [
						{ anim_resource_id: "1001" },
						{ sticker_resource_id: "2002" },
					],
				},
			});
			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot: path.join(temporary, "Cache"),
			});
			expect(result.resourcePaths).toEqual({});
			expect(result.missing).toEqual([
				{ resourceId: "1001", role: "animation" },
				{ resourceId: "2002", role: "sticker" },
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
