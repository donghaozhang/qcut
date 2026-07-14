import type {
	TextTemplateDefinition,
	TextTemplateResource,
	TextTemplateResourceEntitlement,
} from "./text-template-registry";

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
	return {
		thumbnailUrl: `qcut-text-asset://${resource.cacheKey}/thumbnail.webp`,
		sourceUrl: `qcut-text-asset://${resource.cacheKey}/template.json`,
		byteSize: resource.sizeKb * 1024,
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
