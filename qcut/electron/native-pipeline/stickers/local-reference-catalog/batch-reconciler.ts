import { basename, join } from "node:path";
import type {
	LocalStickerLabCatalog,
	LocalStickerLabReadableMimeType,
	LocalStickerLabReference,
	LocalStickerLabRuntimeResource,
} from "../../../preload-types/api-types/sticker-lab-api.js";
import { inspectLocalStickerFile, readSecureJson } from "./filesystem.js";
import { localStickerMediaTimeToTicks } from "./media-time.js";
import {
	parseLocalReferenceManifest,
	parseLocalReferenceReport,
	type LocalReferenceManifestCategory,
	type LocalReferenceManifestItem,
	type LocalReferenceReport,
	type LocalReferenceReportItem,
} from "./schemas.js";

const MAX_LOCAL_REFERENCE_CATEGORY_BYTES = 128 * 1024 * 1024;
const MAX_LOCAL_REFERENCE_CATALOG_BYTES = 512 * 1024 * 1024;

export interface InternalLocalReference {
	batchId: string;
	batchRoot: string;
	byteSize: number;
	checksumSha256: string;
	fileName: string;
	filePath: string;
	mimeType: LocalStickerLabReadableMimeType;
	resourceName?: string;
	stickerId: string;
}

export interface ReconciledBatch {
	catalog: LocalStickerLabCatalog;
	primaryReferences: InternalLocalReference[];
	references: InternalLocalReference[];
}

interface LocalReferenceInspection {
	expectedByteSize: number;
	filePath: string;
	key: string;
	stickerId: string;
}

type ManifestRuntimeResource = NonNullable<
	LocalReferenceManifestItem["runtimePackage"]
>["resources"][number];
type ReportRuntimeResource = NonNullable<
	LocalReferenceReportItem["runtimeResources"]
>[number];

function assertUniqueValues({
	label,
	values,
}: {
	label: string;
	values: readonly string[];
}): void {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
		seen.add(value);
	}
}

function reportById({
	report,
}: {
	report: LocalReferenceReport;
}): Map<string, LocalReferenceReportItem> {
	assertUniqueValues({
		label: "report sticker id",
		values: report.success.map(({ id }) => id),
	});
	assertUniqueValues({
		label: "report sticker path",
		values: report.success.map(({ filePath }) => filePath),
	});
	assertUniqueValues({
		label: "report sticker checksum",
		values: report.success.map(({ sha256 }) => sha256),
	});
	return new Map(report.success.map((item) => [item.id, item]));
}

