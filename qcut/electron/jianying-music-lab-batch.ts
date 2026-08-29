import { createHash, randomUUID } from "node:crypto";
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	createJianyingMusicLabCatalog,
	type JianyingMusicLabCachedTrack,
	type JianyingMusicLabCatalog,
	type JianyingMusicLabManifest,
	writeJianyingMusicLabManifest,
} from "./jianying-music-lab-cache.js";
import {
	probeJianyingMusicAudio,
	type JianyingMusicAudioProbeResult,
} from "./jianying-music-lab-audio.js";
import type {
	JianyingMusicLabBatchResult,
	JianyingMusicLabBatchSummary,
} from "./jianying-music-lab-contract.js";
import { listJianyingResourceDatabasePaths } from "./jianying-resource-database.js";
import { mapWithConcurrency } from "./lib/map-with-concurrency.js";

const AUDIO_DIRECTORY_NAME = "audio";
const BATCH_DIRECTORY_NAME = "batches";
const STAGING_DIRECTORY_NAME = "staging";
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 50;
const DOWNLOAD_CONCURRENCY = 3;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const URL_EXPIRY_MARGIN_SECONDS = 5 * 60;
const ENDPOINT_KEY_PATTERN = /^[A-F0-9]{32}$/;
const TRACK_ID_PATTERN = /^\d{1,24}$/;
const PREVIEW_HOST_PATTERN = /^v\d+-jianying\.vlabvod\.com$/;

interface RawRemoteCandidateRow {
	trackId: string | null;
	title: string | null;
	author: string | null;
	album: string | null;
	durationSeconds: number | null;
	genresJson: string | null;
	paidType: string | null;
	copyrighted: number | null;
	isCommerce: number | null;
	observedAt: string | null;
	endpointKey: string | null;
	cardOrder: number | null;
	previewUrl: string | null;
}

export interface JianyingMusicRemoteCandidate {
	trackId: string;
	title: string;
	author: string;
	album: string;
	durationSeconds: number;
	genres: string[];
	paidType: string;
	copyrighted: boolean;
	isCommerce: boolean;
	observedAt: string;
	endpointKey: string;
	cardOrder: number;
	previewUrl: string;
	signatureExpiresAt: number;
}

interface SelectedCandidateBatch {
	endpointKey: string;
	observedAt: string;
	eligibleCount: number;
	candidates: JianyingMusicRemoteCandidate[];
}

interface StagedTrack {
	candidate: JianyingMusicRemoteCandidate;
	checksumSha256: string;
	byteSize: number;
	durationSeconds: number;
	fileExtension: "m4a" | "mp3";
	temporaryPath: string;
}

interface StagedFailure {
	candidate: JianyingMusicRemoteCandidate;
	reason: string;
}

type StagedOutcome =
	| { status: "ready"; staged: StagedTrack }
	| { status: "failed"; failure: StagedFailure };

interface FinalizedTrack {
	track: JianyingMusicLabCachedTrack;
	createdPayload: boolean;
	sharedPayload: boolean;
}

export interface CacheNextJianyingMusicBatchOptions {
	catalog: JianyingMusicLabCatalog;
	limit?: number;
	sourceCacheRoot?: string;
	now?: () => Date;
	downloadCandidate?: ({
		candidate,
	}: {
		candidate: JianyingMusicRemoteCandidate;
	}) => Promise<Uint8Array>;
	probeAudio?: ({
		filePath,
	}: {
		filePath: string;
	}) => Promise<JianyingMusicAudioProbeResult>;
}

function defaultSourceCacheRoot() {
	return path.join(homedir(), "Movies", "JianyingPro", "User Data", "Cache");
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

function parseGenres({ value }: { value: string | null }) {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return [
			...new Set(
				parsed
					.filter((genre) => typeof genre === "string")
					.map((genre) => genre.trim())
					.filter(Boolean)
			),
		];
	} catch {
		return [];
	}
}

function parsePreviewUrl({ previewUrl }: { previewUrl: string }) {
	try {
		const url = new URL(previewUrl);
		if (url.protocol !== "https:" || !PREVIEW_HOST_PATTERN.test(url.hostname)) {
			return null;
		}
		const segments = url.pathname.split("/").filter(Boolean);
		const expirySegment = segments[1] ?? "";
		if (!/^[a-f0-9]{8}$/i.test(expirySegment)) return null;
		return {
			hostname: url.hostname,
			expiresAt: Number.parseInt(expirySegment, 16),
		};
	} catch {
		return null;
	}
}

