import type {
	TextTemplateCategoryId,
	TextTemplateDefinition,
} from "./text-template-registry";
import { getTextTemplateResource } from "./text-resource-catalog";
import {
	getRecommendedTextTemplateDefinitions,
	type TextTemplateMarketplaceMetadataOverrides,
	type TextTemplateMarketplaceSection,
} from "./text-marketplace-metadata";

export const TEXT_LIBRARY_STATE_STORAGE_KEY = "qcut-text-library-state-v1";
const MAX_RECENT_TEXT_TEMPLATES = 30;

export type TextTemplateDownloadStatus =
	| "remote"
	| "downloading"
	| "cached"
	| "failed";
type TextTemplateDownloadRecordStatus = "cached" | "failed";
export type TextTemplateResourceAccess = "allowed" | "svip-required";

export interface TextTemplateDownloadRecord {
	templateId: string;
	assetId: string;
	packageId: string;
	cacheKey: string;
	version: number;
	status: TextTemplateDownloadRecordStatus;
	attemptCount: number;
	updatedAt: number;
	errorCode?: string;
}

export interface TextLibraryState {
	favoriteIds: readonly string[];
	downloadedIds: readonly string[];
	recentIds: readonly string[];
	downloadRecords: readonly TextTemplateDownloadRecord[];
	hasSvipAccess: boolean;
}

export const EMPTY_TEXT_LIBRARY_STATE: TextLibraryState = {
	favoriteIds: [],
	downloadedIds: [],
	recentIds: [],
	downloadRecords: [],
	hasSvipAccess: false,
};

export function parseTextLibraryState({
	value,
}: {
	value: unknown;
}): TextLibraryState {
	if (typeof value !== "object" || value === null) {
		return EMPTY_TEXT_LIBRARY_STATE;
	}
	const record = value as Record<string, unknown>;
	return {
		favoriteIds: parseStringList({ value: record.favoriteIds }),
		downloadedIds: parseStringList({ value: record.downloadedIds }),
		recentIds: parseStringList({ value: record.recentIds }),
		downloadRecords: parseDownloadRecords({ value: record.downloadRecords }),
		hasSvipAccess: record.hasSvipAccess === true,
	};
}

export function loadTextLibraryState(): TextLibraryState {
	if (typeof window === "undefined") return EMPTY_TEXT_LIBRARY_STATE;
	try {
		const value = window.localStorage.getItem(TEXT_LIBRARY_STATE_STORAGE_KEY);
		if (!value) return EMPTY_TEXT_LIBRARY_STATE;
		return parseTextLibraryState({ value: JSON.parse(value) });
	} catch {
		return EMPTY_TEXT_LIBRARY_STATE;
	}
}

export function storeTextLibraryState({
	state,
}: {
	state: TextLibraryState;
}): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		TEXT_LIBRARY_STATE_STORAGE_KEY,
		JSON.stringify(state)
	);
}

export function toggleFavoriteTextTemplate({
	state,
	templateId,
}: {
	state: TextLibraryState;
	templateId: string;
}): TextLibraryState {
	const favoriteIds = new Set(state.favoriteIds);
	if (favoriteIds.has(templateId)) {
		favoriteIds.delete(templateId);
		return { ...state, favoriteIds: [...favoriteIds] };
	}
	favoriteIds.add(templateId);
	return { ...state, favoriteIds: [...favoriteIds] };
}

export function markTextTemplateDownloaded({
	definition,
	now = Date.now(),
	state,
	templateId,
}: {
	definition?: TextTemplateDefinition;
	now?: number;
	state: TextLibraryState;
	templateId?: string;
}): TextLibraryState {
	const resolvedTemplateId = definition?.id ?? templateId;
	if (!resolvedTemplateId) return state;
	const currentDownloadedIds = state.downloadedIds ?? [];
	const currentDownloadRecords = state.downloadRecords ?? [];
	const downloadedIds = currentDownloadedIds.includes(resolvedTemplateId)
		? state.downloadedIds
		: [...currentDownloadedIds, resolvedTemplateId];
	const downloadRecords = definition
		? upsertDownloadRecord({
				record: buildDownloadRecord({
					definition,
					now,
					status: "cached",
				}),
				records: currentDownloadRecords,
			})
		: currentDownloadRecords;
	if (
		downloadedIds === state.downloadedIds &&
		downloadRecords === state.downloadRecords
	) {
		return state;
	}
	return { ...state, downloadedIds, downloadRecords };
}