function assertPlaybackMatches({
	item,
	reportVersion,
	reportItem,
}: {
	item: LocalReferenceManifestItem;
	reportVersion: LocalReferenceReport["version"];
	reportItem: LocalReferenceReportItem;
}): void {
	if (item.runtimePackage) {
		if (item.playback.kind !== "animated") {
			throw new Error(`Runtime package requires animated playback: ${item.id}`);
		}
		const { descriptor } = item.runtimePackage;
		const expectedFrameCount =
			descriptor.kind === "atlas-animation" ||
			descriptor.kind === "png-sequence"
				? descriptor.frames.length
				: null;
		const cycleDurationMatches =
			localStickerMediaTimeToTicks({
				seconds: item.playback.cycleDuration,
			}) ===
			localStickerMediaTimeToTicks({
				seconds: descriptor.cycleDurationSeconds,
			});
		const loopMatches =
			item.playback.loop === (descriptor.repeat.kind === "infinite");
		if (
			!cycleDurationMatches ||
			!loopMatches ||
			(expectedFrameCount !== null &&
				item.playback.frameCount !== expectedFrameCount)
		) {
			throw new Error(`Runtime playback metadata mismatch: ${item.id}`);
		}
		if (item.mimeType === "image/png") {
			if (
				reportItem.codec !== "png" ||
				reportItem.frameCount !== 1 ||
				reportItem.frameRate !== null ||
				reportItem.durationSeconds !== null
			) {
				throw new Error(`Runtime preview metadata mismatch: ${item.id}`);
			}
			return;
		}
		if (
			reportItem.codec !== "gif" ||
			reportItem.frameRate === null ||
			reportItem.durationSeconds === null
		) {
			throw new Error(`Runtime preview metadata mismatch: ${item.id}`);
		}
		return;
	}
	if (item.mimeType === "image/png") {
		if (
			item.sourceKind !== "static-image" ||
			item.playback.kind !== "static" ||
			reportItem.frameCount !== 1 ||
			(reportVersion === 2 && reportItem.frameRate !== null) ||
			reportItem.durationSeconds !== null ||
			reportItem.codec !== "png"
		) {
			throw new Error(`Static playback metadata mismatch: ${item.id}`);
		}
		return;
	}
	if (
		!["direct-gif", "preview-gif"].includes(item.sourceKind) ||
		item.playback.kind !== "animated" ||
		reportItem.codec !== "gif" ||
		reportItem.frameRate === null ||
		reportItem.durationSeconds === null ||
		reportItem.frameCount !== item.playback.frameCount
	) {
		throw new Error(`Animated playback metadata mismatch: ${item.id}`);
	}
	const frameRateMatches =
		item.playback.frameRate === undefined ||
		Math.abs(item.playback.frameRate - reportItem.frameRate) <= 1e-9;
	const durationMatches =
		localStickerMediaTimeToTicks({
			seconds: item.playback.cycleDuration,
		}) ===
		localStickerMediaTimeToTicks({ seconds: reportItem.durationSeconds });
	if (!frameRateMatches || !durationMatches) {
		throw new Error(`Animated timing mismatch: ${item.id}`);
	}
}

function assertRuntimeResourceMatchesReport({
	itemId,
	manifestResource,
	reportResource,
}: {
	itemId: string;
	manifestResource: ManifestRuntimeResource;
	reportResource: ReportRuntimeResource;
}): void {
	if (
		reportResource.resourceName !== manifestResource.resourceName ||
		reportResource.fileName !== manifestResource.fileName ||
		reportResource.filePath !== manifestResource.filePath ||
		reportResource.mimeType !== manifestResource.mimeType
	) {
		throw new Error(
			`Runtime manifest/report metadata mismatch: ${itemId}/${manifestResource.resourceName}`
		);
	}
	if (basename(manifestResource.filePath) !== manifestResource.fileName) {
		throw new Error(
			`Runtime resource fileName does not match its path: ${itemId}/${manifestResource.resourceName}`
		);
	}
	const expectedExtension =
		manifestResource.mimeType === "image/png" ? ".png" : ".webm";
	if (
		!manifestResource.fileName.toLocaleLowerCase().endsWith(expectedExtension)
	) {
		throw new Error(
			`Runtime resource extension does not match MIME type: ${itemId}/${manifestResource.resourceName}`
		);
	}
}

function assertAlphaVideoDurationMatchesReport({
	item,
	reportResourceByName,
}: {
	item: LocalReferenceManifestItem;
	reportResourceByName: ReadonlyMap<string, ReportRuntimeResource>;
}): void {
	const descriptor = item.runtimePackage?.descriptor;
	if (descriptor?.kind !== "alpha-video") return;
	const expectedDurationTicks = localStickerMediaTimeToTicks({
		seconds: descriptor.sourceDurationSeconds,
	});
	const sourceNames = [
		descriptor.source,
		...(descriptor.layout.kind === "separate-mask"
			? [descriptor.layout.maskSource]
			: []),
	];
	for (const sourceName of sourceNames) {
		const reportResource = reportResourceByName.get(sourceName);
		if (
			reportResource?.mimeType === "video/webm" &&
			reportResource.durationSeconds !== null &&
			localStickerMediaTimeToTicks({
				seconds: reportResource.durationSeconds,
			}) === expectedDurationTicks
		) {
			continue;
		}
		throw new Error(
			`Alpha-video source duration mismatch: ${item.id}/${sourceName}`
		);
	}
}

