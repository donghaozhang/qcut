// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveJianyingScriptResources } from "../jianying-text-runtime/script-dependencies.js";

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

describe("Jianying recovered text dependencies", () => {
	it("uses a QCut recovery root without modifying the Jianying cache", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-recovered-dependency-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "JianyingCache");
			const recoveryRoot = path.join(temporary, "QCutRecovery");
			const recoveredPackage = path.join(
				recoveryRoot,
				"effect",
				"6897084405781631496",
				"a".repeat(32)
			);
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						children: [{ anim_resource_id: "6897084405781631496" }],
					},
				}),
				writeJson({
					filePath: path.join(recoveredPackage, "config.json"),
					value: { effect: { Link: [{ type: "TextAnimation" }] } },
				}),
			]);

			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
				additionalCacheRoots: [recoveryRoot],
			});

			expect(result.missing).toEqual([]);
			expect(result.resourcePaths).toEqual({
				"6897084405781631496": await realpath(recoveredPackage),
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