function normalizeRemoteCandidate({ row }: { row: RawRemoteCandidateRow }) {
	const trackId = row.trackId?.trim() ?? "";
	const title = row.title?.trim() ?? "";
	const endpointKey = row.endpointKey?.trim().toUpperCase() ?? "";
	const previewUrl = row.previewUrl?.trim() ?? "";
	const preview = parsePreviewUrl({ previewUrl });
	if (
		!TRACK_ID_PATTERN.test(trackId) ||
		!title ||
		!ENDPOINT_KEY_PATTERN.test(endpointKey) ||
		!preview
	) {
		return null;
	}
	const duration = Number(row.durationSeconds ?? 0);
	return {
		trackId,
		title,
		author: row.author?.trim() || "剪映",
		album: row.album?.trim() ?? "",
		durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : 0,
		genres: parseGenres({ value: row.genresJson }),
		paidType: row.paidType?.trim() ?? "",
		copyrighted: row.copyrighted === 1,
		isCommerce: row.isCommerce === 1,
		observedAt: row.observedAt?.trim() ?? "",
		endpointKey,
		cardOrder:
			Number.isSafeInteger(row.cardOrder) && Number(row.cardOrder) >= 0
				? Number(row.cardOrder)
				: 0,
		previewUrl,
		signatureExpiresAt: preview.expiresAt,
	} satisfies JianyingMusicRemoteCandidate;
}

function tableExists({
	database,
	table,
}: {
	database: DatabaseSync;
	table: string;
}) {
	const row = database
		.prepare(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present"
		)
		.get(table) as { present?: number } | undefined;
	return row?.present === 1;
}

function readRemoteRows({ databasePath }: { databasePath: string }) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		if (!tableExists({ database, table: "http_cache" })) return [];
		return database
			.prepare(`
				SELECT
					CAST(json_extract(song.value, '$.id') AS TEXT) AS trackId,
					CAST(json_extract(song.value, '$.title') AS TEXT) AS title,
					CAST(json_extract(song.value, '$.author') AS TEXT) AS author,
					CAST(json_extract(song.value, '$.album') AS TEXT) AS album,
					CAST(json_extract(song.value, '$.duration') AS REAL)
						AS durationSeconds,
					CAST(json_extract(song.value, '$.genres') AS TEXT) AS genresJson,
					CAST(json_extract(song.value, '$.paid_type') AS TEXT) AS paidType,
					CAST(json_extract(song.value, '$.copyrighted') AS INTEGER)
						AS copyrighted,
					CAST(json_extract(song.value, '$.is_commerce') AS INTEGER)
						AS isCommerce,
					CAST(cache.timestamp AS TEXT) AS observedAt,
					upper(substr(cache.url, -32)) AS endpointKey,
					CAST(song.key AS INTEGER) AS cardOrder,
					CAST(json_extract(song.value, '$.preview_url') AS TEXT)
						AS previewUrl
				FROM http_cache AS cache,
					json_each(
						CASE WHEN json_valid(cache.response_body)
							THEN cache.response_body ELSE '{}' END,
						'$.data.songs'
					) AS song
				WHERE cache.url LIKE '/lv/v1/get_collection_songs_%'
					AND json_type(song.value) = 'object'
					AND json_type(song.value, '$.preview_url') = 'text'
			`)
			.all() as unknown as RawRemoteCandidateRow[];
	} finally {
		database.close();
	}
}

async function readRemoteCandidates({
	databaseRoot,
}: {
	databaseRoot: string;
}) {
	const paths = await listJianyingResourceDatabasePaths({ databaseRoot });
	const availablePaths = (
		await Promise.all(
			paths.map(async (databasePath) => {
				try {
					await access(databasePath);
					return databasePath;
				} catch {
					return null;
				}
			})
		)
	).filter((databasePath): databasePath is string => databasePath !== null);
	return availablePaths.flatMap((databasePath) => {
		try {
			return readRemoteRows({ databasePath })
				.map((row) => normalizeRemoteCandidate({ row }))
				.filter(
					(candidate): candidate is JianyingMusicRemoteCandidate =>
						candidate !== null
				);
		} catch (error) {
			console.warn(
				`[JianyingMusicLab] Failed to read batch candidates from ${databasePath}`,
				error
			);
			return [];
		}
	});
}

