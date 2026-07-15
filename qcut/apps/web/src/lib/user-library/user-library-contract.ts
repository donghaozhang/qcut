export const USER_LIBRARY_ENVELOPE_VERSION = 1 as const;

const MAX_LIBRARY_ITEMS = 1_000;
const MAX_ITEM_ID_LENGTH = 200;

export interface UserLibraryItem extends Record<string, unknown> {
	id: string;
}

export interface UserLibraryEnvelope {
	schemaVersion: typeof USER_LIBRARY_ENVELOPE_VERSION;
	items: UserLibraryItem[];
	itemUpdatedAt: Record<string, number>;
	tombstones: Record<string, number>;
	updatedAt: number;
}

function parseTimestamp({ value }: { value: unknown }): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

function parseTimestampMap({
	value,
}: {
	value: unknown;
}): Record<string, number> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const parsed: Record<string, number> = {};
	for (const [key, timestamp] of Object.entries(value)) {
		const parsedTimestamp = parseTimestamp({ value: timestamp });
		if (!key || key.length > MAX_ITEM_ID_LENGTH || parsedTimestamp === null) {
			return null;
		}
		parsed[key] = parsedTimestamp;
	}
	return parsed;
}

export function parseUserLibraryItem({
	value,
}: {
	value: unknown;
}): UserLibraryItem | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const candidate = value as Record<string, unknown>;
	if (
		typeof candidate.id !== "string" ||
		candidate.id.trim().length === 0 ||
		candidate.id.length > MAX_ITEM_ID_LENGTH
	) {
		return null;
	}
	try {
		return structuredClone(candidate) as UserLibraryItem;
	} catch {
		return null;
	}
}

function normalizedItems({
	items,
}: {
	items: readonly unknown[];
}): UserLibraryItem[] {
	const byId = new Map<string, UserLibraryItem>();
	for (const value of items.slice(0, MAX_LIBRARY_ITEMS)) {
		const item = parseUserLibraryItem({ value });
		if (item) byId.set(item.id, item);
	}
	return [...byId.values()];
}

export function parseUserLibraryEnvelope({
	value,
}: {
	value: unknown;
}): UserLibraryEnvelope | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const candidate = value as Record<string, unknown>;
	const updatedAt = parseTimestamp({ value: candidate.updatedAt });
	if (
		candidate.schemaVersion !== USER_LIBRARY_ENVELOPE_VERSION ||
		!Array.isArray(candidate.items) ||
		candidate.items.length > MAX_LIBRARY_ITEMS ||
		updatedAt === null
	) {
		return null;
	}
	const items = normalizedItems({ items: candidate.items });
	if (items.length !== candidate.items.length) return null;
	const itemUpdatedAt = parseTimestampMap({ value: candidate.itemUpdatedAt });
	const tombstones = parseTimestampMap({ value: candidate.tombstones });
	if (!itemUpdatedAt || !tombstones) return null;
	if (
		items.some(
			(item) => parseTimestamp({ value: itemUpdatedAt[item.id] }) === null
		)
	) {
		return null;
	}
	return {
		schemaVersion: USER_LIBRARY_ENVELOPE_VERSION,
		items,
		itemUpdatedAt,
		tombstones,
		updatedAt,
	};
}

function canonicalValue({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalValue({ value: item }));
	}
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, canonicalValue({ value: item })])
	);
}

export function userLibraryItemFingerprint({
	item,
}: {
	item: UserLibraryItem;
}): string {
	return JSON.stringify(canonicalValue({ value: item }));
}

function itemMap({
	envelope,
}: {
	envelope: UserLibraryEnvelope;
}): Map<string, UserLibraryItem> {
	return new Map(envelope.items.map((item) => [item.id, item]));
}