export function markTextTemplateDownloadFailed({
	definition,
	errorCode,
	now = Date.now(),
	state,
}: {
	definition: TextTemplateDefinition;
	errorCode: string;
	now?: number;
	state: TextLibraryState;
}): TextLibraryState {
	return {
		...state,
		downloadRecords: upsertDownloadRecord({
			record: buildDownloadRecord({
				definition,
				errorCode,
				now,
				status: "failed",
			}),
			records: state.downloadRecords ?? [],
		}),
	};
}

export function retryTextTemplateDownload({
	definition,
	now = Date.now(),
	state,
}: {
	definition: TextTemplateDefinition;
	now?: number;
	state: TextLibraryState;
}): TextLibraryState {
	const access = getTextTemplateResourceAccess({ definition, state });
	if (access !== "allowed") {
		return markTextTemplateDownloadFailed({
			definition,
			errorCode: "SVIP_REQUIRED",
			now,
			state,
		});
	}
	return markTextTemplateDownloaded({ definition, now, state });
}

export function markTextTemplateUsed({
	state,
	templateId,
}: {
	state: TextLibraryState;
	templateId: string;
}): TextLibraryState {
	return {
		...state,
		recentIds: [
			templateId,
			...state.recentIds.filter((recentId) => recentId !== templateId),
		].slice(0, MAX_RECENT_TEXT_TEMPLATES),
	};
}

export function isTextTemplateDownloaded({
	definition,
	state,
}: {
	definition: TextTemplateDefinition;
	state: TextLibraryState;
}): boolean {
	return (
		getTextTemplateDownloadStatus({ definition, state }) === "cached" ||
		definition.downloaded ||
		state.downloadedIds.includes(definition.id)
	);
}

export function isTextTemplateFavorite({
	definition,
	state,
}: {
	definition: TextTemplateDefinition;
	state: TextLibraryState;
}): boolean {
	return state.favoriteIds.includes(definition.id);
}

export function getTextTemplateDownloadStatus({
	definition,
	state,
}: {
	definition: TextTemplateDefinition;
	state: TextLibraryState;
}): TextTemplateDownloadStatus {
	if (definition.downloaded) return "cached";
	const record = (state.downloadRecords ?? []).find(
		(candidate) => candidate.templateId === definition.id
	);
	if (record) {
		return isCurrentDownloadRecord({ definition, record })
			? record.status
			: "remote";
	}
	if ((state.downloadedIds ?? []).includes(definition.id)) return "cached";
	return "remote";
}

export function getTextTemplateResourceAccess({
	definition,
	state,
}: {
	definition: TextTemplateDefinition;
	state: TextLibraryState;
}): TextTemplateResourceAccess {
	const resource = getTextTemplateResource({ definition });
	if (resource.entitlement !== "svip") return "allowed";
	return state.hasSvipAccess === true ? "allowed" : "svip-required";
}

export function getTextDefinitionsForLibraryCategory({
	category,
	definitions,
	marketplaceOverrides,
	marketplaceSections,
	state,
}: {
	category: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
	marketplaceOverrides?: TextTemplateMarketplaceMetadataOverrides;
	marketplaceSections?: readonly TextTemplateMarketplaceSection[];
	state: TextLibraryState;
}): TextTemplateDefinition[] {
	const definitionsById = new Map(
		definitions.map((definition) => [definition.id, definition])
	);
	if (category === "favorites") {
		return state.favoriteIds.flatMap((templateId) => {
			const definition = definitionsById.get(templateId);
			return definition ? [definition] : [];
		});
	}
	if (category === "recent") {
		return state.recentIds.flatMap((templateId) => {
			const definition = definitionsById.get(templateId);
			return definition ? [definition] : [];
		});
	}
	if (category === "downloaded") {
		return definitions.filter((definition) =>
			isTextTemplateDownloaded({ definition, state })
		);
	}
	if (category === "recommended") {
		return getRecommendedTextTemplateDefinitions({
			definitions,
			overrides: marketplaceOverrides,
			sections: marketplaceSections,
		});
	}
	if (category === "brand-kit" || category === "drafts") {
		return [];
	}
	return definitions.filter((definition) => definition.category === category);
}

