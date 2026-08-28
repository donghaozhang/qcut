// @vitest-environment node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	open,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME } from "../jianying-person-cutout/atomic-publish-lock.js";
import {
	COREML_BUNDLE_MANIFEST_FILE_NAME,
	createVideoObjectCoreMLCache,
	findPackedCoreMLArchiveOffset,
	type CoreMLBundleManifest,
} from "../jianying-person-cutout/video-object-coreml-runtime.js";

const execFileAsync = promisify(execFile);
const bundleName = "20440.3_sod_fp16.mlmodelc";
const validMetadata = [
	{
		inputSchema: [
			{ name: "data", shape: "[1, 3, 256, 256]" },
			{ name: "prev_img", shape: "[1, 3, 256, 256]" },
			{ name: "prev_mask", shape: "[1, 1, 256, 256]" },
		],
		outputSchema: [{ name: "nn_3", shape: "[]" }],
	},
];
const fixtureFiles = new Map<string, Buffer>([
	["metadata.json", Buffer.from(JSON.stringify(validMetadata))],
	["model.espresso.net", Buffer.from("verified-network")],
	["model.espresso.weights", Buffer.from("verified-weights-content")],
	["model/coremldata.bin", Buffer.from("verified-model-data")],
]);
const fixtureManifest: CoreMLBundleManifest = {
	bundleName,
	packedModelSha256: "model-sha",
	version: 1,
	files: [...fixtureFiles.entries()].map(([filePath, contents]) => ({
		path: filePath,
		sha256: createHash("sha256").update(contents).digest("hex"),
		size: contents.length,
	})),
};
const fixtureCache = createVideoObjectCoreMLCache({
	expectedManifest: fixtureManifest,
});
const temporaryDirectories: string[] = [];

function fixtureManifestContents() {
	return `${JSON.stringify(
		{
			...fixtureManifest,
			files: [...fixtureManifest.files].sort((left, right) =>
				left.path.localeCompare(right.path)
			),
		},
		null,
		2
	)}\n`;
}

async function createTemporaryDirectory() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-video-object-coreml-test-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

async function writeBundle({
	bundlePath,
	overrides = new Map(),
}: {
	bundlePath: string;
	overrides?: ReadonlyMap<string, Buffer>;
}) {
	await Promise.all(
		[...fixtureFiles.entries()].map(async ([relativePath, defaultContents]) => {
			const filePath = path.join(bundlePath, ...relativePath.split("/"));
			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(filePath, overrides.get(relativePath) ?? defaultContents);
		})
	);
}

async function writePublishedCache({
	cacheDirectory,
	overrides,
}: {
	cacheDirectory: string;
	overrides?: ReadonlyMap<string, Buffer>;
}) {
	await writeBundle({
		bundlePath: path.join(cacheDirectory, bundleName),
		overrides,
	});
	await writeFile(
		path.join(cacheDirectory, COREML_BUNDLE_MANIFEST_FILE_NAME),
		fixtureManifestContents(),
		"utf8"
	);
}

async function createPackedModel({ directory }: { directory: string }) {
	const sourceDirectory = path.join(directory, "packed-source");
	const bundlePath = path.join(sourceDirectory, bundleName);
	const archivePath = path.join(sourceDirectory, "network.zip");
	await writeBundle({ bundlePath });
	await execFileAsync("/usr/bin/ditto", [
		"-c",
		"-k",
		"--keepParent",
		bundlePath,
		archivePath,
	]);
	const modelPath = path.join(directory, "video-object.model");
	await writeFile(
		modelPath,
		Buffer.concat([
			Buffer.from("packed-graph-header"),
			await readFile(archivePath),
		])
	);
	return modelPath;
}

function configureCache({ directory }: { directory: string }) {
	const cacheRoot = path.join(directory, "cache");
	process.env.QCUT_VIDEO_OBJECT_COREML_CACHE_ROOT = cacheRoot;
	return {
		cacheDirectory: path.join(cacheRoot, fixtureManifest.packedModelSha256),
		cacheRoot,
	};
}

