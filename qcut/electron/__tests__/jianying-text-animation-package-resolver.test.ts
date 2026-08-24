// @vitest-environment node
import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JianyingTextAnimationReferences } from "../jianying-text-runtime-contract.js";
import {
	JianyingTextAnimationPackageError,
	resolveJianyingTextAnimations,
} from "../jianying-text-runtime/animation-package-resolver.js";

const RESOURCE_ID = "7179135028343870012";
const PACKAGE_HASH = "a".repeat(32);

function animationReferences(): JianyingTextAnimationReferences {
	return {
		loop: {
			source: "jianying-cache",
			resourceId: RESOURCE_ID,
			packageHash: PACKAGE_HASH,
			duration: 1.25,
		},
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

async function writeSyntheticAnimationPackage({
	cacheRoot,
	linkType = "InfoSticker",
	shaderSource = "uniform sampler2D lastTex; void main() {}",
}: {
	cacheRoot: string;
	linkType?: "AmazingFeature" | "InfoSticker" | "TextAnimation";
	shaderSource?: string;
}) {
	const packagePath = path.join(cacheRoot, "effect", RESOURCE_ID, PACKAGE_HASH);
	await mkdir(packagePath, { recursive: true });
	await Promise.all([
		writeJson({
			filePath: path.join(packagePath, "config.json"),
			value: {
				version: "12.4.0",
				effect: { Link: [{ type: linkType }] },
			},
		}),
		writeFile(path.join(packagePath, "TextAnim.lua"), "Camera perspective"),
		writeFile(path.join(packagePath, "effect.frag"), shaderSource),
		writeFile(path.join(packagePath, "Cylinder.mesh"), "synthetic-mesh"),
		writeFile(path.join(packagePath, "history.rt"), "synthetic-rt"),
		writeFile(path.join(packagePath, "surface.texture"), "synthetic-texture"),
	]);
	return packagePath;
}

async function writeSyntheticStudioAnimationPackage({
	cacheRoot,
}: {
	cacheRoot: string;
}) {
	const packagePath = path.join(cacheRoot, "effect", RESOURCE_ID, PACKAGE_HASH);
	await mkdir(packagePath, { recursive: true });
	await Promise.all([
		writeJson({
			filePath: path.join(packagePath, "config.json"),
			value: {
				encrypt: 0,
				script_type: "js",
				studio_animation_path: "/studioAnim.lsanim",
				version: "20.2.0",
			},
		}),
		writeFile(path.join(packagePath, "studioAnim.lsanim"), "animation"),
		writeFile(path.join(packagePath, "textAnim.lsproj"), "project"),
	]);
	return packagePath;
}

describe("Jianying text animation package resolver", () => {
	it("resolves exact packages and classifies shader, 3D, and feedback components", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-text-animation-")
		);
		try {
			const packagePath = await writeSyntheticAnimationPackage({
				cacheRoot: temporary,
			});
			const resolvedPackagePath = await realpath(packagePath);
			const first = await resolveJianyingTextAnimations({
				animations: animationReferences(),
				cacheRoot: temporary,
			});

			expect(first).toMatchObject({
				values: [
					{
						slot: "loop",
						animationType: 3,
						loader: "component",
						packagePath: resolvedPackagePath,
						resourceId: RESOURCE_ID,
						packageHash: PACKAGE_HASH,
						duration: 1.25,
						manifest: {
							packageVersion: "12.4.0",
							meshFileCount: 1,
							renderTargetCount: 1,
							textureFileCount: 1,
						},
					},
				],
				capabilities: {
					animationComponents: true,
					shaderComponents: true,
					threeDimensional: true,
					feedbackComponents: true,
				},
			});

			await writeFile(
				path.join(packagePath, "effect.frag"),
				"uniform sampler2D lastTex; void main() { /* changed */ }"
			);
			const changed = await resolveJianyingTextAnimations({
				animations: animationReferences(),
				cacheRoot: temporary,
			});
			expect(changed.fingerprint).not.toBe(first.fingerprint);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("resolves AmazingFeature component animations", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-amazing-animation-")
		);
		try {
			const packagePath = await writeSyntheticAnimationPackage({
				cacheRoot: temporary,
				linkType: "AmazingFeature",
			});
			const result = await resolveJianyingTextAnimations({
				animations: animationReferences(),
				cacheRoot: temporary,
			});

			expect(result.values[0]).toMatchObject({
				loader: "component",
				packagePath: await realpath(packagePath),
				resourceId: RESOURCE_ID,
				slot: "loop",
			});
			expect(result.capabilities).toMatchObject({
				animationComponents: true,
				shaderComponents: true,
				threeDimensional: true,
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("reports an exact missing animation hash as a dependency", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-text-animation-missing-")
		);
		try {
			await mkdir(path.join(temporary, "effect"), { recursive: true });
			await expect(
				resolveJianyingTextAnimations({
					animations: animationReferences(),
					cacheRoot: temporary,
				})
			).rejects.toMatchObject({
				code: "dependency-missing",
				dependency: { resourceId: RESOURCE_ID, role: "animation" },
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("resolves studio animation documents without an effect Link", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-studio-animation-")
		);
		try {
			const packagePath = await writeSyntheticStudioAnimationPackage({
				cacheRoot: temporary,
			});
			const result = await resolveJianyingTextAnimations({
				animations: animationReferences(),
				cacheRoot: temporary,
			});

			expect(result.values[0]).toMatchObject({
				loader: "studio",
				packagePath: await realpath(packagePath),
				resourceId: RESOURCE_ID,
				slot: "loop",
			});
			expect(result.capabilities.animationComponents).toBe(true);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("rejects incomplete studio animation document packages", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-studio-animation-invalid-")
		);
		try {
			const packagePath = await writeSyntheticStudioAnimationPackage({
				cacheRoot: temporary,
			});
			await rm(path.join(packagePath, "textAnim.lsproj"));

			await expect(
				resolveJianyingTextAnimations({
					animations: animationReferences(),
					cacheRoot: temporary,
				})
			).rejects.toMatchObject({ code: "package-invalid" });
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("rejects an animation package symlink outside the effect cache", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-text-animation-escape-")
		);
		try {
			const outside = path.join(temporary, "outside");
			await writeJson({
				filePath: path.join(outside, "config.json"),
				value: { effect: { Link: [{ type: "InfoSticker" }] } },
			});
			const linkPath = path.join(
				temporary,
				"Cache",
				"effect",
				RESOURCE_ID,
				PACKAGE_HASH
			);
			await mkdir(path.dirname(linkPath), { recursive: true });
			await symlink(outside, linkPath);

			await expect(
				resolveJianyingTextAnimations({
					animations: animationReferences(),
					cacheRoot: path.join(temporary, "Cache"),
				})
			).rejects.toBeInstanceOf(JianyingTextAnimationPackageError);
			await expect(
				resolveJianyingTextAnimations({
					animations: animationReferences(),
					cacheRoot: path.join(temporary, "Cache"),
				})
			).rejects.toMatchObject({ code: "package-invalid" });
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
