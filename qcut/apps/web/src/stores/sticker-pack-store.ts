import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	DEFAULT_INSTALLED_STICKER_PACK_IDS,
	STICKER_STORE_PACKS,
} from "@/lib/stickers/sticker-pack-catalog";

export const STICKER_PACK_STORAGE_KEY = "qcut-sticker-packs-v1";

export interface InstalledStickerPackRecord {
	cachedBytes: number;
	installedAt: number;
	version: number;
}

export interface StickerPackOperation {
	completedItems: number;
	error?: string;
	progress: number;
	status: "installing" | "removing" | "failed";
	totalItems: number;
}

interface StickerPackPersistedState {
	installedPacks: Record<string, InstalledStickerPackRecord>;
}

interface StickerPackStore extends StickerPackPersistedState {
	operationsByPackId: Record<string, StickerPackOperation>;
	beginOperation: ({
		packId,
		status,
		totalItems,
	}: {
		packId: string;
		status: "installing" | "removing";
		totalItems: number;
	}) => void;
	clearOperation: ({ packId }: { packId: string }) => void;
	completeInstall: ({
		cachedBytes,
		installedAt,
		packId,
		version,
	}: {
		cachedBytes: number;
		installedAt: number;
		packId: string;
		version: number;
	}) => void;
	completeRemoval: ({ packId }: { packId: string }) => void;
	failOperation: ({ error, packId }: { error: string; packId: string }) => void;
	isInstalled: ({ packId }: { packId: string }) => boolean;
	resetPacks: () => void;
	updateOperation: ({
		completedItems,
		packId,
		progress,
	}: {
		completedItems: number;
		packId: string;
		progress: number;
	}) => void;
}

function withoutRecordKey<TValue>({
	key,
	record,
}: {
	key: string;
	record: Record<string, TValue>;
}): Record<string, TValue> {
	return Object.fromEntries(
		Object.entries(record).filter(([candidate]) => candidate !== key)
	);
}

