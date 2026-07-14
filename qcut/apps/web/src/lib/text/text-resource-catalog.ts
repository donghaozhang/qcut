import type {
	TextTemplateDefinition,
	TextTemplateResource,
	TextTemplateResourceEntitlement,
} from "./text-template-registry";
import generatedTextAssetManifest from "./text-asset-generated-manifest.json";

type TextTemplateGeneratedAssetFile = {
	url: string;
	mimeType: string;
	byteSize: number;
	checksumSha256: string;
};

type TextTemplateGeneratedAsset = {
	assetId: string;
	packageId: string;
	version: number;
	cacheKey: string;
	thumbnail: TextTemplateGeneratedAssetFile;
	source: TextTemplateGeneratedAssetFile;
};

const textAssetManifest = generatedTextAssetManifest as Readonly<
	Record<string, TextTemplateGeneratedAsset | undefined>
>;

export interface TextTemplateResourcePackage {
	packageId: string;
	version: number;
	entitlement: TextTemplateResourceEntitlement;
	assetIds: readonly string[];
	cacheKeys: readonly string[];
	sizeKb: number;
	categories: readonly TextTemplateDefinition["category"][];
	groupIds: readonly TextTemplateDefinition["groupId"][];
}

export interface TextTemplateResourceFiles {
	thumbnailUrl: string;
	sourceUrl: string;
	byteSize: number;
	thumbnailByteSize: number;
	sourceByteSize: number;
	thumbnailChecksumSha256?: string;
	sourceChecksumSha256?: string;
	bundled: boolean;
}

export function getTextTemplateResource({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplateResource {
	if (definition.resource) return definition.resource;
	return {
		assetId: `text-legacy-${definition.id}`,
		packageId: `text-${definition.groupId}-${definition.category}`,
		version: 1,
		entitlement: definition.premium ? "svip" : "free",
		cacheKey: `text-assets/legacy/${definition.id}@1`,
		sizeKb: definition.premium ? 384 : 192,
	};
}

export function getTextTemplateResourceFiles({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextTemplateResourceFiles {
	const resource = getTextTemplateResource({ definition });
	const bundledAsset = textAssetManifest[resource.assetId];
	if (
		bundledAsset &&
		bundledAsset.packageId === resource.packageId &&
		bundledAsset.cacheKey === resource.cacheKey &&
		bundledAsset.version === resource.version
	) {
		return {
			thumbnailUrl: bundledAsset.thumbnail.url,
			sourceUrl: bundledAsset.source.url,
			byteSize: bundledAsset.source.byteSize,
			thumbnailByteSize: bundledAsset.thumbnail.byteSize,
			sourceByteSize: bundledAsset.source.byteSize,
			thumbnailChecksumSha256: bundledAsset.thumbnail.checksumSha256,
			sourceChecksumSha256: bundledAsset.source.checksumSha256,
			bundled: true,
		};
	}
	return {
		thumbnailUrl: `qcut-text-asset://${resource.cacheKey}/thumbnail.webp`,
		sourceUrl: `qcut-text-asset://${resource.cacheKey}/template.json`,
		byteSize: resource.sizeKb * 1024,
		thumbnailByteSize: Math.round(resource.sizeKb * 1024 * 0.18),
		sourceByteSize: resource.sizeKb * 1024,
		bundled: false,
	};
}

export function buildTextTemplateResourcePackages({
	definitions,
}: {
	definitions: readonly TextTemplateDefinition[];
}): TextTemplateResourcePackage[] {
	const packagesById = new Map<string, TextTemplateResourcePackage>();
	for (const definition of definitions) {
		const resource = getTextTemplateResource({ definition });
		const existing = packagesById.get(resource.packageId);
		if (!existing) {
			packagesById.set(resource.packageId, {
				packageId: resource.packageId,
				version: resource.version,
				entitlement: resource.entitlement,
				assetIds: [resource.assetId],
				cacheKeys: [resource.cacheKey],
				sizeKb: resource.sizeKb,
				categories: [definition.category],
				groupIds: [definition.groupId],
			});
			continue;
		}
		packagesById.set(resource.packageId, {
			...existing,
			version: Math.max(existing.version, resource.version),
			entitlement:
				existing.entitlement === "svip" || resource.entitlement === "svip"
					? "svip"
					: "free",
			assetIds: appendUnique({
				values: existing.assetIds,
				value: resource.assetId,
			}),
			cacheKeys: appendUnique({
				values: existing.cacheKeys,
				value: resource.cacheKey,
			}),
			sizeKb: existing.sizeKb + resource.sizeKb,
			categories: appendUnique({
				values: existing.categories,
				value: definition.category,
			}),
			groupIds: appendUnique({
				values: existing.groupIds,
				value: definition.groupId,
			}),
		});
	}
	return [...packagesById.values()].sort((left, right) =>
		left.packageId.localeCompare(right.packageId)
	);
}

function appendUnique<TValue>({
	value,
	values,
}: {
	value: TValue;
	values: readonly TValue[];
}): TValue[] {
	return values.includes(value) ? [...values] : [...values, value];
}