function assertItemMatchesReport({
	category,
	item,
	itemIndex,
	reportVersion,
	reportItem,
}: {
	category: LocalReferenceManifestCategory;
	item: LocalReferenceManifestItem;
	itemIndex: number;
	reportVersion: LocalReferenceReport["version"];
	reportItem: LocalReferenceReportItem;
}): void {
	if (
		reportItem.categoryId !== category.id ||
		reportItem.category !== category.label ||
		(reportVersion === 2 && reportItem.position !== itemIndex) ||
		reportItem.title !== item.displayName ||
		reportItem.sourceKind !== item.sourceKind ||
		reportItem.mimeType !== item.mimeType ||
		reportItem.filePath !== item.filePath
	) {
		throw new Error(`Manifest/report metadata mismatch: ${item.id}`);
	}
	if (basename(item.filePath) !== item.fileName) {
		throw new Error(`Sticker fileName does not match its path: ${item.id}`);
	}
	const extension = item.mimeType === "image/gif" ? ".gif" : ".png";
	if (!item.fileName.toLocaleLowerCase().endsWith(extension)) {
		throw new Error(`Sticker extension does not match MIME type: ${item.id}`);
	}
	assertPlaybackMatches({ item, reportVersion, reportItem });
	const manifestResources = item.runtimePackage?.resources ?? [];
	const reportResources = reportItem.runtimeResources ?? [];
	if (manifestResources.length !== reportResources.length) {
		throw new Error(`Runtime resource count mismatch: ${item.id}`);
	}
	const reportResourceByName = new Map(
		reportResources.map((resource) => [resource.resourceName, resource])
	);
	if (reportResourceByName.size !== reportResources.length) {
		throw new Error(`Duplicate runtime report resource name: ${item.id}`);
	}
	for (const manifestResource of manifestResources) {
		const reportResource = reportResourceByName.get(
			manifestResource.resourceName
		);
		if (!reportResource) {
			throw new Error(
				`Runtime report resource is missing: ${item.id}/${manifestResource.resourceName}`
			);
		}
		assertRuntimeResourceMatchesReport({
			itemId: item.id,
			manifestResource,
			reportResource,
		});
	}
	assertAlphaVideoDurationMatchesReport({
		item,
		reportResourceByName,
	});
}

function assertLegacyReportOrdering({
	manifestCategories,
	reportItems,
}: {
	manifestCategories: readonly LocalReferenceManifestCategory[];
	reportItems: ReadonlyMap<string, LocalReferenceReportItem>;
}): void {
	for (const category of manifestCategories) {
		let previousPosition = -1;
		for (const item of category.items) {
			const reportItem = reportItems.get(item.id);
			if (!reportItem) throw new Error(`Report is missing sticker: ${item.id}`);
			if (reportItem.position <= previousPosition) {
				throw new Error(`Legacy report order mismatch: ${item.id}`);
			}
			previousPosition = reportItem.position;
		}
	}
}

export async function mapWithConcurrency<TInput, TOutput>({
	concurrency,
	inputs,
	worker,
}: {
	concurrency: number;
	inputs: readonly TInput[];
	worker: ({ input }: { input: TInput }) => Promise<TOutput>;
}): Promise<TOutput[]> {
	const outputs = new Array<TOutput>(inputs.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= inputs.length) return;
		outputs[index] = await worker({ input: inputs[index] as TInput });
		return runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, inputs.length) }, () =>
			runNext()
		)
	);
	return outputs;
}

function inspectionKey({
	resourceName,
	stickerId,
}: {
	resourceName?: string;
	stickerId: string;
}): string {
	return `${stickerId}\0${resourceName ?? ""}`;
}

function requiredInspectedPath({
	canonicalPathByKey,
	key,
}: {
	canonicalPathByKey: ReadonlyMap<string, string>;
	key: string;
}): string {
	const canonicalPath = canonicalPathByKey.get(key);
	if (!canonicalPath) {
		throw new Error(`Validated sticker path is missing: ${key}`);
	}
	return canonicalPath;
}

