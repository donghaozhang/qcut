import { createHash } from "node:crypto";
import {
	appendFile,
	mkdir,
	mkdtemp,
	open,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertStickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import {
	clearLocalReferenceDiscoveryCache,
	discoverLocalReferences,
	LOCAL_REFERENCE_DISCOVERY_LIMITS,
	mapWithConcurrency,
	readLocalReference,
	resolveDefaultLocalReferenceRoot,
} from "../native-pipeline/stickers/local-reference-catalog/index";
import { readOpenedFileWithinLimit } from "../native-pipeline/stickers/local-reference-catalog/filesystem";
import { parseLocalReferenceManifest } from "../native-pipeline/stickers/local-reference-catalog/schemas";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const GIF_BYTES = new TextEncoder().encode("GIF89a-local-reference");
const WEBM_BYTES = new Uint8Array([
	0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
]);
const temporaryRoots: string[] = [];

interface FixtureOptions {
	batchId?: string;
	bytes?: Uint8Array;
	filePath?: string;
	fixtureRootPath?: string;
	id?: string;
	manifestReferenceOnly?: boolean;
	mimeType?: "image/gif" | "image/png";
	reportReferenceOnly?: boolean;
	reportFrameRate?: number | null;
	reportPosition?: number;
	reportRemoteUrl?: string;
	reportSha256?: string;
	reportVersion?: 1 | 2;
	withLegacyReportFields?: boolean;
}

async function createTemporaryRoot(): Promise<string> {
	const temporaryPath = await mkdtemp(join(tmpdir(), "qcut-sticker-lab-"));
	const rootPath = await realpath(temporaryPath);
	temporaryRoots.push(rootPath);
	return rootPath;
}

function checksum({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function writeFixture({
	batchId = "jianying-2026-07-31",
	bytes = PNG_BYTES,
	filePath,
	fixtureRootPath,
	id = "123",
	manifestReferenceOnly,
	mimeType = "image/png",
	reportReferenceOnly,
	reportFrameRate,
	reportPosition = 0,
	reportRemoteUrl,
	reportSha256,
	reportVersion = 2,
	withLegacyReportFields = false,
}: FixtureOptions = {}): Promise<{
	assetPath: string;
	batchId: string;
	batchRoot: string;
	rootPath: string;
}> {
	const rootPath = fixtureRootPath ?? (await createTemporaryRoot());
	const batchRoot = join(rootPath, batchId);
	const extension = mimeType === "image/gif" ? "gif" : "png";
	const assetPath = filePath ?? join(batchRoot, "assets", `${id}.${extension}`);
	await Promise.all([
		mkdir(batchRoot, { recursive: true }),
		mkdir(dirname(assetPath), { recursive: true }),
	]);
	await writeFile(assetPath, bytes);
	const sourceKind = mimeType === "image/gif" ? "preview-gif" : "static-image";
	const playback =
		mimeType === "image/gif"
			? {
					kind: "animated",
					frameCount: 2,
					frameRate: 10,
					cycleDuration: 0.2,
					loop: true,
				}
			: { kind: "static" };
	const manifest = {
		version: 1,
		...(manifestReferenceOnly === undefined
			? {}
			: { referenceOnly: manifestReferenceOnly }),
		categories: [
			{
				id: "10515",
				label: "热门",
				sourcePanel: "fixture",
				items: [
					{
						id,
						displayName: `Sticker ${id}`,
						fileName: `${id}.${extension}`,
						filePath: assetPath,
						mimeType,
						sourceKind,
						playback,
					},
				],
			},
		],
	};
	const reportItem = {
		categoryId: "10515",
		category: "热门",
		endpointRow: 1,
		position: reportPosition,
		id,
		title: `Sticker ${id}`,
		sourceKind,
		mimeType,
		filePath: assetPath,
		codec: mimeType === "image/gif" ? "gif" : "png",
		width: 32,
		height: 32,
		frameCount: mimeType === "image/gif" ? 2 : 1,
		frameRate:
			reportFrameRate === undefined
				? mimeType === "image/gif"
					? 10
					: null
				: reportFrameRate,
		durationSeconds: mimeType === "image/gif" ? 0.2 : null,
		byteSize: bytes.byteLength,
		sha256: reportSha256 ?? checksum({ bytes }),
		...(withLegacyReportFields
			? { nonEmpty: true, reusedExistingFile: false }
			: {}),
	};
	const report = {
		version: reportVersion,
		...(reportRemoteUrl ? { downloadUrl: reportRemoteUrl } : {}),
		...(reportReferenceOnly === undefined
			? reportVersion === 2
				? { referenceOnly: true }
				: {}
			: { referenceOnly: reportReferenceOnly }),
		success: [reportItem],
	};
	await Promise.all([
		writeFile(join(batchRoot, "manifest.json"), JSON.stringify(manifest)),
		writeFile(join(batchRoot, "report.json"), JSON.stringify(report)),
	]);
	return { assetPath, batchId, batchRoot, rootPath };
}

async function writeRuntimePackageFixture({
	batchId = "jianying-2026-08-28-batch-99",
	fixtureRootPath,
	id = "990103",
	primaryBytes = PNG_BYTES,
	resourceBytes = WEBM_BYTES,
	resourceFilePath,
	resourceDurationSeconds = 1,
	resourceName = "alpha.webm",
	resourceSha256,
	separateMaskDurationSeconds,
	shareSeparateMaskFile = false,
	sourceDurationSeconds = 1,
}: {
	batchId?: string;
	fixtureRootPath?: string;
	id?: string;
	primaryBytes?: Uint8Array;
	resourceBytes?: Uint8Array;
	resourceDurationSeconds?: number;
	resourceFilePath?: string;
	resourceName?: string;
	resourceSha256?: string;
	separateMaskDurationSeconds?: number;
	shareSeparateMaskFile?: boolean;
	sourceDurationSeconds?: number;
} = {}): Promise<{
	batchId: string;
	batchRoot: string;
	primaryPath: string;
	resourcePath: string;
	rootPath: string;
}> {
	const rootPath = fixtureRootPath ?? (await createTemporaryRoot());
	const batchRoot = join(rootPath, batchId);
	const primaryPath = join(batchRoot, "assets", `${id}-preview.png`);
	const resourcePath =
		resourceFilePath ?? join(batchRoot, "assets", `${id}-alpha.webm`);
	const maskResourceName = "mask.webm";
	const maskPath = shareSeparateMaskFile
		? resourcePath
		: join(batchRoot, "assets", `${id}-mask.webm`);
	const maskFileName = shareSeparateMaskFile
		? `${id}-alpha.webm`
		: `${id}-mask.webm`;
	await Promise.all([
		mkdir(dirname(primaryPath), { recursive: true }),
		mkdir(dirname(resourcePath), { recursive: true }),
		...(separateMaskDurationSeconds === undefined || shareSeparateMaskFile
			? []
			: [mkdir(dirname(maskPath), { recursive: true })]),
	]);
	await Promise.all([
		writeFile(primaryPath, primaryBytes),
		writeFile(resourcePath, resourceBytes),
		...(separateMaskDurationSeconds === undefined || shareSeparateMaskFile
			? []
			: [writeFile(maskPath, resourceBytes)]),
	]);
	const descriptor = {
		kind: "alpha-video",
		source: resourceName,
		sourceDurationSeconds,
		cycleDurationSeconds: 1,
		layout:
			separateMaskDurationSeconds === undefined
				? {
						kind: "side-by-side",
						colorRect: { x: 0, y: 0, width: 0.5, height: 1 },
						maskRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
						mask: { channel: "luma", inverted: false },
					}
				: {
						kind: "separate-mask",
						maskSource: maskResourceName,
						mask: { channel: "luma", inverted: false },
					},
		progressKeyframes: [
			{ atSeconds: 0, sourceProgress: 0, interpolation: "linear" },
			{ atSeconds: 1, sourceProgress: 1, interpolation: "hold" },
		],
		repeat: { kind: "infinite" },
		completion: "freeze-last",
	};
	const manifest = {
		version: 1,
		referenceOnly: true,
		categories: [
			{
				id: "99001",
				label: "QCut E2E runtime",
				sourcePanel: "fixture",
				items: [
					{
						id,
						displayName: `Runtime sticker ${id}`,
						fileName: `${id}-preview.png`,
						filePath: primaryPath,
						mimeType: "image/png",
						sourceKind: "alpha-video",
						playback: {
							kind: "animated",
							frameCount: 10,
							frameRate: 10,
							cycleDuration: 1,
							loop: true,
						},
						runtimePackage: {
							descriptor,
							resources: [
								{
									resourceName,
									fileName: `${id}-alpha.webm`,
									filePath: resourcePath,
									mimeType: "video/webm",
								},
								...(separateMaskDurationSeconds === undefined
									? []
									: [
											{
												resourceName: maskResourceName,
												fileName: maskFileName,
												filePath: maskPath,
												mimeType: "video/webm",
											},
										]),
							],
						},
					},
				],
			},
		],
	};
	const report = {
		version: 2,
		referenceOnly: true,
		success: [
			{
				categoryId: "99001",
				category: "QCut E2E runtime",
				endpointRow: null,
				position: 0,
				id,
				title: `Runtime sticker ${id}`,
				sourceKind: "alpha-video",
				mimeType: "image/png",
				filePath: primaryPath,
				codec: "png",
				width: 64,
				height: 64,
				frameCount: 1,
				frameRate: null,
				durationSeconds: null,
				byteSize: primaryBytes.byteLength,
				sha256: checksum({ bytes: primaryBytes }),
				runtimeResources: [
					{
						resourceName,
						fileName: `${id}-alpha.webm`,
						filePath: resourcePath,
						mimeType: "video/webm",
						codec: "vp9",
						width: 128,
						height: 64,
						frameCount: 10,
						frameRate: 10,
						durationSeconds: resourceDurationSeconds,
						byteSize: resourceBytes.byteLength,
						sha256: resourceSha256 ?? checksum({ bytes: resourceBytes }),
					},
					...(separateMaskDurationSeconds === undefined
						? []
						: [
								{
									resourceName: maskResourceName,
									fileName: maskFileName,
									filePath: maskPath,
									mimeType: "video/webm",
									codec: "vp9",
									width: 64,
									height: 64,
									frameCount: 10,
									frameRate: 10,
									durationSeconds: separateMaskDurationSeconds,
									byteSize: resourceBytes.byteLength,
									sha256: checksum({ bytes: resourceBytes }),
								},
							]),
				],
			},
		],
	};
	await Promise.all([
		writeFile(join(batchRoot, "manifest.json"), JSON.stringify(manifest)),
		writeFile(join(batchRoot, "report.json"), JSON.stringify(report)),
	]);
	return { batchId, batchRoot, primaryPath, resourcePath, rootPath };
}

afterEach(async () => {
	clearLocalReferenceDiscoveryCache();
	const roots = temporaryRoots.splice(0);
	await Promise.all(roots.map((rootPath) => rm(rootPath, { recursive: true })));
});

describe("local Sticker Lab reference service", () => {
	it("uses platform-aware default local roots", () => {
		expect(
			resolveDefaultLocalReferenceRoot({
				homeDirectory: "/Users/tester",
				platform: "darwin",
			})
		).toBe("/Users/tester/Movies/QCut Sticker Lab");
		expect(
			resolveDefaultLocalReferenceRoot({
				homeDirectory: "/home/tester",
				platform: "linux",
			})
		).toBe("/home/tester/Videos/QCut Sticker Lab");
	});

	it("publishes bounded discovery limits", () => {
		expect(LOCAL_REFERENCE_DISCOVERY_LIMITS).toEqual({
			batchConcurrency: 4,
			fileConcurrencyPerBatch: 16,
			maxBatches: 64,
			maxCachedRoots: 8,
		});
	});

	it("caps the shared file inspection queue at the published limit", async () => {
		let activeWorkers = 0;
		let maximumActiveWorkers = 0;
		await mapWithConcurrency({
			concurrency: LOCAL_REFERENCE_DISCOVERY_LIMITS.fileConcurrencyPerBatch,
			inputs: Array.from({ length: 48 }, (_, index) => index),
			worker: async ({ input }) => {
				activeWorkers += 1;
				maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
				await new Promise((resolve) => setTimeout(resolve, 1));
				activeWorkers -= 1;
				return input;
			},
		});

		expect(maximumActiveWorkers).toBe(
			LOCAL_REFERENCE_DISCOVERY_LIMITS.fileConcurrencyPerBatch
		);
	});

	it("uses the renderer femtosecond timing boundary for local descriptors", () => {
		const descriptor = {
			kind: "png-sequence",
			cycleDurationSeconds: 1,
			frames: [
				{
					source: "frame-1.png",
					startSeconds: 0,
					durationSeconds: 0.5,
				},
				{
					source: "frame-2.png",
					startSeconds: 0.500_000_000_5,
					durationSeconds: 0.499_999_999_5,
				},
			],
			repeat: { kind: "infinite" },
			completion: "freeze-last",
		};
		const candidate = {
			version: 1,
			referenceOnly: true,
			categories: [
				{
					id: "99001",
					label: "QCut timing fixture",
					sourcePanel: "fixture",
					items: [
						{
							id: "990103",
							displayName: "Timing boundary",
							fileName: "preview.png",
							filePath: "/tmp/preview.png",
							mimeType: "image/png",
							sourceKind: "png-sequence",
							playback: {
								kind: "animated",
								frameCount: 2,
								cycleDuration: 1,
								loop: true,
							},
							runtimePackage: {
								descriptor,
								resources: ["frame-1.png", "frame-2.png"].map(
									(resourceName) => ({
										resourceName,
										fileName: resourceName,
										filePath: `/tmp/${resourceName}`,
										mimeType: "image/png",
									})
								),
							},
						},
					],
				},
			],
		};

		expect(() => assertStickerRuntimeDescriptor({ descriptor })).toThrow(
			"Frame timing table must be positive, ordered, and contiguous"
		);
		expect(() => parseLocalReferenceManifest({ candidate })).toThrow(
			"runtime frames must be contiguous and start at zero"
		);
	});

	it("rejects direct GIF runtime packages with a controlled schema error", () => {
		const candidate = {
			version: 1,
			referenceOnly: true,
			categories: [
				{
					id: "99001",
					label: "QCut direct GIF fixture",
					sourcePanel: "fixture",
					items: [
						{
							id: "990104",
							displayName: "Direct GIF",
							fileName: "preview.gif",
							filePath: "/tmp/preview.gif",
							mimeType: "image/gif",
							sourceKind: "direct-gif",
							playback: {
								kind: "animated",
								frameCount: 1,
								cycleDuration: 1,
								loop: true,
							},
							runtimePackage: {
								descriptor: {
									kind: "direct-gif",
									canvasSize: { height: 1, width: 1 },
									cycleDurationSeconds: 1,
									frames: [
										{
											delayCentiseconds: 100,
											disposalMethod: 0,
											durationSeconds: 1,
											frameRect: { height: 1, width: 1, x: 0, y: 0 },
											hasTransparency: true,
											startSeconds: 0,
										},
									],
									repeat: { kind: "infinite" },
									completion: "freeze-last",
								},
								resources: [],
							},
						},
					],
				},
			],
		};

		expect(() => parseLocalReferenceManifest({ candidate })).toThrow(
			"direct GIF runtimes are derived from the primary GIF"
		);
	});

	it("normalizes the legacy first-batch manifest and report", async () => {
		const fixture = await writeFixture({
			reportFrameRate: 25,
			reportPosition: 3,
			reportVersion: 1,
			withLegacyReportFields: true,
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.warnings).toEqual([]);
		expect(discovery.summary).toEqual({
			batchCount: 1,
			categoryCount: 1,
			itemCount: 1,
			totalBytes: PNG_BYTES.byteLength,
		});
		expect(discovery.catalogs[0]).toMatchObject({
			version: 1,
			batchId: fixture.batchId,
			referenceOnly: true,
			itemCount: 1,
		});
		expect(discovery.catalogs[0]?.categories[0]?.items[0]?.asset).toEqual({
			kind: "local-reference",
			rootPath: fixture.rootPath,
			batchId: fixture.batchId,
			stickerId: "123",
			byteSize: PNG_BYTES.byteLength,
			checksumSha256: checksum({ bytes: PNG_BYTES }),
		});
	});

	it("reads PNG and GIF assets only after verifying bytes", async () => {
		const pngFixture = await writeFixture({ id: "123" });
		const gifFixture = await writeFixture({
			batchId: "jianying-2026-08-01-batch-2",
			bytes: GIF_BYTES,
			id: "456",
			mimeType: "image/gif",
		});

		const [png, gif] = await Promise.all([
			readLocalReference({
				rootPath: pngFixture.rootPath,
				batchId: pngFixture.batchId,
				stickerId: "123",
			}),
			readLocalReference({
				rootPath: gifFixture.rootPath,
				batchId: gifFixture.batchId,
				stickerId: "456",
			}),
		]);

		expect(Array.from(png.bytes)).toEqual(Array.from(PNG_BYTES));
		expect(png.mimeType).toBe("image/png");
		expect(Array.from(gif.bytes)).toEqual(Array.from(GIF_BYTES));
		expect(gif.mimeType).toBe("image/gif");
	});

	it("discovers, totals, and verifies a multi-resource runtime package", async () => {
		const fixture = await writeRuntimePackageFixture();

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.warnings).toEqual([]);
		expect(discovery.summary).toEqual({
			batchCount: 1,
			categoryCount: 1,
			itemCount: 1,
			totalBytes: PNG_BYTES.byteLength + WEBM_BYTES.byteLength,
		});
		const reference = discovery.catalogs[0]?.categories[0]?.items[0];
		expect(reference?.runtimePackage?.descriptor).toMatchObject({
			kind: "alpha-video",
			source: "alpha.webm",
		});
		expect(reference?.runtimePackage?.resources).toEqual([
			{
				resourceName: "alpha.webm",
				fileName: "990103-alpha.webm",
				mimeType: "video/webm",
				asset: {
					kind: "local-reference-runtime-resource",
					rootPath: fixture.rootPath,
					batchId: fixture.batchId,
					stickerId: "990103",
					resourceName: "alpha.webm",
					byteSize: WEBM_BYTES.byteLength,
					checksumSha256: checksum({ bytes: WEBM_BYTES }),
				},
			},
		]);
		expect(reference?.runtimePackage?.resources[0]).not.toHaveProperty(
			"filePath"
		);

		const [primary, runtimeResource] = await Promise.all([
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "990103",
			}),
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "990103",
				resourceName: "alpha.webm",
			}),
		]);
		expect(Array.from(primary.bytes)).toEqual(Array.from(PNG_BYTES));
		expect(runtimeResource).toMatchObject({
			batchId: fixture.batchId,
			checksumSha256: checksum({ bytes: WEBM_BYTES }),
			stickerId: "990103",
			resourceName: "alpha.webm",
			fileName: "990103-alpha.webm",
			mimeType: "video/webm",
		});
		expect(Array.from(runtimeResource.bytes)).toEqual(Array.from(WEBM_BYTES));
	});

	it("requires alpha source and separate mask reports to match source duration", async () => {
		const sourceMismatch = await writeRuntimePackageFixture({
			resourceDurationSeconds: 1,
			sourceDurationSeconds: 2,
		});
		const maskMismatch = await writeRuntimePackageFixture({
			batchId: "jianying-2026-08-28-batch-100",
			resourceDurationSeconds: 1,
			separateMaskDurationSeconds: 0.5,
			sourceDurationSeconds: 1,
		});

		const [sourceDiscovery, maskDiscovery] = await Promise.all([
			discoverLocalReferences({ rootPath: sourceMismatch.rootPath }),
			discoverLocalReferences({ rootPath: maskMismatch.rootPath }),
		]);

		expect(sourceDiscovery.summary.itemCount).toBe(0);
		expect(sourceDiscovery.warnings[0]?.message).toContain(
			"Alpha-video source duration mismatch: 990103/alpha.webm"
		);
		expect(maskDiscovery.summary.itemCount).toBe(0);
		expect(maskDiscovery.warnings[0]?.message).toContain(
			"Alpha-video source duration mismatch: 990103/mask.webm"
		);
	});

	it("allows separate alpha resources to share a verified path and hash", async () => {
		const fixture = await writeRuntimePackageFixture({
			separateMaskDurationSeconds: 1,
			shareSeparateMaskFile: true,
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.warnings).toEqual([]);
		expect(discovery.summary.itemCount).toBe(1);
		const resources =
			discovery.catalogs[0]?.categories[0]?.items[0]?.runtimePackage
				?.resources ?? [];
		expect(resources).toHaveLength(2);
		expect(resources[0]?.asset.checksumSha256).toBe(
			resources[1]?.asset.checksumSha256
		);
		const [source, mask] = await Promise.all([
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "990103",
				resourceName: "alpha.webm",
			}),
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "990103",
				resourceName: "mask.webm",
			}),
		]);
		expect(source.bytes).toEqual(mask.bytes);
	});

	it("fails a runtime resource read when its hash or WebM magic changes", async () => {
		const wrongHash = await writeRuntimePackageFixture({
			resourceSha256: "a".repeat(64),
		});
		await discoverLocalReferences({ rootPath: wrongHash.rootPath });
		await expect(
			readLocalReference({
				rootPath: wrongHash.rootPath,
				batchId: wrongHash.batchId,
				stickerId: "990103",
				resourceName: "alpha.webm",
			})
		).rejects.toThrow("SHA-256 mismatch");

		const invalidMagicBytes = new TextEncoder().encode("not-webm");
		const invalidMagic = await writeRuntimePackageFixture({
			batchId: "jianying-2026-08-28-batch-100",
			resourceBytes: invalidMagicBytes,
		});
		await discoverLocalReferences({ rootPath: invalidMagic.rootPath });
		await expect(
			readLocalReference({
				rootPath: invalidMagic.rootPath,
				batchId: invalidMagic.batchId,
				stickerId: "990103",
				resourceName: "alpha.webm",
			})
		).rejects.toThrow("magic does not match MIME type");

		const matroskaBytes = new Uint8Array([
			0x1a, 0x45, 0xdf, 0xa3, 0x8b, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72,
			0x6f, 0x73, 0x6b, 0x61,
		]);
		const matroska = await writeRuntimePackageFixture({
			batchId: "jianying-2026-08-28-batch-101",
			resourceBytes: matroskaBytes,
		});
		await discoverLocalReferences({ rootPath: matroska.rootPath });
		await expect(
			readLocalReference({
				rootPath: matroska.rootPath,
				batchId: matroska.batchId,
				stickerId: "990103",
				resourceName: "alpha.webm",
			})
		).rejects.toThrow("magic does not match MIME type");

		const embeddedWebmSignatureBytes = new Uint8Array([
			0x1a, 0x45, 0xdf, 0xa3, 0x94, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72,
			0x6f, 0x73, 0x6b, 0x61, 0xec, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62,
			0x6d,
		]);
		const embeddedSignature = await writeRuntimePackageFixture({
			batchId: "jianying-2026-08-28-batch-102",
			resourceBytes: embeddedWebmSignatureBytes,
		});
		await discoverLocalReferences({ rootPath: embeddedSignature.rootPath });
		await expect(
			readLocalReference({
				rootPath: embeddedSignature.rootPath,
				batchId: embeddedSignature.batchId,
				stickerId: "990103",
				resourceName: "alpha.webm",
			})
		).rejects.toThrow("magic does not match MIME type");
	});

	it("rejects missing, unreferenced, and path-escaping runtime resources", async () => {
		const missingSource = await writeRuntimePackageFixture();
		const manifestPath = join(missingSource.batchRoot, "manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
			categories: Array<{
				items: Array<{
					runtimePackage: {
						descriptor: { source: string };
						resources: Array<{ resourceName: string }>;
					};
				}>;
			}>;
		};
		const runtimePackage = manifest.categories[0]?.items[0]?.runtimePackage;
		if (!runtimePackage) throw new Error("Runtime fixture package is missing");
		runtimePackage.descriptor.source = "missing.webm";
		await writeFile(manifestPath, JSON.stringify(manifest));
		const missingDiscovery = await discoverLocalReferences({
			rootPath: missingSource.rootPath,
		});
		expect(missingDiscovery.summary.itemCount).toBe(0);
		expect(missingDiscovery.warnings[0]?.message).toContain(
			"runtime source is missing"
		);

		const outsideRoot = await createTemporaryRoot();
		const outsideResource = join(outsideRoot, "990103-alpha.webm");
		const escaping = await writeRuntimePackageFixture({
			batchId: "jianying-2026-08-28-batch-100",
			resourceFilePath: outsideResource,
		});
		const escapingDiscovery = await discoverLocalReferences({
			rootPath: escaping.rootPath,
		});
		expect(escapingDiscovery.summary.itemCount).toBe(0);
		expect(escapingDiscovery.warnings[0]?.message).toContain(
			"escapes its batch"
		);
	});

	it("allows runtime resource hashes to be shared across batches", async () => {
		const rootPath = await createTemporaryRoot();
		await writeRuntimePackageFixture({ fixtureRootPath: rootPath });
		await writeRuntimePackageFixture({
			batchId: "jianying-2026-08-28-batch-100",
			fixtureRootPath: rootPath,
			id: "990104",
			primaryBytes: new Uint8Array([...PNG_BYTES, 4]),
		});

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.summary.batchCount).toBe(2);
		expect(discovery.summary.itemCount).toBe(2);
		expect(discovery.warnings).toEqual([]);
	});

	it("hard-caps a file that grows after its initial inspection", async () => {
		const rootPath = await createTemporaryRoot();
		const filePath = join(rootPath, "growing.png");
		await writeFile(filePath, PNG_BYTES);
		const handle = await open(filePath, "r");
		try {
			const initialStats = await handle.stat();
			await appendFile(filePath, new Uint8Array(1024 * 1024));
			let totalBytesRead = 0;
			const trackingHandle = {
				read: async (
					buffer: Uint8Array,
					offset: number,
					length: number,
					position: number
				) => {
					const result = await handle.read(buffer, offset, length, position);
					totalBytesRead += result.bytesRead;
					return result;
				},
			};

			await expect(
				readOpenedFileWithinLimit({
					expectedByteSize: initialStats.size,
					handle: trackingHandle,
					label: "Growing sticker",
					maxBytes: initialStats.size,
				})
			).rejects.toThrow("changed while reading");
			expect(totalBytesRead).toBe(initialStats.size + 1);
		} finally {
			await handle.close();
		}
	});

	it("does not hash asset content during discovery", async () => {
		const fixture = await writeFixture({
			bytes: new TextEncoder().encode("not-a-png"),
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.summary.itemCount).toBe(1);
		await expect(
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "123",
			})
		).rejects.toThrow("magic does not match MIME type");
	});

	it("fails the verified read when the report checksum is wrong", async () => {
		const fixture = await writeFixture({ reportSha256: "a".repeat(64) });
		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});
		expect(discovery.summary.itemCount).toBe(1);

		await expect(
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "123",
			})
		).rejects.toThrow("SHA-256 mismatch");
	});

	it("keeps verification metadata isolated from returned catalogs", async () => {
		const fixture = await writeFixture();
		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});
		const reference = discovery.catalogs[0]?.categories[0]?.items[0];
		if (!reference) throw new Error("Fixture reference is missing");
		reference.asset.checksumSha256 = "a".repeat(64);

		const result = await readLocalReference({
			rootPath: fixture.rootPath,
			batchId: fixture.batchId,
			stickerId: reference.id,
		});

		expect(result.checksumSha256).toBe(checksum({ bytes: PNG_BYTES }));
	});

	it("rejects an explicit non-reference manifest or report", async () => {
		const manifestFixture = await writeFixture({
			manifestReferenceOnly: false,
		});
		const reportFixture = await writeFixture({ reportReferenceOnly: false });

		const [manifestDiscovery, reportDiscovery] = await Promise.all([
			discoverLocalReferences({ rootPath: manifestFixture.rootPath }),
			discoverLocalReferences({ rootPath: reportFixture.rootPath }),
		]);

		expect(manifestDiscovery.summary.itemCount).toBe(0);
		expect(manifestDiscovery.warnings[0]?.batchId).toBe(
			manifestFixture.batchId
		);
		expect(reportDiscovery.summary.itemCount).toBe(0);
		expect(reportDiscovery.warnings[0]?.batchId).toBe(reportFixture.batchId);
	});

	it("rejects URL-bearing report metadata", async () => {
		const fixture = await writeFixture({
			reportRemoteUrl: "https://example.com/sticker.png",
		});

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.summary.itemCount).toBe(0);
		expect(discovery.warnings[0]?.message).toContain("URL field is forbidden");
	});

	it("rejects duplicate asset checksums across batches", async () => {
		const rootPath = await createTemporaryRoot();
		await writeFixture({ fixtureRootPath: rootPath });
		await writeFixture({
			batchId: "jianying-2026-08-01-batch-2",
			fixtureRootPath: rootPath,
			id: "456",
		});

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.summary.batchCount).toBe(1);
		expect(discovery.warnings[0]?.message).toContain(
			"Duplicate sticker checksum across batches"
		);
	});

	it("selects the highest revision and warns for superseded batch directories", async () => {
		const rootPath = await createTemporaryRoot();
		const baseBatchId = "jianying-2026-08-23-batch-18";
		const secondBatchId = `${baseBatchId}-v2`;
		const latestBatchId = `${baseBatchId}-v3`;
		await writeFixture({
			batchId: baseBatchId,
			bytes: new Uint8Array([...PNG_BYTES, 1]),
			fixtureRootPath: rootPath,
		});
		await writeFixture({
			batchId: secondBatchId,
			bytes: new Uint8Array([...PNG_BYTES, 2]),
			fixtureRootPath: rootPath,
		});
		const latestBytes = new Uint8Array([...PNG_BYTES, 3]);
		await writeFixture({
			batchId: latestBatchId,
			bytes: latestBytes,
			fixtureRootPath: rootPath,
		});

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.catalogs.map(({ batchId }) => batchId)).toEqual([
			latestBatchId,
		]);
		expect(discovery.warnings).toEqual([
			{
				batchId: baseBatchId,
				message: `Superseded by newer batch revision ${latestBatchId}; older directory was not loaded`,
			},
			{
				batchId: secondBatchId,
				message: `Superseded by newer batch revision ${latestBatchId}; older directory was not loaded`,
			},
		]);
		await expect(
			readLocalReference({
				rootPath,
				batchId: baseBatchId,
				stickerId: "123",
			})
		).rejects.toThrow("Local Sticker Lab reference not found");
		const latest = await readLocalReference({
			rootPath,
			batchId: latestBatchId,
			stickerId: "123",
		});
		expect(Array.from(latest.bytes)).toEqual(Array.from(latestBytes));
	});

	it("rejects an asset path outside its batch", async () => {
		const outsideRoot = await createTemporaryRoot();
		const outsidePath = join(outsideRoot, "123.png");
		await writeFile(outsidePath, PNG_BYTES);
		const fixture = await writeFixture({ filePath: outsidePath });

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.summary.itemCount).toBe(0);
		expect(discovery.warnings[0]?.message).toContain("escapes its batch");
	});

	it.runIf(process.platform !== "win32")(
		"rejects symlinked sticker assets",
		async () => {
			const fixture = await writeFixture();
			const realAssetPath = join(fixture.batchRoot, "assets", "real.png");
			await writeFile(realAssetPath, PNG_BYTES);
			await rm(fixture.assetPath);
			await symlink(realAssetPath, fixture.assetPath);

			const discovery = await discoverLocalReferences({
				rootPath: fixture.rootPath,
			});

			expect(discovery.summary.itemCount).toBe(0);
			expect(discovery.warnings[0]?.message).toContain("symlinks");
		}
	);

	it("returns a warning instead of throwing for a missing root", async () => {
		const rootPath = join(await createTemporaryRoot(), "missing");

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.rootPath).toBe(rootPath);
		expect(discovery.catalogs).toEqual([]);
		expect(discovery.warnings).toHaveLength(1);
	});

	it("fails discovery when a root exceeds the batch limit", async () => {
		const fixture = await writeFixture();
		const initial = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});
		expect(initial.summary.itemCount).toBe(1);
		await Promise.all(
			Array.from(
				{ length: LOCAL_REFERENCE_DISCOVERY_LIMITS.maxBatches },
				(_, index) =>
					mkdir(
						join(fixture.rootPath, `jianying-2026-08-23-batch-${index + 2}`),
						{ recursive: true }
					)
			)
		);

		const discovery = await discoverLocalReferences({
			rootPath: fixture.rootPath,
		});

		expect(discovery.catalogs).toEqual([]);
		expect(discovery.warnings[0]?.message).toContain(
			`${LOCAL_REFERENCE_DISCOVERY_LIMITS.maxBatches} batch limit`
		);
		await expect(
			readLocalReference({
				rootPath: fixture.rootPath,
				batchId: fixture.batchId,
				stickerId: "123",
			})
		).rejects.toThrow("Local Sticker Lab reference not found");
	});

	it("returns a warning for roots with dot path segments", async () => {
		const rootPath = `${await createTemporaryRoot()}/../stickers`;

		const discovery = await discoverLocalReferences({ rootPath });

		expect(discovery.catalogs).toEqual([]);
		expect(discovery.warnings[0]?.message).toContain("dot path segments");
	});

	it("does not retain empty discovery roots", async () => {
		const rootPath = await createTemporaryRoot();
		const emptyDiscovery = await discoverLocalReferences({ rootPath });
		expect(emptyDiscovery.summary.itemCount).toBe(0);
		const fixture = await writeFixture({ fixtureRootPath: rootPath });

		const result = await readLocalReference({
			rootPath,
			batchId: fixture.batchId,
			stickerId: "123",
		});

		expect(result.stickerId).toBe("123");
	});

	it("evicts the least recently used discovery root", async () => {
		const fixtures = await Promise.all(
			Array.from(
				{ length: LOCAL_REFERENCE_DISCOVERY_LIMITS.maxCachedRoots + 1 },
				(_, index) => writeFixture({ id: String(100 + index) })
			)
		);
		const first = fixtures[0];
		if (!first) throw new Error("First LRU fixture is missing");
		await discoverLocalReferences({ rootPath: first.rootPath });
		await Promise.all(
			fixtures
				.slice(1)
				.map(({ rootPath }) => discoverLocalReferences({ rootPath }))
		);
		await rm(join(first.batchRoot, "manifest.json"));

		await expect(
			readLocalReference({
				rootPath: first.rootPath,
				batchId: first.batchId,
				stickerId: "100",
			})
		).rejects.toThrow("Local Sticker Lab reference not found");
	});
});
