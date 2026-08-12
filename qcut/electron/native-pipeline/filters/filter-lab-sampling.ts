/**
 * Deterministic stratified sampling over filter-catalog cards (FLP-001).
 *
 * The long-tail plan needs "run it twice, get the same 30 cards", so
 * everything here is a pure function of (cards, size, seed, strata): no
 * Math.random, no Date, no iteration-order dependence. Cards are grouped
 * by a caller-supplied stratum key, every non-empty stratum is guaranteed
 * at least one pick (population permitting), the remaining quota is spread
 * proportionally by largest remainder, and picks inside a stratum come
 * from a seeded shuffle keyed by the stratum name.
 */

export interface StratifiedSampleStratum {
	key: string;
	total: number;
	picked: number;
}

export interface StratifiedSampleResult<Card> {
	cards: Card[];
	strata: StratifiedSampleStratum[];
}

/** mulberry32: tiny, well-distributed, and fully deterministic per seed. */
function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a over the stratum key, so each stratum shuffles independently. */
function hashKey(key: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < key.length; index += 1) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function seededShuffle<Value>({
	values,
	seed,
}: {
	values: Value[];
	seed: number;
}): Value[] {
	const random = createSeededRandom(seed);
	const shuffled = [...values];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(random() * (index + 1));
		[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
	}
	return shuffled;
}

/**
 * Builds the stratum key for a card from named field values. Array values
 * are sorted and joined so `["skin_seg","face_detect"]` and
 * `["face_detect","skin_seg"]` land in the same stratum; missing fields
 * read as "none".
 */
export function strataKeyFor({
	card,
	fields,
}: {
	card: Record<string, unknown>;
	fields: string[];
}): string {
	return fields
		.map((field) => {
			const value = card[field];
			if (Array.isArray(value)) {
				const parts = value.map((entry) => String(entry)).sort();
				return `${field}=${parts.length > 0 ? parts.join("+") : "none"}`;
			}
			if (value === undefined || value === null || value === "") {
				return `${field}=none`;
			}
			return `${field}=${String(value)}`;
		})
		.join("|");
}

/**
 * Deterministic stratified sample.
 *
 * Guarantees, in priority order:
 * 1. same (cards, size, seed, keys) → identical output, independent of the
 *    input array's order (cards are canonicalised by `idOf` first);
 * 2. every non-empty stratum contributes at least one card while quota
 *    remains (strata beyond the quota are dropped in sorted-key order);
 * 3. leftover quota is allocated proportionally to stratum size using
 *    largest remainder, ties broken by sorted key.
 */
export function stratifiedSample<Card>({
	cards,
	size,
	seed,
	strataOf,
	idOf,
}: {
	cards: Card[];
	size: number;
	seed: number;
	strataOf: (card: Card) => string;
	idOf: (card: Card) => string;
}): StratifiedSampleResult<Card> {
	if (size <= 0 || cards.length === 0) return { cards: [], strata: [] };

	const groups = new Map<string, Card[]>();
	for (const card of cards) {
		const key = strataOf(card);
		const group = groups.get(key) ?? [];
		group.push(card);
		groups.set(key, group);
	}
	const keys = [...groups.keys()].sort();
	for (const key of keys) {
		const group = groups.get(key);
		if (!group) continue;
		group.sort((left, right) => idOf(left).localeCompare(idOf(right)));
	}

	const quota = Math.min(size, cards.length);
	const allocations = new Map<string, number>();
	let allocated = 0;

	// Floor: one card per stratum while quota lasts, in sorted-key order.
	for (const key of keys) {
		if (allocated >= quota) break;
		allocations.set(key, 1);
		allocated += 1;
	}

	// Proportional largest-remainder for the rest, capped by stratum size.
	let remaining = quota - allocated;
	while (remaining > 0) {
		const openKeys = keys.filter(
			(key) => (allocations.get(key) ?? 0) < (groups.get(key)?.length ?? 0)
		);
		if (openKeys.length === 0) break;
		const openTotal = openKeys.reduce(
			(sum, key) => sum + (groups.get(key)?.length ?? 0),
			0
		);
		const shares = openKeys.map((key) => {
			const groupSize = groups.get(key)?.length ?? 0;
			const exact = (remaining * groupSize) / openTotal;
			return { key, floor: Math.floor(exact), remainder: exact % 1 };
		});
		let roundAllocated = 0;
		for (const share of shares) {
			const current = allocations.get(share.key) ?? 0;
			const capacity = (groups.get(share.key)?.length ?? 0) - current;
			const granted = Math.min(share.floor, capacity);
			allocations.set(share.key, current + granted);
			roundAllocated += granted;
		}
		// Largest remainder (ties by key order) for the last few slots.
		let leftover = remaining - roundAllocated;
		const byRemainder = [...shares].sort(
			(left, right) =>
				right.remainder - left.remainder || left.key.localeCompare(right.key)
		);
		for (const share of byRemainder) {
			if (leftover <= 0) break;
			const current = allocations.get(share.key) ?? 0;
			if (current >= (groups.get(share.key)?.length ?? 0)) continue;
			allocations.set(share.key, current + 1);
			leftover -= 1;
		}
		const consumed = remaining - leftover;
		if (consumed === 0) break;
		remaining = leftover;
	}

	const picked: Card[] = [];
	const strata: StratifiedSampleStratum[] = [];
	for (const key of keys) {
		const group = groups.get(key) ?? [];
		const take = Math.min(allocations.get(key) ?? 0, group.length);
		const shuffled = seededShuffle({
			values: group,
			seed: (seed ^ hashKey(key)) >>> 0,
		});
		picked.push(...shuffled.slice(0, take));
		strata.push({ key, total: group.length, picked: take });
	}
	picked.sort((left, right) => idOf(left).localeCompare(idOf(right)));
	return { cards: picked, strata };
}
