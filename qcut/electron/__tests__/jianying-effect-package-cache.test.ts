import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	cacheQCutEffectPackage,
	isReadyQCutEffectPackage,
} from "../jianying-effect/package-cache.js";

const EFFECT_ID = "7399492434700422434";
const PACKAGE_HASH = "e03106b5eeefb8e6674e7506d1c91d41";
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "qcut-effect-package-"));
	temporaryRoots.push(root);
	return root;
}

async function createPackage({ packagePath }: { packagePath: string }) {
	await mkdir(path.join(packagePath, "AmazingFeature", "material"), {
		recursive: true,
	});
	await Promise.all([
		writeFile(path.join(packagePath, "config.json"), "{}", "utf8"),
		writeFile(
			path.join(packagePath, "AmazingFeature", "main.scene"),
			"scene",
			"utf8"
		),
		writeFile(
			path.join(packagePath, "AmazingFeature", "material", "main.material"),
			"material",
			"utf8"
		),
	]);
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("QCut effect package cache", () => {
	it("keeps an independent package after the source cache is removed", async () => {
		const root = await temporaryRoot();
		const sourcePath = path.join(root, "jianying-cache", PACKAGE_HASH);
		const managedRoot = path.join(root, "qcut-cache");
		await createPackage({ packagePath: sourcePath });

		const packagePath = await cacheQCutEffectPackage({
			effectId: EFFECT_ID,
			packageHash: PACKAGE_HASH,
			sourcePath,
			managedRoot,
		});
		await rm(path.join(root, "jianying-cache"), {
			recursive: true,
			force: true,
		});

		expect(await isReadyQCutEffectPackage({ packagePath })).toBe(true);
		expect(
			await readFile(
				path.join(packagePath, "AmazingFeature", "main.scene"),
				"utf8"
			)
		).toBe("scene");
	});

	it("joins concurrent cache fills for the same package", async () => {
		const root = await temporaryRoot();
		const sourcePath = path.join(root, "source", PACKAGE_HASH);
		const managedRoot = path.join(root, "managed");
		await createPackage({ packagePath: sourcePath });
		const request = {
			effectId: EFFECT_ID,
			packageHash: PACKAGE_HASH,
			sourcePath,
			managedRoot,
		};

		const [first, second] = await Promise.all([
			cacheQCutEffectPackage(request),
			cacheQCutEffectPackage(request),
		]);

		expect(first).toBe(second);
		expect(await isReadyQCutEffectPackage({ packagePath: first })).toBe(true);
	});

	it.skipIf(process.platform === "win32")(
		"rejects packages containing symbolic links",
		async () => {
			const root = await temporaryRoot();
			const sourcePath = path.join(root, "source", PACKAGE_HASH);
			await createPackage({ packagePath: sourcePath });
			await symlink(
				path.join(sourcePath, "config.json"),
				path.join(sourcePath, "linked-config.json")
			);

			await expect(
				cacheQCutEffectPackage({
					effectId: EFFECT_ID,
					packageHash: PACKAGE_HASH,
					sourcePath,
					managedRoot: path.join(root, "managed"),
				})
			).rejects.toThrow(/符号链接/);
		}
	);
});
