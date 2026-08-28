export interface JianyingAudioMetadataRecord {
	resourceId: string;
	metadataMd5: string;
	publishSource: string;
	author: { name: string; source: string };
	access: {
		isVip: boolean | null;
		paidType: string;
		businessScope: string[];
		copyrightText: string;
		copyrightArtist: string;
	};
	status: number | null;
	observedAt: string;
}

export interface SoundEffectsSourceResource {
	resourceId: string;
	contentMd5: string;
	mappingStrategy: string;
	source?: unknown;
	[key: string]: unknown;
}

export interface SoundEffectsSourceMap {
	schemaVersion: 1;
	generatedAt: string;
	summary: Record<string, number>;
	resources: SoundEffectsSourceResource[];
	[key: string]: unknown;
}

export interface JianyingMetadataEnrichmentSummary {
	candidateCount: number;
	matchedCount: number;
	unmatchedCount: number;
	vipCount: number;
	freeOrUnmarkedCount: number;
	authorCount: number;
	copyrightCount: number;
}

interface EnrichmentResult {
	source: SoundEffectsSourceMap;
	summary: JianyingMetadataEnrichmentSummary;
	unmatchedResourceIds: string[];
}

function nonEmpty({ value }: { value: string }): string | undefined {
	const trimmed = value.trim();
	return trimmed || undefined;
}

function latestRecord({
	records,
}: {
	records: JianyingAudioMetadataRecord[];
}): JianyingAudioMetadataRecord {
	return [...records].sort((left, right) =>
		right.observedAt.localeCompare(left.observedAt)
	)[0];
}

function recordForResource({
	records,
	resource,
}: {
	records: JianyingAudioMetadataRecord[];
	resource: SoundEffectsSourceResource;
}): JianyingAudioMetadataRecord | undefined {
	const matchingId = records.filter(
		(record) => record.resourceId === resource.resourceId
	);
	if (matchingId.length === 0) return undefined;
	const exactHash = matchingId.filter(
		(record) => record.metadataMd5 === resource.contentMd5
	);
	return latestRecord({
		records: exactHash.length > 0 ? exactHash : matchingId,
	});
}

function jianyingSource({ record }: { record: JianyingAudioMetadataRecord }) {
	const authorName = nonEmpty({ value: record.author.name });
	const authorSource = nonEmpty({ value: record.author.source });
	const copyrightText = nonEmpty({ value: record.access.copyrightText });
	const copyrightArtist = nonEmpty({ value: record.access.copyrightArtist });
	return {
		provider: "jianying-reference" as const,
		redistribution: "prohibited" as const,
		publishSource: nonEmpty({ value: record.publishSource }),
		author: authorName
			? { name: authorName, ...(authorSource ? { source: authorSource } : {}) }
			: undefined,
		access: {
			isVip: record.access.isVip,
			paidType: nonEmpty({ value: record.access.paidType }),
			businessScope:
				record.access.businessScope.length > 0
					? record.access.businessScope
					: undefined,
		},
		copyright:
			copyrightText || copyrightArtist
				? { text: copyrightText, artist: copyrightArtist }
				: undefined,
		status: record.status,
	};
}

export function enrichSourceMap({
	records,
	source,
}: {
	records: JianyingAudioMetadataRecord[];
	source: SoundEffectsSourceMap;
}): EnrichmentResult {
	let matchedCount = 0;
	let vipCount = 0;
	let freeOrUnmarkedCount = 0;
	let authorCount = 0;
	let copyrightCount = 0;
	const unmatchedResourceIds: string[] = [];
	const resources = source.resources.map((resource) => {
		if (resource.mappingStrategy === "freesound-cc0") return resource;
		const record = recordForResource({ records, resource });
		if (!record) {
			unmatchedResourceIds.push(resource.resourceId);
			return resource;
		}
		matchedCount += 1;
		if (record.access.isVip === true) vipCount += 1;
		else freeOrUnmarkedCount += 1;
		if (record.author.name.trim()) authorCount += 1;
		if (
			record.access.copyrightText.trim() ||
			record.access.copyrightArtist.trim()
		) {
			copyrightCount += 1;
		}
		return { ...resource, source: jianyingSource({ record }) };
	});
	const candidateCount = resources.filter(
		(resource) => resource.mappingStrategy !== "freesound-cc0"
	).length;
	const summary = {
		candidateCount,
		matchedCount,
		unmatchedCount: unmatchedResourceIds.length,
		vipCount,
		freeOrUnmarkedCount,
		authorCount,
		copyrightCount,
	};
	return {
		source: {
			...source,
			generatedAt: new Date().toISOString(),
			summary: {
				...source.summary,
				jianyingMetadataCandidateCount: candidateCount,
				jianyingMetadataMatchedCount: matchedCount,
				jianyingMetadataUnmatchedCount: unmatchedResourceIds.length,
				jianyingVipCount: vipCount,
			},
			resources,
		},
		summary,
		unmatchedResourceIds,
	};
}
