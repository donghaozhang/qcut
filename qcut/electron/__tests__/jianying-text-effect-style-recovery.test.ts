// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import { resolveJianyingEffectStyleWithRecovery } from "../jianying-text-runtime/package-recovery.js";

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

function reference(): JianyingTextRuntimeReference {
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "TextStyle",
		resourceId: "7328639616670649634",
		packageHash: "a".repeat(32),
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	};
}

async function writeTextStylePackage({
	packagePath,
	texturePath,
	writeTexture,
}: {
	packagePath: string;
	texturePath: string;
	writeTexture: boolean;
}) {
	await Promise.all([
		writeJson({
			filePath: path.join(packagePath, "config.json"),
			value: { effect: { Link: [{ type: "TextStyle" }] } },
		}),
		writeJson({
			filePath: path.join(packagePath, "effectStyle.json"),
			value: {
				version: 3,
				fill: {
					content: {
						render_type: "texture",
						texture: { path: texturePath },
					},
				},
				strokes: [],
				inner_shadows: [],
				shadows: [],
			},
		}),
	]);
	if (writeTexture) {
		const filePath = path.join(packagePath, texturePath);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, "texture");
	}
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("Jianying TextStyle recovery", () => {
	it("replaces an incomplete source package with a complete recovered copy", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-effect-style-recovery-")
		);
		try {
			const sourcePackage = path.join(temporary, "source");
			const recoveredPackage = path.join(temporary, "recovered");
			await Promise.all([
				writeTextStylePackage({
					packagePath: sourcePackage,
					texturePath: "textures/fill.png",
					writeTexture: false,
				}),
				writeTextStylePackage({
					packagePath: recoveredPackage,
					texturePath: "textures/fill.png",
					writeTexture: true,
				}),
			]);
			const recoverRootPackage = vi.fn(async () => recoveredPackage);

			const result = await resolveJianyingEffectStyleWithRecovery({
				cacheRoot: temporary,
				packagePath: sourcePackage,
				recoverRootPackage,
				recoveryRoot: path.join(temporary, "private-cache"),
				reference: reference(),
			});

			expect(result.packagePath).toBe(recoveredPackage);
			expect(result.inspection.state).toBe("ready");
			expect(result.inspection.manifest?.textures).toEqual([
				{ relativePath: "textures/fill.png", state: "ready" },
			]);
			expect(recoverRootPackage).toHaveBeenCalledOnce();
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("does not redownload an intentionally pathless texture layer", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-effect-style-pathless-")
		);
		try {
			await writeTextStylePackage({
				packagePath: temporary,
				texturePath: "",
				writeTexture: false,
			});
			const recoverRootPackage = vi.fn(async () => null);

			const result = await resolveJianyingEffectStyleWithRecovery({
				cacheRoot: temporary,
				packagePath: temporary,
				recoverRootPackage,
				recoveryRoot: path.join(temporary, "private-cache"),
				reference: reference(),
			});

			expect(result.inspection.diagnostics).toMatchObject([
				{ code: "effect-style-texture-path-missing" },
			]);
			expect(recoverRootPackage).not.toHaveBeenCalled();
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
