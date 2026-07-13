export interface SharedFrameCacheSnapshotEntry {
	key: number;
	imageData: ImageData;
	timelineHash: string;
	timestamp: number;
}

export interface SharedFrameCacheMetrics {
	hits: number;
	misses: number;
	evictions: number;
	rejectedFrames: number;
	bytes: number;
	peakBytes: number;
	entries: number;
}

interface SharedFrameCacheEntry extends SharedFrameCacheSnapshotEntry {
	byteLength: number;
	lastAccessedAt: number;
}

interface SharedFrameCacheOptions {
	namespace: string;
	maxEntries: number;
	maxBytes: number;
	ttlMs: number;
}

interface ReadFrameOptions {
	key: number;
	timelineHash: string;
	now?: number;
}

interface WriteFrameOptions extends ReadFrameOptions {
	imageData: ImageData;
	currentTime: number;
}

const stores = new Map<string, SharedFrameCache>();

function frameByteLength({ imageData }: { imageData: ImageData }): number {
	return imageData.data.byteLength;
}

function validateOptions({
	maxEntries,
	maxBytes,
	ttlMs,
}: Omit<SharedFrameCacheOptions, "namespace">): void {
	if (!Number.isInteger(maxEntries) || maxEntries < 1) {
		throw new Error("Frame cache maxEntries must be a positive integer");
	}
	if (!Number.isFinite(maxBytes) || maxBytes < 1) {
		throw new Error("Frame cache maxBytes must be positive");
	}
	if (!Number.isFinite(ttlMs) || ttlMs < 1) {
		throw new Error("Frame cache ttlMs must be positive");
	}
}

export class SharedFrameCache {
	readonly namespace: string;
	private readonly entries = new Map<number, SharedFrameCacheEntry>();
	private maxEntries: number;
	private maxBytes: number;
	private ttlMs: number;
	private bytes = 0;
	private readonly counters = {
		hits: 0,
		misses: 0,
		evictions: 0,
		rejectedFrames: 0,
		peakBytes: 0,
	};

	constructor({
		namespace,
		maxEntries,
		maxBytes,
		ttlMs,
	}: SharedFrameCacheOptions) {
		validateOptions({ maxEntries, maxBytes, ttlMs });
		this.namespace = namespace;
		this.maxEntries = maxEntries;
		this.maxBytes = maxBytes;
		this.ttlMs = ttlMs;
	}

	configure({
		maxEntries,
		maxBytes,
		ttlMs,
	}: Omit<SharedFrameCacheOptions, "namespace">): void {
		validateOptions({ maxEntries, maxBytes, ttlMs });
		this.maxEntries = maxEntries;
		this.maxBytes = maxBytes;
		this.ttlMs = ttlMs;
		this.evictToBudget({ currentTime: 0, now: Date.now() });
	}

	read({ key, timelineHash, now = Date.now() }: ReadFrameOptions): ImageData | null {
		const entry = this.entries.get(key);
		if (!entry) {
			this.counters.misses++;
			return null;
		}
		if (now - entry.timestamp > this.ttlMs || entry.timelineHash !== timelineHash) {
			this.remove({ key, countEviction: entry.timelineHash === timelineHash });
			this.counters.misses++;
			return null;
		}
		entry.lastAccessedAt = now;
		this.entries.delete(key);
		this.entries.set(key, entry);
		this.counters.hits++;
		return entry.imageData;
	}

	has({ key, timelineHash, now = Date.now() }: ReadFrameOptions): boolean {
		const entry = this.entries.get(key);
		if (!entry) return false;
		if (now - entry.timestamp > this.ttlMs || entry.timelineHash !== timelineHash) {
			this.remove({ key, countEviction: entry.timelineHash === timelineHash });
			return false;
		}
		return true;
	}