function selectCandidateBatch({
	candidates,
	existingTrackIds,
	limit,
	nowSeconds,
}: {
	candidates: JianyingMusicRemoteCandidate[];
	existingTrackIds: Set<string>;
	limit: number;
	nowSeconds: number;
}): SelectedCandidateBatch {
	const endpointVersions = new Map<
		string,
		{ observedAt: string; tracks: Map<string, JianyingMusicRemoteCandidate> }
	>();
	for (const candidate of candidates) {
		const current = endpointVersions.get(candidate.endpointKey);
		if (!current || candidate.observedAt > current.observedAt) {
			endpointVersions.set(candidate.endpointKey, {
				observedAt: candidate.observedAt,
				tracks: new Map([[candidate.trackId, candidate]]),
			});
			continue;
		}
		if (candidate.observedAt < current.observedAt) continue;
		const currentTrack = current.tracks.get(candidate.trackId);
		if (!currentTrack || candidate.cardOrder < currentTrack.cardOrder) {
			current.tracks.set(candidate.trackId, candidate);
		}
	}

	const groups = [...endpointVersions.entries()].sort((left, right) => {
		const observed = right[1].observedAt.localeCompare(left[1].observedAt);
		return observed || left[0].localeCompare(right[0]);
	});
	const selected = groups
		.map(([endpointKey, group]) => {
			const eligible = [...group.tracks.values()]
				.filter(
					(candidate) =>
						!existingTrackIds.has(candidate.trackId) &&
						candidate.signatureExpiresAt >
							nowSeconds + URL_EXPIRY_MARGIN_SECONDS
				)
				.sort(
					(left, right) =>
						left.cardOrder - right.cardOrder ||
						left.trackId.localeCompare(right.trackId)
				);
			return {
				endpointKey,
				observedAt: group.observedAt,
				eligible,
			};
		})
		.find((group) => group.eligible.length > 0);
	if (!selected) {
		return {
			endpointKey: "",
			observedAt: "",
			eligibleCount: 0,
			candidates: [],
		};
	}
	return {
		endpointKey: selected.endpointKey,
		observedAt: selected.observedAt,
		eligibleCount: selected.eligible.length,
		candidates: selected.eligible.slice(0, limit),
	};
}

async function downloadPreview({
	candidate,
}: {
	candidate: JianyingMusicRemoteCandidate;
}) {
	const attempt = async ({ attemptNumber }: { attemptNumber: number }) => {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 60_000);
		try {
			const response = await fetch(candidate.previewUrl, {
				headers: { "User-Agent": "QCut-Music-Lab/1.0" },
				redirect: "follow",
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			if (response.url) {
				const finalPreview = parsePreviewUrl({ previewUrl: response.url });
				if (!finalPreview) throw new Error("untrusted redirect target");
			}
			const declaredSize = Number(response.headers.get("content-length") ?? 0);
			if (declaredSize > MAX_AUDIO_BYTES) {
				throw new Error("audio exceeds the 50 MiB limit");
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
				throw new Error("audio payload size is invalid");
			}
			return bytes;
		} catch (error) {
			if (attemptNumber >= 3) throw error;
			await new Promise((resolve) => setTimeout(resolve, attemptNumber * 750));
			return attempt({ attemptNumber: attemptNumber + 1 });
		} finally {
			clearTimeout(timeoutId);
		}
	};
	return attempt({ attemptNumber: 1 });
}

function safeFailureReason({ error }: { error: unknown }) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 300);
}

async function stageCandidate({
	candidate,
	downloadCandidate,
	probeAudio,
	stagingRoot,
}: {
	candidate: JianyingMusicRemoteCandidate;
	downloadCandidate: NonNullable<
		CacheNextJianyingMusicBatchOptions["downloadCandidate"]
	>;
	probeAudio: NonNullable<CacheNextJianyingMusicBatchOptions["probeAudio"]>;
	stagingRoot: string;
}): Promise<StagedOutcome> {
	const temporaryPath = path.join(
		stagingRoot,
		`${candidate.trackId}-${randomUUID()}.download`
	);
	try {
		const bytes = await downloadCandidate({ candidate });
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
			throw new Error("audio payload size is invalid");
		}
		await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
		const probe = await probeAudio({ filePath: temporaryPath });
		return {
			status: "ready",
			staged: {
				candidate,
				checksumSha256: sha256({ bytes }),
				byteSize: bytes.byteLength,
				durationSeconds: probe.durationSeconds,
				fileExtension: probe.fileExtension,
				temporaryPath,
			},
		};
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		return {
			status: "failed",
			failure: { candidate, reason: safeFailureReason({ error }) },
		};
	}
}