export function reconcileLocalUserLibrary({
	items,
	previous,
	remote,
	now,
}: {
	items: readonly unknown[];
	previous: UserLibraryEnvelope | null;
	remote: UserLibraryEnvelope | null;
	now: number;
}): UserLibraryEnvelope {
	const currentItems = normalizedItems({ items });
	const previousItems = previous ? itemMap({ envelope: previous }) : new Map();
	const remoteItems = remote ? itemMap({ envelope: remote }) : new Map();
	const itemUpdatedAt: Record<string, number> = {};
	const tombstones = { ...(previous?.tombstones ?? {}) };

	for (const item of currentItems) {
		const previousItem = previousItems.get(item.id);
		if (previousItem) {
			itemUpdatedAt[item.id] =
				userLibraryItemFingerprint({ item: previousItem }) ===
				userLibraryItemFingerprint({ item })
					? (previous?.itemUpdatedAt[item.id] ?? now)
					: now;
			continue;
		}
		const remoteItem = remoteItems.get(item.id);
		itemUpdatedAt[item.id] =
			remoteItem &&
			userLibraryItemFingerprint({ item: remoteItem }) ===
				userLibraryItemFingerprint({ item })
				? (remote?.itemUpdatedAt[item.id] ?? now)
				: now;
	}

	if (previous) {
		const currentIds = new Set(currentItems.map((item) => item.id));
		for (const previousItem of previous.items) {
			if (!currentIds.has(previousItem.id)) tombstones[previousItem.id] = now;
		}
	}
	for (const item of currentItems) {
		if ((tombstones[item.id] ?? -1) <= itemUpdatedAt[item.id]) {
			Reflect.deleteProperty(tombstones, item.id);
		}
	}
	const latestTimestamp = Math.max(
		0,
		...Object.values(itemUpdatedAt),
		...Object.values(tombstones)
	);

	return {
		schemaVersion: USER_LIBRARY_ENVELOPE_VERSION,
		items: currentItems,
		itemUpdatedAt,
		tombstones,
		updatedAt: latestTimestamp,
	};
}

function preferredItem({
	left,
	right,
}: {
	left: UserLibraryItem | undefined;
	right: UserLibraryItem | undefined;
}): UserLibraryItem | undefined {
	if (!left) return right;
	if (!right) return left;
	return userLibraryItemFingerprint({ item: left }) >=
		userLibraryItemFingerprint({ item: right })
		? left
		: right;
}

export function mergeUserLibraryEnvelopes({
	local,
	remote,
}: {
	local: UserLibraryEnvelope;
	remote: UserLibraryEnvelope;
}): UserLibraryEnvelope {
	const localItems = itemMap({ envelope: local });
	const remoteItems = itemMap({ envelope: remote });
	const ids = new Set([
		...localItems.keys(),
		...remoteItems.keys(),
		...Object.keys(local.tombstones),
		...Object.keys(remote.tombstones),
	]);
	const items: UserLibraryItem[] = [];
	const itemUpdatedAt: Record<string, number> = {};
	const tombstones: Record<string, number> = {};

	for (const id of [...ids].sort()) {
		const localTimestamp = local.itemUpdatedAt[id] ?? -1;
		const remoteTimestamp = remote.itemUpdatedAt[id] ?? -1;
		const deletionTimestamp = Math.max(
			local.tombstones[id] ?? -1,
			remote.tombstones[id] ?? -1
		);
		const itemTimestamp = Math.max(localTimestamp, remoteTimestamp);
		if (deletionTimestamp >= itemTimestamp) {
			if (deletionTimestamp >= 0) tombstones[id] = deletionTimestamp;
			continue;
		}
		const item =
			localTimestamp > remoteTimestamp
				? localItems.get(id)
				: remoteTimestamp > localTimestamp
					? remoteItems.get(id)
					: preferredItem({
							left: localItems.get(id),
							right: remoteItems.get(id),
						});
		if (!item) continue;
		items.push(item);
		itemUpdatedAt[id] = itemTimestamp;
	}

	return {
		schemaVersion: USER_LIBRARY_ENVELOPE_VERSION,
		items,
		itemUpdatedAt,
		tombstones,
		updatedAt: Math.max(local.updatedAt, remote.updatedAt),
	};
}

export function userLibraryEnvelopesEqual({
	left,
	right,
}: {
	left: UserLibraryEnvelope;
	right: UserLibraryEnvelope;
}): boolean {
	return (
		JSON.stringify(canonicalValue({ value: left })) ===
		JSON.stringify(canonicalValue({ value: right }))
	);
}
