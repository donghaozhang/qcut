import type {
	TextTemplateCategoryId,
	TextTemplateDefinition,
} from "./text-template-registry";

export const TEXT_LIBRARY_STATE_STORAGE_KEY = "qcut-text-library-state-v1";
const MAX_RECENT_TEXT_TEMPLATES = 30;

export interface TextLibraryState {
	favoriteIds: readonly string[];
	downloadedIds: readonly string[];
	recentIds: readonly string[];
}

export const EMPTY_TEXT_LIBRARY_STATE: TextLibraryState = {
	favoriteIds: [],
	downloadedIds: [],
	recentIds: [],
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
	state,
	templateId,
}: {
	state: TextLibraryState;
	templateId: string;
}): TextLibraryState {
	if (state.downloadedIds.includes(templateId)) return state;
	return { ...state, downloadedIds: [...state.downloadedIds, templateId] };
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
	return definition.downloaded || state.downloadedIds.includes(definition.id);
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

export function getTextDefinitionsForLibraryCategory({
	category,
	definitions,
	state,
}: {
	category: TextTemplateCategoryId;
	definitions: readonly TextTemplateDefinition[];
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
	if (category === "brand-kit" || category === "drafts") {
		return [];
	}
	return definitions.filter((definition) => definition.category === category);
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
