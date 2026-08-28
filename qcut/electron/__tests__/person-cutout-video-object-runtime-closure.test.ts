// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	verifyVideoObjectBachDependencyClosure,
	VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
} from "../jianying-person-cutout/video-object-runtime-closure.js";

const CORE_UUID = "D6342ECD-5432-33F0-A2AD-0C28F5699994";
const RUNTIME_SHA256 =
	"0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9";
const temporaryDirectories: string[] = [];

async function createRuntimeManifest({
	coreUuid = CORE_UUID,
	dependencyShaOverride,
	omittedDependency,
}: {
	coreUuid?: string;
	dependencyShaOverride?: { fileName: string; sha256: string };
	omittedDependency?: string;
} = {}) {
	const runtimeRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-bach-runtime-closure-")
	);
	temporaryDirectories.push(runtimeRoot);
	const files = VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES.filter(
		([dependencyPath]) => path.basename(dependencyPath) !== omittedDependency
	).map(([dependencyPath, sha256]) => {
		const fileName = path.basename(dependencyPath);
		return {
			bytes: fileName.length,
			path: dependencyPath,
			sha256:
				dependencyShaOverride?.fileName === fileName
					? dependencyShaOverride.sha256
					: sha256,
		};
	});
	await writeFile(
		path.join(runtimeRoot, "qcut-effect-runtime.json"),
		JSON.stringify({
			cloudUpload: false,
			coreUuid,
			files,
			localOnly: true,
			schemaVersion: 1,
		})
	);
	return { files, runtimeRoot };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("audited Bach dependency closure", () => {
	it("returns the stable native closure identity after verifying every file", async () => {
		const fixture = await createRuntimeManifest();
		const manifestByName = new Map(
			fixture.files.map((file) => [path.basename(file.path), file])
		);
		await expect(
			verifyVideoObjectBachDependencyClosure({
				expectedCoreUuid: CORE_UUID,
				expectedRuntimeSha256: RUNTIME_SHA256,
				inspect: async ({ filePath }) => {
					const file = manifestByName.get(path.basename(filePath));
					return { bytes: file?.bytes ?? -1, sha256: file?.sha256 ?? null };
				},
				runtimeRoot: fixture.runtimeRoot,
			})
		).resolves.toEqual({
			dependencyClosureMarker: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
			dependencyClosureSha256: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
		});
	});

	it("rejects a stale runtime UUID", async () => {
		const fixture = await createRuntimeManifest({
			coreUuid: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
		});
		await expect(
			verifyVideoObjectBachDependencyClosure({
				expectedCoreUuid: CORE_UUID,
				expectedRuntimeSha256: RUNTIME_SHA256,
				runtimeRoot: fixture.runtimeRoot,
			})
		).rejects.toThrow("audited UUID");
	});

	it("rejects a mixed dependency recorded by the manifest", async () => {
		const fixture = await createRuntimeManifest({
			dependencyShaOverride: {
				fileName: "libAGFX.dylib",
				sha256: "a".repeat(64),
			},
		});
		await expect(
			verifyVideoObjectBachDependencyClosure({
				expectedCoreUuid: CORE_UUID,
				expectedRuntimeSha256: RUNTIME_SHA256,
				runtimeRoot: fixture.runtimeRoot,
			})
		).rejects.toThrow("mixed dependency");
	});

	it("rejects a manifest missing any framework in the audited closure", async () => {
		const fixture = await createRuntimeManifest({
			omittedDependency: "libIESAppLogger.dylib",
		});
		await expect(
			verifyVideoObjectBachDependencyClosure({
				expectedCoreUuid: CORE_UUID,
				expectedRuntimeSha256: RUNTIME_SHA256,
				runtimeRoot: fixture.runtimeRoot,
			})
		).rejects.toThrow("inventory is incomplete");
	});

	it("rejects an actual dependency tampered after the manifest was written", async () => {
		const fixture = await createRuntimeManifest();
		await expect(
			verifyVideoObjectBachDependencyClosure({
				expectedCoreUuid: CORE_UUID,
				expectedRuntimeSha256: RUNTIME_SHA256,
				inspect: async ({ filePath }) => ({
					bytes: path.basename(filePath).length,
					sha256:
						path.basename(filePath) === "libfastcv.dylib"
							? "b".repeat(64)
							: (VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES.find(
									([dependencyPath]) =>
										path.basename(dependencyPath) === path.basename(filePath)
								)?.[1] ?? null),
				}),
				runtimeRoot: fixture.runtimeRoot,
			})
		).rejects.toThrow("checksum mismatch");
	});
});