function buildDownloadRecord({
	definition,
	errorCode,
	now,
	status,
}: {
	definition: TextTemplateDefinition;
	errorCode?: string;
	now: number;
	status: TextTemplateDownloadRecordStatus;
}): TextTemplateDownloadRecord {
	const resource = getTextTemplateResource({ definition });
	return {
		templateId: definition.id,
		assetId: resource.assetId,
		packageId: resource.packageId,
		cacheKey: resource.cacheKey,
		version: resource.version,
		status,
		attemptCount: getNextAttemptCount({
			definition,
			status,
		}),
		updatedAt: now,
		errorCode,
	};
}

function getNextAttemptCount({
	definition,
	status,
}: {
	definition: TextTemplateDefinition;
	status: TextTemplateDownloadRecordStatus;
}): number {
	if (status === "cached" && definition.downloaded) return 1;
	return 1;
}

function upsertDownloadRecord({
	record,
	records,
}: {
	record: TextTemplateDownloadRecord;
	records: readonly TextTemplateDownloadRecord[];
}): TextTemplateDownloadRecord[] {
	const result: TextTemplateDownloadRecord[] = [];
	let inserted = false;
	for (const current of records) {
		if (current.templateId !== record.templateId) {
			result.push(current);
			continue;
		}
		result.push({
			...record,
			attemptCount: current.attemptCount + 1,
		});
		inserted = true;
	}
	if (!inserted) result.push(record);
	return result;
}

function isCurrentDownloadRecord({
	definition,
	record,
}: {
	definition: TextTemplateDefinition;
	record: TextTemplateDownloadRecord;
}): boolean {
	const resource = getTextTemplateResource({ definition });
	return (
		record.assetId === resource.assetId &&
		record.packageId === resource.packageId &&
		record.cacheKey === resource.cacheKey &&
		record.version === resource.version
	);
}

function parseDownloadRecords({
	value,
}: {
	value: unknown;
}): TextTemplateDownloadRecord[] {
	if (!Array.isArray(value)) return [];
	const result: TextTemplateDownloadRecord[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const record = parseDownloadRecord({ value: item });
		if (!record || seen.has(record.templateId)) continue;
		seen.add(record.templateId);
		result.push(record);
	}
	return result;
}

function parseDownloadRecord({
	value,
}: {
	value: unknown;
}): TextTemplateDownloadRecord | null {
	if (typeof value !== "object" || value === null) return null;
	const record = value as Record<string, unknown>;
	if (
		typeof record.templateId !== "string" ||
		typeof record.assetId !== "string" ||
		typeof record.packageId !== "string" ||
		typeof record.cacheKey !== "string" ||
		typeof record.version !== "number" ||
		typeof record.attemptCount !== "number" ||
		typeof record.updatedAt !== "number"
	) {
		return null;
	}
	if (record.status !== "cached" && record.status !== "failed") return null;
	return {
		templateId: record.templateId,
		assetId: record.assetId,
		packageId: record.packageId,
		cacheKey: record.cacheKey,
		version: record.version,
		status: record.status,
		attemptCount: record.attemptCount,
		updatedAt: record.updatedAt,
		errorCode:
			typeof record.errorCode === "string" ? record.errorCode : undefined,
	};
}

function parseStringList({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.length === 0 || seen.has(item)) {
			continue;
		}
		seen.add(item);
		result.push(item);
	}
	return result;
}