function cachedTrackFromCandidate({
	candidate,
	checksumSha256,
	byteSize,
	durationSeconds,
	fileName,
}: {
	candidate: JianyingMusicRemoteCandidate;
	checksumSha256: string;
	byteSize: number;
	durationSeconds: number;
	fileName: string;
}): JianyingMusicLabCachedTrack {
	return {
		trackId: candidate.trackId,
		title: candidate.title,
		author: candidate.author,
		album: candidate.album,
		durationSeconds,
		genres: candidate.genres,
		paidType: candidate.paidType,
		copyrighted: candidate.copyrighted,
		isCommerce: candidate.isCommerce,
		byteSize,
		checksumSha256,
		observedAt: candidate.observedAt,
		fileName,
	};
}

async function finalizeStagedTracks({
	audioRoot,
	existingTracks,
	stagedTracks,
}: {
	audioRoot: string;
	existingTracks: JianyingMusicLabCachedTrack[];
	stagedTracks: StagedTrack[];
}) {
	const payloadsByChecksum = new Map(
		existingTracks.map((track) => [track.checksumSha256, track])
	);
	return mapWithConcurrency({
		items: stagedTracks,
		limit: 1,
		task: async ({ item }) => {
			const shared = payloadsByChecksum.get(item.checksumSha256);
			if (shared) {
				await rm(item.temporaryPath, { force: true });
				return {
					track: cachedTrackFromCandidate({
						candidate: item.candidate,
						checksumSha256: shared.checksumSha256,
						byteSize: shared.byteSize,
						durationSeconds: item.durationSeconds,
						fileName: shared.fileName,
					}),
					createdPayload: false,
					sharedPayload: true,
				} satisfies FinalizedTrack;
			}

			const fileName = `${item.candidate.trackId}-${item.checksumSha256.slice(0, 16)}.${item.fileExtension}`;
			const destinationPath = path.join(audioRoot, fileName);
			let createdPayload = true;
			try {
				const existing = await readFile(destinationPath);
				createdPayload = sha256({ bytes: existing }) !== item.checksumSha256;
			} catch {
				createdPayload = true;
			}
			if (createdPayload) {
				await rm(destinationPath, { force: true });
				await rename(item.temporaryPath, destinationPath);
			} else {
				await rm(item.temporaryPath, { force: true });
			}
			const track = cachedTrackFromCandidate({
				candidate: item.candidate,
				checksumSha256: item.checksumSha256,
				byteSize: item.byteSize,
				durationSeconds: item.durationSeconds,
				fileName,
			});
			payloadsByChecksum.set(item.checksumSha256, track);
			return {
				track,
				createdPayload,
				sharedPayload: false,
			} satisfies FinalizedTrack;
		},
	});
}

async function writeBatchReport({
	cacheRoot,
	summary,
	tracks,
	failures,
}: {
	cacheRoot: string;
	summary: JianyingMusicLabBatchSummary;
	tracks: JianyingMusicLabCachedTrack[];
	failures: StagedFailure[];
}) {
	const reportRoot = path.join(cacheRoot, BATCH_DIRECTORY_NAME);
	await mkdir(reportRoot, { recursive: true, mode: 0o700 });
	const reportPath = path.join(reportRoot, `${summary.batchId}.json`);
	const temporaryPath = `${reportPath}.${process.pid}.${randomUUID()}.tmp`;
	const report = {
		schemaVersion: 1,
		summary,
		tracks: tracks.map(
			({ trackId, title, checksumSha256, byteSize, fileName }) => ({
				trackId,
				title,
				checksumSha256,
				byteSize,
				fileName,
			})
		),
		failures: failures.map(({ candidate, reason }) => ({
			trackId: candidate.trackId,
			title: candidate.title,
			reason,
		})),
	};
	try {
		await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
		});
		await rename(temporaryPath, reportPath);
	} finally {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

function normalizeBatchLimit({ limit }: { limit: number | undefined }) {
	if (limit === undefined) return DEFAULT_BATCH_LIMIT;
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_LIMIT) {
		throw new Error(`音乐缓存批次大小必须在 1 到 ${MAX_BATCH_LIMIT} 之间`);
	}
	return limit;
}

export async function cacheNextJianyingMusicBatch({
	catalog,
	limit,
	sourceCacheRoot = defaultSourceCacheRoot(),
	now = () => new Date(),
	downloadCandidate = downloadPreview,
	probeAudio = probeJianyingMusicAudio,
}: CacheNextJianyingMusicBatchOptions): Promise<
	JianyingMusicLabBatchResult & {
		updatedCatalog: JianyingMusicLabCatalog;
	}
