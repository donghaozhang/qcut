import type { MigrationCaseDefinition } from "./migration-case-builder.js";

interface CopiedAssetIdentity {
	bytes: number;
	mediaId: string;
	sha256: string;
	type: string;
}

interface GeneratedAssetIdentity {
	kind: string;
}

interface ExpectedAssetIntegrity {
	bytes: number;
	sha256: string;
}

export interface ExpectedMigrationSourceAssets {
	sourceAudio: ExpectedAssetIntegrity;
	sourceVideo: ExpectedAssetIntegrity;
	sticker: ExpectedAssetIntegrity;
}

const EXPECTED_COPIED_ASSETS: Record<
	MigrationCaseDefinition["caseId"],
	readonly string[]
> = {
	dissolve: ["video:source-video"],
	"lut-mask": ["video:source-video"],
	"native-text-sticker": [
		"audio:source-audio",
		"image:qcut-icon",
		"video:source-video",
	],
};

const EXPECTED_GENERATED_ASSETS: Record<
	MigrationCaseDefinition["caseId"],
	readonly string[]
> = {
	dissolve: [],
	"lut-mask": ["generated-lut"],
	"native-text-sticker": [],
};

function assertExactInventory({
	actual,
	caseId,
	expected,
	label,
}: {
	actual: string[];
	caseId: MigrationCaseDefinition["caseId"];
	expected: readonly string[];
	label: string;
}): void {
	actual.sort();
	const expectedSorted = [...expected].sort();
	if (JSON.stringify(actual) !== JSON.stringify(expectedSorted)) {
		throw new Error(
			`${caseId} ${label} changed; expected ${JSON.stringify(expectedSorted)}, received ${JSON.stringify(actual)}.`
		);
	}
}

export function assertMigrationCaseAssetInventory({
	caseId,
	copiedAssets,
	expectedAssets,
	generatedAssets,
}: {
	caseId: MigrationCaseDefinition["caseId"];
	copiedAssets: readonly CopiedAssetIdentity[];
	expectedAssets: ExpectedMigrationSourceAssets;
	generatedAssets: readonly GeneratedAssetIdentity[];
}): void {
	assertExactInventory({
		actual: copiedAssets.map(({ mediaId, type }) => `${type}:${mediaId}`),
		caseId,
		expected: EXPECTED_COPIED_ASSETS[caseId],
		label: "copied asset inventory",
	});
	assertExactInventory({
		actual: generatedAssets.map(({ kind }) => kind),
		caseId,
		expected: EXPECTED_GENERATED_ASSETS[caseId],
		label: "generated asset inventory",
	});
	const expectedIntegrityByMediaId: Record<string, ExpectedAssetIntegrity> = {
		"qcut-icon": expectedAssets.sticker,
		"source-audio": expectedAssets.sourceAudio,
		"source-video": expectedAssets.sourceVideo,
	};
	for (const asset of copiedAssets) {
		const expectedIntegrity = expectedIntegrityByMediaId[asset.mediaId];
		if (
			!expectedIntegrity ||
			asset.bytes !== expectedIntegrity.bytes ||
			asset.sha256 !== expectedIntegrity.sha256
		) {
			throw new Error(
				`${caseId} copied asset ${asset.mediaId} is not bound to its source evidence.`
			);
		}
	}
}