export async function reconcileBatch({
	batchId,
	batchRoot,
	fileConcurrency,
	rootPath,
}: {
	batchId: string;
	batchRoot: string;
	fileConcurrency: number;
	rootPath: string;
}): Promise<ReconciledBatch> {
	const [manifestCandidate, reportCandidate] = await Promise.all([
		readSecureJson({
			batchRoot,
			filePath: join(batchRoot, "manifest.json"),
			label: `${batchId} manifest`,
		}),
		readSecureJson({
			batchRoot,
			filePath: join(batchRoot, "report.json"),
			label: `${batchId} report`,
		}),
	]);
	const manifest = parseLocalReferenceManifest({
		candidate: manifestCandidate,
	});
	const report = parseLocalReferenceReport({ candidate: reportCandidate });
	assertUniqueValues({
		label: "category id within batch",
		values: manifest.categories.map(({ id }) => id),
	});
	const manifestItems = manifest.categories.flatMap(({ items }) => items);
	assertUniqueValues({
		label: "sticker id within batch",
		values: manifestItems.map(({ id }) => id),
	});
	assertUniqueValues({
		label: "sticker path within batch",
		values: manifestItems.map(({ filePath }) => filePath),
	});
	if (manifestItems.length !== report.success.length) {
		throw new Error("Manifest/report item counts do not match");
	}
	const indexedReport = reportById({ report });
	if (report.version === 1) {
		assertLegacyReportOrdering({
			manifestCategories: manifest.categories,
			reportItems: indexedReport,
		});
	}
	const validationInputs = manifest.categories.flatMap((category) =>
		category.items.map((item, itemIndex) => ({ category, item, itemIndex }))
	);
	const validatedItems = validationInputs.map(
		({ category, item, itemIndex }) => {
			const reportItem = indexedReport.get(item.id);
			if (!reportItem) {
				throw new Error(`Report is missing sticker: ${item.id}`);
			}
			assertItemMatchesReport({
				category,
				item,
				itemIndex,
				reportVersion: report.version,
				reportItem,
			});
			const reportRuntimeResourceByName = new Map(
				(reportItem.runtimeResources ?? []).map((resource) => [
					resource.resourceName,
					resource,
				])
			);
			return { item, reportItem, reportRuntimeResourceByName };
		}
	);
	const inspectionInputs: LocalReferenceInspection[] = validatedItems.flatMap(
		({ item, reportItem, reportRuntimeResourceByName }) => [
			{
				expectedByteSize: reportItem.byteSize,
				filePath: item.filePath,
				key: inspectionKey({ stickerId: item.id }),
				stickerId: item.id,
			},
			...(item.runtimePackage?.resources.map((resource) => {
				const reportResource = reportRuntimeResourceByName.get(
					resource.resourceName
				);
				if (!reportResource) {
					throw new Error(
						`Runtime report resource is missing: ${item.id}/${resource.resourceName}`
					);
				}
				return {
					expectedByteSize: reportResource.byteSize,
					filePath: resource.filePath,
					key: inspectionKey({
						resourceName: resource.resourceName,
						stickerId: item.id,
					}),
					stickerId: `${item.id}/${resource.resourceName}`,
				};
			}) ?? []),
		]
	);
	const inspectedFiles = await mapWithConcurrency({
		concurrency: fileConcurrency,
		inputs: inspectionInputs,
		worker: async ({ input }) => ({
			canonicalPath: await inspectLocalStickerFile({
				batchRoot,
				expectedByteSize: input.expectedByteSize,
				filePath: input.filePath,
				stickerId: input.stickerId,
			}),
			key: input.key,
		}),
	});
	const canonicalPathByKey = new Map(
		inspectedFiles.map(({ canonicalPath, key }) => [key, canonicalPath])
	);
	const reconciled = validatedItems.map(
		({ item, reportItem, reportRuntimeResourceByName }) => {
			const canonicalPath = requiredInspectedPath({
				canonicalPathByKey,
				key: inspectionKey({ stickerId: item.id }),
			});
			const runtimeResources = (item.runtimePackage?.resources ?? []).map(
				(resource) => {
					const reportResource = reportRuntimeResourceByName.get(
						resource.resourceName
					);
					if (!reportResource) {
						throw new Error(
							`Runtime report resource is missing: ${item.id}/${resource.resourceName}`
						);
					}
					const resourcePath = requiredInspectedPath({
						canonicalPathByKey,
						key: inspectionKey({
							resourceName: resource.resourceName,
							stickerId: item.id,
						}),
					});
					const internal: InternalLocalReference = {
						batchId,
						batchRoot,
						byteSize: reportResource.byteSize,
						checksumSha256: reportResource.sha256,
						fileName: resource.fileName,
						filePath: resourcePath,
						mimeType: resource.mimeType,
						resourceName: resource.resourceName,
						stickerId: item.id,
					};
					const reference: LocalStickerLabRuntimeResource = {
						resourceName: resource.resourceName,
						fileName: resource.fileName,
						mimeType: resource.mimeType,
						asset: {
							kind: "local-reference-runtime-resource",
							rootPath,
							batchId,
							stickerId: item.id,
							resourceName: resource.resourceName,
							byteSize: reportResource.byteSize,
							checksumSha256: reportResource.sha256,
						},
					};
					return { internal, reference };
				}
			);
			const reference: LocalStickerLabReference = {
				id: item.id,
				displayName: item.displayName,
				fileName: item.fileName,
				mimeType: item.mimeType,
				sourceKind: item.sourceKind,
				playback: item.playback,
				asset: {
					kind: "local-reference",
					rootPath,
					batchId,
					stickerId: item.id,
					byteSize: reportItem.byteSize,
					checksumSha256: reportItem.sha256,
				},
				...(item.runtimePackage
					? {
							runtimePackage: {
								descriptor: item.runtimePackage.descriptor,
								resources: runtimeResources.map(
									({ reference: runtimeReference }) => runtimeReference
								),
							},
						}
					: {}),
			};
			const primaryInternal: InternalLocalReference = {
				batchId,
				batchRoot,
				byteSize: reportItem.byteSize,
				checksumSha256: reportItem.sha256,
				fileName: item.fileName,
				filePath: canonicalPath,
				mimeType: item.mimeType,
				stickerId: item.id,
			};
			return {
				internals: [
					primaryInternal,
					...runtimeResources.map(({ internal }) => internal),
				],
				primaryInternal,
				reference,
			};
		}
	);
	const referenceById = new Map(
		reconciled.map(({ reference }) => [reference.id, reference])
	);
	let totalBytes = 0;
	const categories = manifest.categories.map((category) => {
		const items = category.items.map((item) => {
			const reference = referenceById.get(item.id);
			if (!reference)
				throw new Error(`Validated sticker is missing: ${item.id}`);
			return reference;
		});
		const categoryBytes = items.reduce(
			(total, item) =>
				total +
				item.asset.byteSize +
				(item.runtimePackage?.resources.reduce(
					(resourceTotal, resource) => resourceTotal + resource.asset.byteSize,
					0
				) ?? 0),
			0
		);
		if (categoryBytes > MAX_LOCAL_REFERENCE_CATEGORY_BYTES) {
			throw new Error(`Category ${category.id} exceeds its byte limit`);
		}
		totalBytes += categoryBytes;
		return {
			id: category.id,
			label: category.label,
			sourcePanel: category.sourcePanel,
			items,
		};
	});
	if (totalBytes > MAX_LOCAL_REFERENCE_CATALOG_BYTES) {
		throw new Error(`${batchId} exceeds its catalog byte limit`);
	}
	return {
		catalog: {
			version: 1,
			batchId,
			referenceOnly: true,
			...(manifest.generatedAt ? { generatedAt: manifest.generatedAt } : {}),
			categories,
			itemCount: manifestItems.length,
			totalBytes,
		},
		primaryReferences: reconciled.map(({ primaryInternal }) => primaryInternal),
		references: reconciled.flatMap(({ internals }) => internals),
	};
}
