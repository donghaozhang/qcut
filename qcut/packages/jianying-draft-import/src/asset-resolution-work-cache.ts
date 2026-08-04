export const DEFAULT_MAX_ASSET_RESOLUTION_CACHE_ENTRIES = 8192;
const MAX_ASSET_RESOLUTION_CACHE_ENTRIES = 100_000;

export interface AssetFileProbeResult {
	ok: boolean;
	sha256?: string;
	byteLength?: number;
	tooLarge?: boolean;
}

export interface AssetResolutionCacheMetrics {
	schemaVersion: 1;
	fileProbeHits: number;
	fileProbeMisses: number;
	nameSearchHits: number;
	nameSearchMisses: number;
	evictions: number;
	hashedBytes: number;
}

interface CacheCounters {
	hits: number;
	misses: number;
	evictions: number;
}

class BoundedAsyncCache<T> {
	readonly #entries = new Map<string, Promise<T>>();
	readonly #maxEntries: number;
	readonly #counters: CacheCounters;

	constructor({
		counters,
		maxEntries,
	}: {
		counters: CacheCounters;
		maxEntries: number;
	}) {
		this.#counters = counters;
		this.#maxEntries = maxEntries;
	}

	async getOrLoad({
		key,
		load,
	}: {
		key: string;
		load: () => Promise<T>;
	}): Promise<{ cacheHit: boolean; value: T }> {
		const existing = this.#entries.get(key);
		if (existing !== undefined) {
			this.#counters.hits += 1;
			this.#entries.delete(key);
			this.#entries.set(key, existing);
			return { cacheHit: true, value: await existing };
		}

		this.#counters.misses += 1;
		if (this.#entries.size >= this.#maxEntries) {
			const oldestKey = this.#entries.keys().next().value;
			if (oldestKey !== undefined) {
				this.#entries.delete(oldestKey);
				this.#counters.evictions += 1;
			}
		}
		const pending = load();
		this.#entries.set(key, pending);
		try {
			return { cacheHit: false, value: await pending };
		} catch (error) {
			if (this.#entries.get(key) === pending) {
				this.#entries.delete(key);
			}
			throw error;
		}
	}
}

export class AssetResolutionWorkCache {
	readonly #fileProbeCounters: CacheCounters = {
		hits: 0,
		misses: 0,
		evictions: 0,
	};
	readonly #nameSearchCounters: CacheCounters = {
		hits: 0,
		misses: 0,
		evictions: 0,
	};
	readonly #fileProbes: BoundedAsyncCache<AssetFileProbeResult>;
	readonly #nameSearches: BoundedAsyncCache<readonly string[]>;
	#hashedBytes = 0;

	constructor({
		maxEntries = DEFAULT_MAX_ASSET_RESOLUTION_CACHE_ENTRIES,
	}: {
		maxEntries?: number;
	} = {}) {
		if (
			!Number.isSafeInteger(maxEntries) ||
			maxEntries < 1 ||
			maxEntries > MAX_ASSET_RESOLUTION_CACHE_ENTRIES
		) {
			throw new Error(
				`Asset resolution cache entries must be an integer between 1 and ${MAX_ASSET_RESOLUTION_CACHE_ENTRIES}.`
			);
		}
		this.#fileProbes = new BoundedAsyncCache({
			counters: this.#fileProbeCounters,
			maxEntries,
		});
		this.#nameSearches = new BoundedAsyncCache({
			counters: this.#nameSearchCounters,
			maxEntries,
		});
	}

	async probeFile({
		absolutePath,
		load,
		maxHashBytes,
	}: {
		absolutePath: string;
		load: () => Promise<AssetFileProbeResult>;
		maxHashBytes: number;
	}): Promise<AssetFileProbeResult> {
		const result = await this.#fileProbes.getOrLoad({
			key: `${maxHashBytes}\0${absolutePath}`,
			load,
		});
		if (
			!result.cacheHit &&
			result.value.ok &&
			result.value.byteLength !== undefined
		) {
			this.#hashedBytes = Math.min(
				Number.MAX_SAFE_INTEGER,
				this.#hashedBytes + result.value.byteLength
			);
		}
		return result.value;
	}

	async findByName({
		fileName,
		load,
		rootRealPath,
	}: {
		fileName: string;
		load: () => Promise<readonly string[]>;
		rootRealPath: string;
	}): Promise<readonly string[]> {
		const result = await this.#nameSearches.getOrLoad({
			key: `${rootRealPath}\0${fileName}`,
			load: async () => Object.freeze([...(await load())]),
		});
		return result.value;
	}

	metrics(): AssetResolutionCacheMetrics {
		return {
			schemaVersion: 1,
			fileProbeHits: this.#fileProbeCounters.hits,
			fileProbeMisses: this.#fileProbeCounters.misses,
			nameSearchHits: this.#nameSearchCounters.hits,
			nameSearchMisses: this.#nameSearchCounters.misses,
			evictions:
				this.#fileProbeCounters.evictions + this.#nameSearchCounters.evictions,
			hashedBytes: this.#hashedBytes,
		};
	}
}