> {
	const normalizedLimit = normalizeBatchLimit({ limit });
	const started = now();
	const batchId = `batch-${started.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
	const candidates = await readRemoteCandidates({
		databaseRoot: path.join(sourceCacheRoot, "ressdk_db"),
	});
	const selected = selectCandidateBatch({
		candidates,
		existingTrackIds: new Set(
			catalog.manifest.tracks.map((track) => track.trackId)
		),
		limit: normalizedLimit,
		nowSeconds: started.getTime() / 1000,
	});
	const emptySummary: JianyingMusicLabBatchSummary = {
		batchId,
		startedAt: started.toISOString(),
		completedAt: now().toISOString(),
		sourceEndpointKey: selected.endpointKey,
		sourceObservedAt: selected.observedAt,
		requestedCount: normalizedLimit,
		eligibleCount: selected.eligibleCount,
		attemptedCount: selected.candidates.length,
		newTrackCount: 0,
		downloadedPayloadCount: 0,
		sharedPayloadCount: 0,
		failedCount: 0,
		remainingEligibleCount: selected.eligibleCount,
		totalCachedTrackCount: catalog.manifest.tracks.length,
	};
	if (selected.candidates.length === 0) {
		return {
			catalog: catalog.result,
			batch: emptySummary,
			updatedCatalog: catalog,
		};
	}

	const stagingRoot = path.join(
		catalog.cacheRoot,
		STAGING_DIRECTORY_NAME,
		batchId
	);
	const audioRoot = path.join(catalog.cacheRoot, AUDIO_DIRECTORY_NAME);
	await Promise.all([
		mkdir(stagingRoot, { recursive: true, mode: 0o700 }),
		mkdir(audioRoot, { recursive: true, mode: 0o700 }),
	]);
	try {
		const outcomes = await mapWithConcurrency({
			items: selected.candidates,
			limit: DOWNLOAD_CONCURRENCY,
			task: ({ item }) =>
				stageCandidate({
					candidate: item,
					downloadCandidate,
					probeAudio,
					stagingRoot,
				}),
		});
		const stagedTracks = outcomes.flatMap((outcome) =>
			outcome.status === "ready" ? [outcome.staged] : []
		);
		const failures = outcomes.flatMap((outcome) =>
			outcome.status === "failed" ? [outcome.failure] : []
		);
		const finalized = await finalizeStagedTracks({
			audioRoot,
			existingTracks: catalog.manifest.tracks,
			stagedTracks,
		});
		const merged = new Map(
			catalog.manifest.tracks.map((track) => [track.trackId, track])
		);
		for (const entry of finalized) merged.set(entry.track.trackId, entry.track);
		const tracks = [...merged.values()].sort((left, right) => {
			const observed = right.observedAt.localeCompare(left.observedAt);
			return observed || left.title.localeCompare(right.title);
		});
		const downloadedPayloadCount = finalized.filter(
			(entry) => entry.createdPayload
		).length;
		const sharedPayloadCount = finalized.filter(
			(entry) => entry.sharedPayload
		).length;
		const completedAt = now().toISOString();
		const summary: JianyingMusicLabBatchSummary = {
			...emptySummary,
			completedAt,
			newTrackCount: finalized.length,
			downloadedPayloadCount,
			sharedPayloadCount,
			failedCount: failures.length,
			remainingEligibleCount: Math.max(
				0,
				selected.eligibleCount - finalized.length
			),
			totalCachedTrackCount: tracks.length,
		};
		const manifest: JianyingMusicLabManifest = {
			...catalog.manifest,
			refreshedAt: completedAt,
			stats: {
				...catalog.manifest.stats,
				cachedTrackCount: tracks.length,
				copiedTrackCount: downloadedPayloadCount,
				reusedTrackCount: finalized.length - downloadedPayloadCount,
			},
			tracks,
			batches: [...catalog.manifest.batches, summary].slice(-100),
		};
		await writeBatchReport({
			cacheRoot: catalog.cacheRoot,
			summary,
			tracks: finalized.map((entry) => entry.track),
			failures,
		});
		await writeJianyingMusicLabManifest({
			cacheRoot: catalog.cacheRoot,
			manifest,
		});
		const updatedCatalog = createJianyingMusicLabCatalog({
			cacheRoot: catalog.cacheRoot,
			manifest,
		});
		console.info(
			`[JianyingMusicLab] ${batchId}: ${finalized.length} tracks, ${downloadedPayloadCount} payloads, ${failures.length} failures`
		);
		return {
			catalog: updatedCatalog.result,
			batch: summary,
			updatedCatalog,
		};
	} finally {
		await rm(stagingRoot, { recursive: true, force: true }).catch(
			() => undefined
		);
	}
}
