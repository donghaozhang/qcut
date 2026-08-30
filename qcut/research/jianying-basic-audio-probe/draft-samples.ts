import { readFileSync } from "node:fs";

import { findDraftCandidateFiles } from "../../.agents/skills/qcut-toolkit/jianying-draft-binary-reference/scripts/draft-evidence";
import {
	AUDIO_BASIC_CAPABILITIES,
	type AudioBasicCapabilityId,
	isActiveAudioMaterial,
	isActiveAudioSegment,
} from "./capabilities";

type JsonRecord = Record<string, unknown>;

export interface AudioCapabilityDraftSamples {
	activeMaterialObjects: number;
	activeSegments: number;
	collectionObjects: Record<string, number>;
	materialObjects: number;
	segmentFieldOccurrences: Record<string, number>;
	segmentsWithFields: number;
}

export type AudioDraftSamples = Record<
	AudioBasicCapabilityId,
	AudioCapabilityDraftSamples
>;

function recordValue({ value }: { value: unknown }): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function records({ value }: { value: unknown }): JsonRecord[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const record = recordValue({ value: entry });
		return record ? [record] : [];
	});
}

function parseJsonRecord({ bytes }: { bytes: Uint8Array }): JsonRecord | null {
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return recordValue({ value });
	} catch {
		return null;
	}
}

function emptySamples(): AudioDraftSamples {
	return Object.fromEntries(
		AUDIO_BASIC_CAPABILITIES.map(({ id }) => [
			id,
			{
				activeMaterialObjects: 0,
				activeSegments: 0,
				collectionObjects: {},
				materialObjects: 0,
				segmentFieldOccurrences: {},
				segmentsWithFields: 0,
			},
		])
	) as AudioDraftSamples;
}

export function summarizeAudioDraftDocuments({
	documents,
}: {
	documents: JsonRecord[];
}): AudioDraftSamples {
	const samples = emptySamples();
	for (const document of documents) {
		const materials = recordValue({ value: document.materials }) ?? {};
		const tracks = records({ value: document.tracks });
		const segments = tracks.flatMap((track) =>
			records({ value: track.segments })
		);

		for (const capability of AUDIO_BASIC_CAPABILITIES) {
			const capabilitySamples = samples[capability.id];
			for (const collection of capability.draftCollections) {
				const materialObjects = records({ value: materials[collection] });
				capabilitySamples.collectionObjects[collection] =
					(capabilitySamples.collectionObjects[collection] ?? 0) +
					materialObjects.length;
				capabilitySamples.materialObjects += materialObjects.length;
				capabilitySamples.activeMaterialObjects += materialObjects.filter(
					(value) =>
						isActiveAudioMaterial({
							capabilityId: capability.id,
							collection,
							value,
						})
				).length;
			}

			for (const segment of segments) {
				const presentFields = capability.segmentFields.filter((field) =>
					Object.hasOwn(segment, field)
				);
				if (presentFields.length === 0) continue;
				capabilitySamples.segmentsWithFields += 1;
				for (const field of presentFields) {
					capabilitySamples.segmentFieldOccurrences[field] =
						(capabilitySamples.segmentFieldOccurrences[field] ?? 0) + 1;
				}
				if (
					isActiveAudioSegment({
						capabilityId: capability.id,
						segment,
					})
				) {
					capabilitySamples.activeSegments += 1;
				}
			}
		}
	}
	return samples;
}

export function scanAudioDraftSamples({
	rootPath,
}: {
	rootPath: string;
}): AudioDraftSamples {
	const documents = findDraftCandidateFiles({ rootPath }).flatMap(
		(filePath) => {
			const document = parseJsonRecord({ bytes: readFileSync(filePath) });
			return document ? [document] : [];
		}
	);
	return summarizeAudioDraftDocuments({ documents });
}
