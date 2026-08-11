// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import { resolveJianyingTextPackage } from "../jianying-text-runtime/package-resolver.js";

const RESOURCE_ID = "7328639616670649634";
const PACKAGE_HASH = "a".repeat(32);

function createReference(): JianyingTextRuntimeReference {
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "ScriptInfoSticker",
		resourceId: RESOURCE_ID,
		packageHash: PACKAGE_HASH,
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	};
}

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

describe("Jianying text package resolver", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("reports missing script dependencies as a first-class package state", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-package-resolver-")
		);
		try {
			const cacheRoot = path.join(temporary, "Cache");
			const artistEffectRoot = path.join(cacheRoot, "artistEffect");
			const packagePath = path.join(
				artistEffectRoot,
				RESOURCE_ID,
				PACKAGE_HASH
			);
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "config.json"),
					value: {
						effect: { Link: [{ type: "ScriptInfoSticker" }] },
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						root: { duration: 3 },
						children: [{ anim_resource_id: "9999" }],
					},
				}),
			]);
			vi.stubEnv("QCUT_JIANYING_TEXT_PACKAGE_ROOT", artistEffectRoot);
			vi.stubEnv("QCUT_JIANYING_CACHE_ROOT", cacheRoot);
			await expect(
				resolveJianyingTextPackage({ reference: createReference() })
			).rejects.toMatchObject({
				code: "dependency-missing",
				missingDependencies: [{ resourceId: "9999", role: "animation" }],
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