	write({
		key,
		imageData,
		timelineHash,
		currentTime,
		now = Date.now(),
	}: WriteFrameOptions): boolean {
		const byteLength = frameByteLength({ imageData });
		if (byteLength > this.maxBytes) {
			this.counters.rejectedFrames++;
			return false;
		}
		this.remove({ key, countEviction: false });
		this.entries.set(key, {
			key,
			imageData,
			timelineHash,
			timestamp: now,
			lastAccessedAt: now,
			byteLength,
		});
		this.bytes += byteLength;
		this.counters.peakBytes = Math.max(this.counters.peakBytes, this.bytes);
		this.evictToBudget({ currentTime, now });
		return this.entries.has(key);
	}

	clear(): void {
		this.entries.clear();
		this.bytes = 0;
	}

	prune({ now = Date.now() }: { now?: number } = {}): void {
		for (const [key, entry] of this.entries) {
			if (now - entry.timestamp > this.ttlMs) {
				this.remove({ key, countEviction: true });
			}
		}
	}

	snapshot({ maxBytes = this.maxBytes }: { maxBytes?: number } = {}): SharedFrameCacheSnapshotEntry[] {
		this.prune();
		let snapshotBytes = 0;
		const snapshot: SharedFrameCacheSnapshotEntry[] = [];
		const newestFirst = Array.from(this.entries.values()).sort(
			(a, b) => b.lastAccessedAt - a.lastAccessedAt
		);
		for (const entry of newestFirst) {
			if (snapshotBytes + entry.byteLength > maxBytes) continue;
			snapshot.push({
				key: entry.key,
				imageData: entry.imageData,
				timelineHash: entry.timelineHash,
				timestamp: entry.timestamp,
			});
			snapshotBytes += entry.byteLength;
		}
		return snapshot;
	}

	restore({
		entries,
		now = Date.now(),
	}: {
		entries: SharedFrameCacheSnapshotEntry[];
		now?: number;
	}): void {
		for (const entry of entries.sort((a, b) => a.timestamp - b.timestamp)) {
			if (now - entry.timestamp > this.ttlMs) continue;
			this.write({
				key: entry.key,
				imageData: entry.imageData,
				timelineHash: entry.timelineHash,
				currentTime: entry.key,
				now: entry.timestamp,
			});
		}
	}

	get metrics(): SharedFrameCacheMetrics {
		return {
			hits: this.counters.hits,
			misses: this.counters.misses,
			evictions: this.counters.evictions,
			rejectedFrames: this.counters.rejectedFrames,
			bytes: this.bytes,
			peakBytes: this.counters.peakBytes,
			entries: this.entries.size,
		};
	}

	get byteBudget(): number {
		return this.maxBytes;
	}

	private evictToBudget({
		currentTime,
		now,
	}: {
		currentTime: number;
		now: number;
	}): void {
		this.prune({ now });
		while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
			const candidates = Array.from(this.entries.values()).sort((a, b) => {
				const distanceDifference =
					Math.abs(b.key - currentTime) - Math.abs(a.key - currentTime);
				if (distanceDifference !== 0) return distanceDifference;
				return a.lastAccessedAt - b.lastAccessedAt;
			});
			const candidate = candidates[0];
			if (!candidate) return;
			this.remove({ key: candidate.key, countEviction: true });
		}
	}

	private remove({
		key,
		countEviction,
	}: {
		key: number;
		countEviction: boolean;
	}): void {
		const entry = this.entries.get(key);
		if (!entry) return;
		this.entries.delete(key);
		this.bytes = Math.max(0, this.bytes - entry.byteLength);
		if (countEviction) this.counters.evictions++;
	}
}

export function getSharedFrameCache({
	namespace,
	maxEntries,
	maxBytes,
	ttlMs,
}: SharedFrameCacheOptions): SharedFrameCache {
	const normalizedNamespace = namespace.trim() || "default";
	const existing = stores.get(normalizedNamespace);
	if (existing) {
		existing.configure({ maxEntries, maxBytes, ttlMs });
		return existing;
	}
	const store = new SharedFrameCache({
		namespace: normalizedNamespace,
		maxEntries,
		maxBytes,
		ttlMs,
	});
	stores.set(normalizedNamespace, store);
	return store;
}

export function clearSharedFrameCaches(): void {
	for (const store of stores.values()) store.clear();
	stores.clear();
}
