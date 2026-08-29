export const JIANYING_MUSIC_LAB_LIST_CHANNEL = "jianying-music-lab:list";
export const JIANYING_MUSIC_LAB_LOAD_CHANNEL = "jianying-music-lab:load";
export const JIANYING_MUSIC_LAB_REVEAL_CHANNEL = "jianying-music-lab:reveal";
export const JIANYING_MUSIC_LAB_CACHE_BATCH_CHANNEL =
	"jianying-music-lab:cache-batch";

export interface JianyingMusicLabTrackSummary {
	trackId: string;
	title: string;
	author: string;
	album: string;
	durationSeconds: number;
	genres: string[];
	paidType: string;
	copyrighted: boolean;
	isCommerce: boolean;
	byteSize: number;
	checksumSha256: string;
	observedAt: string;
}

export interface JianyingMusicLabScanStats {
	sourceAvailable: boolean;
	databaseCount: number;
	metadataSongCount: number;
	downloadRecordCount: number;
	matchedTrackCount: number;
	cachedTrackCount: number;
	unmatchedDownloadCount: number;
	invalidDownloadRecordCount: number;
	copiedTrackCount: number;
	reusedTrackCount: number;
}

export interface JianyingMusicLabListRequest {
	refresh?: boolean;
}

export interface JianyingMusicLabListResult {
	refreshedAt: string;
	cacheDirectory: string;
	tracks: JianyingMusicLabTrackSummary[];
	stats: JianyingMusicLabScanStats;
	batchCount: number;
	latestBatch: JianyingMusicLabBatchSummary | null;
}

export interface JianyingMusicLabBatchSummary {
	batchId: string;
	startedAt: string;
	completedAt: string;
	sourceEndpointKey: string;
	sourceObservedAt: string;
	requestedCount: number;
	eligibleCount: number;
	attemptedCount: number;
	newTrackCount: number;
	downloadedPayloadCount: number;
	sharedPayloadCount: number;
	failedCount: number;
	remainingEligibleCount: number;
	totalCachedTrackCount: number;
}

export interface JianyingMusicLabBatchRequest {
	limit?: number;
}

export interface JianyingMusicLabBatchResult {
	catalog: JianyingMusicLabListResult;
	batch: JianyingMusicLabBatchSummary;
}

export interface JianyingMusicLabLoadRequest {
	trackId: string;
}

export interface JianyingMusicLabLoadResult {
	track: JianyingMusicLabTrackSummary;
	mimeType: "audio/mpeg" | "audio/mp4";
	bytes: Uint8Array;
}

export interface JianyingMusicLabAPI {
	list: (
		request?: JianyingMusicLabListRequest
	) => Promise<JianyingMusicLabListResult>;
	cacheNextBatch: (
		request?: JianyingMusicLabBatchRequest
	) => Promise<JianyingMusicLabBatchResult>;
	load: (
		request: JianyingMusicLabLoadRequest
	) => Promise<JianyingMusicLabLoadResult>;
	revealCache: () => Promise<boolean>;
}