afterEach(async () => {
	Reflect.deleteProperty(process.env, "QCUT_VIDEO_OBJECT_COREML_CACHE_ROOT");
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("packed video-object CoreML model", () => {
	it("finds the embedded ZIP after the private graph header", () => {
		const prefix = Buffer.from("packed-graph");
		const modelContents = Buffer.concat([
			prefix,
			Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
		]);
		expect(findPackedCoreMLArchiveOffset({ modelContents })).toBe(
			prefix.length
		);
	});

	it("rejects a missing or unprefixed CoreML archive", () => {
		expect(() =>
			findPackedCoreMLArchiveOffset({
				modelContents: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
			})
		).toThrow("不包含可读取的 CoreML 网络");
		expect(() =>
			findPackedCoreMLArchiveOffset({ modelContents: Buffer.from("graph") })
		).toThrow("不包含可读取的 CoreML 网络");
	});

	it("rejects a published bundle whose tensor contract changed", async () => {
		const directory = await createTemporaryDirectory();
		const { cacheDirectory } = configureCache({ directory });
		await writePublishedCache({
			cacheDirectory,
			overrides: new Map([
				[
					"metadata.json",
					Buffer.from(
						JSON.stringify([
							{
								...validMetadata[0],
								outputSchema: [{ name: "unexpected", shape: "[]" }],
							},
						])
					),
				],
			]),
		});
		await expect(
			fixtureCache.isReadable({
				modelPath: path.join(cacheDirectory, bundleName),
			})
		).resolves.toBe(false);
	});
});

describe.runIf(process.platform === "darwin")(
	"video-object CoreML cache",
	() => {
		it("uses a fully validated cache without reopening the packed model", async () => {
			const directory = await createTemporaryDirectory();
			const { cacheDirectory } = configureCache({ directory });
			await writePublishedCache({ cacheDirectory });
			const cachedBundle = path.join(cacheDirectory, bundleName);

			await expect(
				fixtureCache.prepare({
					modelPath: path.join(directory, "does-not-exist.model"),
					modelSha256: fixtureManifest.packedModelSha256,
				})
			).resolves.toBe(cachedBundle);
		});

		it.each([
			{
				name: "missing weights",
				corrupt: async (cacheDirectory: string) =>
					rm(path.join(cacheDirectory, bundleName, "model.espresso.weights")),
			},
			{
				name: "truncated weights",
				corrupt: async (cacheDirectory: string) =>
					writeFile(
						path.join(cacheDirectory, bundleName, "model.espresso.weights"),
						Buffer.from("truncated")
					),
			},
			{
				name: "damaged manifest",
				corrupt: async (cacheDirectory: string) =>
					writeFile(
						path.join(cacheDirectory, COREML_BUNDLE_MANIFEST_FILE_NAME),
						"{damaged",
						"utf8"
					),
			},
		])("atomically repairs $name", async ({ corrupt }) => {
			const directory = await createTemporaryDirectory();
			const { cacheDirectory } = configureCache({ directory });
			await writePublishedCache({ cacheDirectory });
			await corrupt(cacheDirectory);
			const modelPath = await createPackedModel({ directory });

			const result = await fixtureCache.prepare({
				modelPath,
				modelSha256: fixtureManifest.packedModelSha256,
			});

			await expect(
				fixtureCache.isReadable({ modelPath: result })
			).resolves.toBe(true);
			expect(
				await readFile(path.join(result, "model.espresso.weights"))
			).toEqual(fixtureFiles.get("model.espresso.weights"));
		});

		it("publishes one immutable winner during concurrent repair", async () => {
			const directory = await createTemporaryDirectory();
			const { cacheDirectory, cacheRoot } = configureCache({ directory });
			await writePublishedCache({ cacheDirectory });
			await writeFile(
				path.join(cacheDirectory, bundleName, "model.espresso.weights"),
				Buffer.from("truncated")
			);
			const modelPath = await createPackedModel({ directory });
			const calls = Array.from({ length: 6 }, () =>
				fixtureCache.prepare({
					modelPath,
					modelSha256: fixtureManifest.packedModelSha256,
				})
			);

			const winner = await Promise.race(calls);
			const winnerDirectory = path.dirname(winner);
			const winnerStat = await stat(winnerDirectory);
			const weightsHandle = await open(
				path.join(winner, "model.espresso.weights"),
				"r"
			);
			try {
				const results = await Promise.all(calls);
				expect(new Set(results)).toEqual(new Set([winner]));
				expect((await stat(winnerDirectory)).ino).toBe(winnerStat.ino);
				const probe = Buffer.alloc(8);
				await weightsHandle.read(probe, 0, probe.length, 0);
				expect(probe).toEqual(
					fixtureFiles.get("model.espresso.weights")?.subarray(0, probe.length)
				);
			} finally {
				await weightsHandle.close();
			}
			expect((await readdir(cacheRoot)).sort()).toEqual([
				fixtureManifest.packedModelSha256,
			]);
		});

		it("never steals an old lock owned by a live process", async () => {
			const directory = await createTemporaryDirectory();
			const { cacheRoot } = configureCache({ directory });
			const lockPath = path.join(
				cacheRoot,
				`${fixtureManifest.packedModelSha256}.publish-lock`
			);
			await mkdir(lockPath, { recursive: true });
			await writeFile(
				path.join(lockPath, ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME),
				JSON.stringify({ createdAt: 0, pid: process.pid }),
				"utf8"
			);
			const shortWaitCache = createVideoObjectCoreMLCache({
				expectedManifest: fixtureManifest,
				lockTiming: { retryMs: 1, waitMs: 5 },
			});

			await expect(
				shortWaitCache.prepare({
					modelPath: path.join(directory, "not-read.model"),
					modelSha256: fixtureManifest.packedModelSha256,
				})
			).rejects.toThrow("Timed out waiting for cache publication lock");
			expect((await stat(lockPath)).isDirectory()).toBe(true);
		});
	}
);