function defaultInstalledPacks(): Record<string, InstalledStickerPackRecord> {
	const defaultIds = new Set<string>(DEFAULT_INSTALLED_STICKER_PACK_IDS);
	return Object.fromEntries(
		STICKER_STORE_PACKS.filter((pack) => defaultIds.has(pack.id)).map(
			(pack) => [
				pack.id,
				{ cachedBytes: 0, installedAt: 0, version: pack.version },
			]
		)
	);
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function normalizeInstalledRecord({
	value,
}: {
	value: unknown;
}): InstalledStickerPackRecord | undefined {
	const record = asRecord({ value });
	if (!record) return;
	if (
		typeof record.version !== "number" ||
		!Number.isInteger(record.version) ||
		record.version < 1 ||
		typeof record.cachedBytes !== "number" ||
		!Number.isFinite(record.cachedBytes) ||
		typeof record.installedAt !== "number" ||
		!Number.isFinite(record.installedAt)
	) {
		return;
	}
	return {
		cachedBytes: Math.max(0, record.cachedBytes),
		installedAt: Math.max(0, record.installedAt),
		version: record.version,
	};
}

function normalizeInstalledPacks({
	value,
}: {
	value: unknown;
}): Record<string, InstalledStickerPackRecord> {
	const record = asRecord({ value });
	if (!record) return {};
	const installedPacks: Record<string, InstalledStickerPackRecord> = {};
	for (const [packId, candidate] of Object.entries(record)) {
		const installed = normalizeInstalledRecord({ value: candidate });
		if (packId.trim() && installed) installedPacks[packId] = installed;
	}
	return installedPacks;
}

function migrateLegacyInstalledPackIds({
	value,
}: {
	value: unknown;
}): Record<string, InstalledStickerPackRecord> {
	const record = asRecord({ value });
	if (!record) return {};
	const knownVersions = new Map(
		STICKER_STORE_PACKS.map((pack) => [pack.id, pack.version])
	);
	return Object.fromEntries(
		Object.entries(record)
			.filter(([packId, installed]) => packId.trim() && installed === true)
			.map(([packId]) => [
				packId,
				{
					cachedBytes: 0,
					installedAt: 0,
					version: knownVersions.get(packId) ?? 1,
				},
			])
	);
}

export function normalizeStickerPackPersistedState({
	value,
}: {
	value: unknown;
}): StickerPackPersistedState {
	const record = asRecord({ value });
	if (!record) return { installedPacks: defaultInstalledPacks() };
	const current = normalizeInstalledPacks({ value: record.installedPacks });
	const legacy = migrateLegacyInstalledPackIds({
		value: record.installedPackIds,
	});
	return {
		installedPacks: {
			...defaultInstalledPacks(),
			...legacy,
			...current,
		},
	};
}

export const useStickerPackStore = create<StickerPackStore>()(
	persist(
		(set, get) => ({
			installedPacks: defaultInstalledPacks(),
			operationsByPackId: {},
			beginOperation: ({ packId, status, totalItems }) => {
				if (!packId.trim()) return;
				set(({ operationsByPackId }) => ({
					operationsByPackId: {
						...operationsByPackId,
						[packId]: {
							completedItems: 0,
							progress: 0,
							status,
							totalItems: Math.max(0, totalItems),
						},
					},
				}));
			},
			clearOperation: ({ packId }) =>
				set(({ operationsByPackId }) => ({
					operationsByPackId: withoutRecordKey({
						key: packId,
						record: operationsByPackId,
					}),
				})),
			completeInstall: ({ cachedBytes, installedAt, packId, version }) =>
				set(({ installedPacks, operationsByPackId }) => ({
					installedPacks: {
						...installedPacks,
						[packId]: {
							cachedBytes: Math.max(0, cachedBytes),
							installedAt: Math.max(0, installedAt),
							version: Math.max(1, Math.floor(version)),
						},
					},
					operationsByPackId: withoutRecordKey({
						key: packId,
						record: operationsByPackId,
					}),
				})),
			completeRemoval: ({ packId }) =>
				set(({ installedPacks, operationsByPackId }) => ({
					installedPacks: withoutRecordKey({
						key: packId,
						record: installedPacks,
					}),
					operationsByPackId: withoutRecordKey({
						key: packId,
						record: operationsByPackId,
					}),
				})),
			failOperation: ({ error, packId }) =>
				set(({ operationsByPackId }) => {
					const current = operationsByPackId[packId];
					return {
						operationsByPackId: {
							...operationsByPackId,
							[packId]: {
								completedItems: current?.completedItems ?? 0,
								error,
								progress: current?.progress ?? 0,
								status: "failed",
								totalItems: current?.totalItems ?? 0,
							},
						},
					};
				}),
			isInstalled: ({ packId }) => get().installedPacks[packId] !== undefined,
			resetPacks: () =>
				set({
					installedPacks: defaultInstalledPacks(),
					operationsByPackId: {},
				}),
			updateOperation: ({ completedItems, packId, progress }) =>
				set(({ operationsByPackId }) => {
					const current = operationsByPackId[packId];
					if (!current || current.status === "failed") return {};
					return {
						operationsByPackId: {
							...operationsByPackId,
							[packId]: {
								...current,
								completedItems: Math.max(0, completedItems),
								progress: Math.max(0, Math.min(1, progress)),
							},
						},
					};
				}),
		}),
		{
			name: STICKER_PACK_STORAGE_KEY,
			version: 2,
			storage: createJSONStorage(() => localStorage),
			partialize: ({ installedPacks }) => ({ installedPacks }),
			migrate: (persistedState) =>
				normalizeStickerPackPersistedState({ value: persistedState }),
			merge: (persistedState, currentState) => ({
				...currentState,
				...normalizeStickerPackPersistedState({ value: persistedState }),
				operationsByPackId: {},
			}),
		}
	)
);
