import {
	lstat,
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
	ensureQCutEffectOfflineRuntime,
	isReadyQCutEffectOfflineRuntime,
	qcutEffectOfflineRuntimeTestUtils,
} from "../jianying-effect/offline-runtime.js";

const CORE_UUID = "D6342ECD-5432-33F0-A2AD-0C28F5699994";
const REQUIRED_FRAMEWORKS = [
	"libAGFX.dylib",
	"libEGL.dylib",
	"libGLESv2.dylib",
	"libLumiGeneRuntime.dylib",
	"libcccreator.dylib",
];
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "qcut-effect-offline-"));
	temporaryRoots.push(root);
	return root;
}

async function createRuntimeSources({
	root,
}: {
	root: string;
}): Promise<{ appBundlePath: string; userModelDirectory: string }> {
	const appBundlePath = path.join(root, "VideoFusion-macOS.app");
	const frameworks = path.join(appBundlePath, "Contents", "Frameworks");
	const resources = path.join(appBundlePath, "Contents", "Resources");
	const userModelDirectory = path.join(root, "user-models");
	await Promise.all([
		mkdir(frameworks, { recursive: true }),
		mkdir(path.join(resources, "lumi_js_resources"), { recursive: true }),
		mkdir(path.join(resources, "models", "face"), { recursive: true }),
		mkdir(userModelDirectory, { recursive: true }),
	]);
	await Promise.all([
		...REQUIRED_FRAMEWORKS.map((name) =>
			writeFile(path.join(frameworks, name), name, "utf8")
		),
		writeFile(
			path.join(frameworks, "libdependency.dylib"),
			"dependency",
			"utf8"
		),
		writeFile(
			path.join(resources, "lumi_js_resources", "runtime.js"),
			"runtime",
			"utf8"
		),
		writeFile(
			path.join(resources, "models", "face", "face.model"),
			"face",
			"utf8"
		),
		writeFile(
			path.join(userModelDirectory, "matting.model"),
			"matting",
			"utf8"
		),
	]);
	return { appBundlePath, userModelDirectory };
}

async function createPrivateRuntimeCandidate({
	privateRuntimeRoot,
	name,
	marker,
}: {
	privateRuntimeRoot: string;
	name: string;
	marker: string;
}): Promise<string> {
	const runtimeRoot = path.join(privateRuntimeRoot, name);
	const frameworks = path.join(runtimeRoot, "Frameworks");
	await Promise.all([
		mkdir(frameworks, { recursive: true }),
		mkdir(path.join(runtimeRoot, "Resources", "lumi_js_resources"), {
			recursive: true,
		}),
	]);
	await Promise.all([
		...REQUIRED_FRAMEWORKS.map((framework) =>
			writeFile(path.join(frameworks, framework), marker, "utf8")
		),
		writeFile(
			path.join(runtimeRoot, "Resources", "lumi_js_resources", "runtime.js"),
			marker,
			"utf8"
		),
	]);
	return runtimeRoot;
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("QCut effect offline runtime", () => {
	it.skipIf(process.platform !== "darwin")(
		"keeps an independent runtime after its sources disappear",
		async () => {
			const root = await temporaryRoot();
			const sources = await createRuntimeSources({ root });
			const privateRuntimeRoot = path.join(root, "private-runtime");
			const previousSnapshot = path.join(privateRuntimeRoot, "previous");
			await mkdir(path.join(previousSnapshot, "Packages", "transition"), {
				recursive: true,
			});
			await writeFile(
				path.join(previousSnapshot, "Packages", "transition", "config.json"),
				"{}",
				"utf8"
			);
			await symlink(
				"previous",
				path.join(privateRuntimeRoot, "current"),
				"dir"
			);
			const runtimeRoot = await ensureQCutEffectOfflineRuntime({
				...sources,
				privateRuntimeRoot,
				readDependencies: async ({ filePath }) =>
					path.basename(filePath) === "libcccreator.dylib"
						? ["libdependency.dylib"]
						: [],
				readCoreUuid: async () => CORE_UUID,
			});

			await Promise.all([
				rm(sources.appBundlePath, { recursive: true, force: true }),
				rm(sources.userModelDirectory, { recursive: true, force: true }),
				rm(previousSnapshot, { recursive: true, force: true }),
			]);

			expect(await isReadyQCutEffectOfflineRuntime({ runtimeRoot })).toBe(true);
			expect(
				await readFile(
					path.join(runtimeRoot, "Frameworks", "libdependency.dylib"),
					"utf8"
				)
			).toBe("dependency");
			expect(
				await readFile(
					path.join(runtimeRoot, "Models", "user-cache", "matting.model"),
					"utf8"
				)
			).toBe("matting");
			expect(
				await readFile(
					path.join(runtimeRoot, "Packages", "transition", "config.json"),
					"utf8"
				)
			).toBe("{}");
			expect((await lstat(runtimeRoot)).isSymbolicLink()).toBe(true);
			const manifest = JSON.parse(
				await readFile(
					path.join(runtimeRoot, "qcut-effect-runtime.json"),
					"utf8"
				)
			) as { localOnly: boolean; cloudUpload: boolean };
			expect(manifest).toMatchObject({ localOnly: true, cloudUpload: false });
		}
	);

	it.skipIf(process.platform !== "darwin")(
		"rejects an incompatible current runtime in favor of a verified snapshot",
		async () => {
			const root = await temporaryRoot();
			const sources = await createRuntimeSources({ root });
			const privateRuntimeRoot = path.join(root, "private-runtime");
			await createPrivateRuntimeCandidate({
				privateRuntimeRoot,
				name: "incompatible",
				marker: "incompatible",
			});
			await createPrivateRuntimeCandidate({
				privateRuntimeRoot,
				name: "compatible",
				marker: "compatible",
			});
			await symlink(
				"incompatible",
				path.join(privateRuntimeRoot, "current"),
				"dir"
			);

			const runtimeRoot = await ensureQCutEffectOfflineRuntime({
				...sources,
				privateRuntimeRoot,
				readDependencies: async () => [],
				readCoreUuid: async ({ binaryPath }) =>
					(await readFile(binaryPath, "utf8")) === "compatible"
						? CORE_UUID
						: "100726E3-FCB0-31BC-98EE-1B196A1714A3",
			});

			expect(
				await readFile(
					path.join(runtimeRoot, "Frameworks", "libcccreator.dylib"),
					"utf8"
				)
			).toBe("compatible");
			expect(await isReadyQCutEffectOfflineRuntime({ runtimeRoot })).toBe(true);
		}
	);

	it("parses only safe @rpath dylib dependencies", () => {
		expect(
			qcutEffectOfflineRuntimeTestUtils.frameworkDependencyName({
				value: "@rpath/libAGFX.dylib (compatibility version 0.0.0)",
			})
		).toBe("libAGFX.dylib");
		expect(
			qcutEffectOfflineRuntimeTestUtils.frameworkDependencyName({
				value: "@rpath/../escape.dylib (compatibility version 0.0.0)",
			})
		).toBeNull();
		expect(
			qcutEffectOfflineRuntimeTestUtils.frameworkDependencyName({
				value: "/usr/lib/libz.1.dylib (compatibility version 1.0.0)",
			})
		).toBeNull();
	});
});
