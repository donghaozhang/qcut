import type { AssetManifestEntry } from "@qcut/editor-core";
import {
	assertStickerRuntimeDescriptor,
	type StickerRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import type { MediaType } from "@/stores/media/media-store-types";

const PRIMARY_SOURCE = "$primary" as const;
const RESOURCE_PREFIX = "$resource:" as const;

interface RuntimePackageFile {
	checksumSha256?: string;
	file: File;
	sourceUrl: string;
}

export interface PreparedStickerRuntimeResource extends RuntimePackageFile {
	mediaType: Exclude<MediaType, "audio">;
	resourceName: string;
}

export interface PreparedStickerRuntimePackage {
	descriptor: StickerRuntimeDescriptor;
	primaryMediaType: Exclude<MediaType, "audio">;
	resources: PreparedStickerRuntimeResource[];
}

interface RuntimeSourceRequirement {
	expectedType: Exclude<MediaType, "audio">;
	source: string;
}

interface RuntimeSourceCandidate extends RuntimePackageFile {
	index: number;
	isPrimary: boolean;
	mediaType: Exclude<MediaType, "audio">;
}

export class StickerRuntimePackageError extends Error {
	readonly code = "QCUT_STICKER_RUNTIME_PACKAGE" as const;

	constructor({ message }: { message: string }) {
		super(`[QCUT_STICKER_RUNTIME_PACKAGE] ${message}`);
		this.name = "StickerRuntimePackageError";
	}
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

export function readStickerRuntimePackageDescriptor({
	asset,
}: {
	asset: AssetManifestEntry;
}): StickerRuntimeDescriptor | undefined {
	const metadata = asRecord({ value: asset.metadata });
	const descriptor = metadata?.stickerRuntime;
	if (descriptor === undefined || descriptor === null) return;
	assertStickerRuntimeDescriptor({ descriptor });
	return descriptor as StickerRuntimeDescriptor;
}

function fileMediaType({ file }: { file: File }): Exclude<MediaType, "audio"> {
	const mimeType = file.type.toLocaleLowerCase();
	const fileName = file.name.toLocaleLowerCase();
	if (
		mimeType.startsWith("image/") ||
		/\.(?:gif|jpe?g|png|svg|webp)$/.test(fileName)
	) {
		return "image";
	}
	if (
		mimeType.startsWith("video/") ||
		/\.(?:m4v|mov|mp4|webm)$/.test(fileName)
	) {
		return "video";
	}
	throw new StickerRuntimePackageError({
		message: `Runtime resource is not browser-renderable media: ${file.name}`,
	});
}

function decodedPath({ value }: { value: string }): string {
	const withoutQuery = value.split(/[?#]/, 1)[0]?.replaceAll("\\", "/") ?? "";
	try {
		return decodeURIComponent(withoutQuery);
	} catch {
		return withoutQuery;
	}
}

function pathName({ value }: { value: string }): string {
	try {
		return decodedPath({
			value: new URL(value, "https://qcut.invalid").pathname,
		});
	} catch {
		return decodedPath({ value });
	}
}

function withoutLeadingPathMarkers({ value }: { value: string }): string {
	return value.replace(/^\.\//, "").replace(/^\/+/, "");
}

function baseName({ value }: { value: string }): string {
	return withoutLeadingPathMarkers({ value }).split("/").at(-1) ?? "";
}

function sourceMatchScore({
	candidate,
	source,
}: {
	candidate: string;
	source: string;
}): number {
	if (candidate === source) return 4;
	const candidatePath = withoutLeadingPathMarkers({
		value: pathName({ value: candidate }),
	});
	const sourcePath = withoutLeadingPathMarkers({
		value: pathName({ value: source }),
	});
	if (candidatePath === sourcePath) return 3;
	if (
		candidatePath.endsWith(`/${sourcePath}`) ||
		sourcePath.endsWith(`/${candidatePath}`)
	) {
		return 2;
	}
	return baseName({ value: candidatePath }) === baseName({ value: sourcePath })
		? 1
		: 0;
}

function resolveSourceCandidate({
	candidates,
	requirement,
}: {
	candidates: readonly RuntimeSourceCandidate[];
	requirement: RuntimeSourceRequirement;
}): RuntimeSourceCandidate {
	if (requirement.source.startsWith(RESOURCE_PREFIX)) {
		throw new StickerRuntimePackageError({
			message:
				"Asset manifests must use ordinary package source names before project registration",
		});
	}
	const ranked = candidates
		.map((candidate) => ({
			candidate,
			score: sourceMatchScore({
				candidate: candidate.sourceUrl,
				source: requirement.source,
			}),
		}))
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score);
	const bestScore = ranked[0]?.score ?? 0;
	const bestMatches = ranked.filter(({ score }) => score === bestScore);
	if (bestMatches.length !== 1) {
		throw new StickerRuntimePackageError({
			message:
				bestMatches.length === 0
					? `Runtime source is missing from the asset manifest: ${requirement.source}`
					: `Runtime source is ambiguous in the asset manifest: ${requirement.source}`,
		});
	}
	const match = bestMatches[0]?.candidate;
	if (!match) {
		throw new StickerRuntimePackageError({
			message: `Runtime source is missing from the asset manifest: ${requirement.source}`,
		});
	}
	if (match.mediaType !== requirement.expectedType) {
		throw new StickerRuntimePackageError({
			message: `Runtime source ${requirement.source} requires ${requirement.expectedType} media, received ${match.mediaType}`,
		});
	}
	return match;
}

function runtimeSourceRequirements({
	descriptor,
}: {
	descriptor: StickerRuntimeDescriptor;
}): RuntimeSourceRequirement[] {
	switch (descriptor.kind) {
		case "direct-gif":
			return [{ expectedType: "image", source: PRIMARY_SOURCE }];
		case "atlas-animation":
			return [
				{
					expectedType: "image",
					source: descriptor.atlasSource ?? PRIMARY_SOURCE,
				},
			];
		case "png-sequence":
			return descriptor.frames.map((frame) => ({
				expectedType: "image",
				source: frame.source,
			}));
		case "alpha-video":
			return [
				{ expectedType: "video", source: descriptor.source },
				...(descriptor.layout.kind === "separate-mask"
					? [
							{
								expectedType: "video" as const,
								source: descriptor.layout.maskSource,
							},
						]
					: []),
			];
		default: {
			const unsupported: never = descriptor;
			throw new StickerRuntimePackageError({
				message: `Unsupported runtime descriptor: ${String(unsupported)}`,
			});
		}
	}
}

function requiredPrimaryCandidate({
	primary,
}: {
	primary: RuntimePackageFile;
}): RuntimeSourceCandidate {
	return {
		...primary,
		index: -1,
		isPrimary: true,
		mediaType: fileMediaType({ file: primary.file }),
	};
}

function normalizedResourceName({ index }: { index: number }): string {
	return `asset_${String(index + 1).padStart(4, "0")}`;
}

export function prepareStickerRuntimePackage({
	descriptor,
	primary,
	resources,
}: {
	descriptor: StickerRuntimeDescriptor;
	primary: RuntimePackageFile;
	resources: readonly RuntimePackageFile[];
}): PreparedStickerRuntimePackage {
	assertStickerRuntimeDescriptor({ descriptor });
	const primaryCandidate = requiredPrimaryCandidate({ primary });
	const resourceCandidates = resources.map((resource, index) => ({
		...resource,
		index,
		isPrimary: false,
		mediaType: fileMediaType({ file: resource.file }),
	}));
	const candidates = [primaryCandidate, ...resourceCandidates];
	const requirements = runtimeSourceRequirements({ descriptor });
	const resolvedSources = new Map<string, RuntimeSourceCandidate>();
	const normalizeSource = ({
		expectedType,
		source,
	}: RuntimeSourceRequirement): string => {
		if (source === PRIMARY_SOURCE) {
			if (primaryCandidate.mediaType !== expectedType) {
				throw new StickerRuntimePackageError({
					message: `Primary runtime source requires ${expectedType} media, received ${primaryCandidate.mediaType}`,
				});
			}
			return PRIMARY_SOURCE;
		}
		const candidate = resolveSourceCandidate({
			candidates,
			requirement: { expectedType, source },
		});
		if (candidate.isPrimary) return PRIMARY_SOURCE;
		const resourceName = normalizedResourceName({ index: candidate.index });
		resolvedSources.set(resourceName, candidate);
		return `${RESOURCE_PREFIX}${resourceName}`;
	};

	let normalizedDescriptor: StickerRuntimeDescriptor;
	switch (descriptor.kind) {
		case "direct-gif":
			normalizeSource(
				requirements[0] ?? {
					expectedType: "image",
					source: PRIMARY_SOURCE,
				}
			);
			normalizedDescriptor = descriptor;
			break;
		case "atlas-animation":
			normalizedDescriptor = {
				...descriptor,
				atlasSource: normalizeSource(
					requirements[0] ?? {
						expectedType: "image",
						source: PRIMARY_SOURCE,
					}
				),
			};
			break;
		case "png-sequence":
			normalizedDescriptor = {
				...descriptor,
				frames: descriptor.frames.map((frame) => ({
					...frame,
					source: normalizeSource({
						expectedType: "image",
						source: frame.source,
					}),
				})),
			};
			break;
		case "alpha-video":
			normalizedDescriptor = {
				...descriptor,
				source: normalizeSource({
					expectedType: "video",
					source: descriptor.source,
				}),
				layout:
					descriptor.layout.kind === "separate-mask"
						? {
								...descriptor.layout,
								maskSource: normalizeSource({
									expectedType: "video",
									source: descriptor.layout.maskSource,
								}),
							}
						: descriptor.layout,
			};
			break;
		default: {
			const unsupported: never = descriptor;
			throw new StickerRuntimePackageError({
				message: `Unsupported runtime descriptor: ${String(unsupported)}`,
			});
		}
	}
	assertStickerRuntimeDescriptor({ descriptor: normalizedDescriptor });
	return {
		descriptor: normalizedDescriptor,
		primaryMediaType: primaryCandidate.mediaType,
		resources: [...resolvedSources.entries()]
			.sort((left, right) => left[1].index - right[1].index)
			.map(([resourceName, resource]) => ({
				...(resource.checksumSha256
					? { checksumSha256: resource.checksumSha256 }
					: {}),
				file: resource.file,
				mediaType: resource.mediaType,
				resourceName,
				sourceUrl: resource.sourceUrl,
			})),
	};
}
