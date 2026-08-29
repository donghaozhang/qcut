// @vitest-environment node
import { readdir, readFile, rm } from "node:fs/promises";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createJianyingMusicLabCatalog,
	type JianyingMusicLabManifest,
	loadJianyingMusicLabTrack,
} from "../jianying-music-lab-cache.js";
import { cacheNextJianyingMusicBatch } from "../jianying-music-lab-batch.js";

const FIXED_NOW = new Date("2026-08-29T06:00:00.000Z");
const ENDPOINT_KEY = "A".repeat(32);
const TRACK_IDS = [
	"7376283782371969061",
	"7553544962089175067",
	"7553544962089175068",
	"7553544962089175069",
] as const;
const SHARED_BYTES = Buffer.concat([
	Buffer.from([0, 0, 0, 24]),
	Buffer.from("ftypM4A shared music payload"),
]);
const THIRD_BYTES = Buffer.concat([
	Buffer.from([0, 0, 0, 24]),
	Buffer.from("ftypM4A third music payload"),
]);
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
	const directory = await mkdtemp(path.join(tmpdir(), "qcut-music-batch-"));
	temporaryDirectories.push(directory);
	return directory;
}

function previewUrl({
	expiresAt,
	trackId,
}: {
	expiresAt: number;
	trackId: string;
}) {
	return `https://v9-jianying.vlabvod.com/token/${expiresAt.toString(16)}/${trackId}.mp3`;
}

async function writeCandidateDatabase({
	sourceCacheRoot,
}: {
	sourceCacheRoot: string;
}) {
	const databaseDirectory = path.join(sourceCacheRoot, "ressdk_db", "account");
	await mkdir(databaseDirectory, { recursive: true });
	const database = new DatabaseSync(path.join(databaseDirectory, "rp.db"));
	const validExpiry = Math.floor(FIXED_NOW.getTime() / 1000) + 3600;
	const expired = Math.floor(FIXED_NOW.getTime() / 1000) - 60;
	try {
		database.exec(
			"CREATE TABLE http_cache (id INTEGER PRIMARY KEY, url TEXT, response_body TEXT, timestamp TEXT)"
		);
		const songs = TRACK_IDS.map((trackId, index) => ({
			id: trackId,
			title: `Track ${index + 1}`,
			author: `Artist ${index + 1}`,
			album: "Batch fixture",
			duration: 90 + index,
			genres: ["推荐音乐"],
			paid_type: index === 0 ? "subscribe" : "",
			copyrighted: index === 0,
			is_commerce: false,
			preview_url: previewUrl({
				expiresAt: index === TRACK_IDS.length - 1 ? expired : validExpiry,
				trackId,
			}),
		}));
		database
			.prepare(
				"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
			)
			.run(
				`/lv/v1/get_collection_songs_${ENDPOINT_KEY}`,
				JSON.stringify({ data: { songs } }),
				"2026-08-29 05:54:31"
			);
	} finally {
		database.close();
	}
}

function emptyManifest(): JianyingMusicLabManifest {
	return {
		schemaVersion: 2,
		refreshedAt: FIXED_NOW.toISOString(),
		stats: {
			sourceAvailable: true,
			databaseCount: 1,
			metadataSongCount: TRACK_IDS.length,
			downloadRecordCount: 0,
			matchedTrackCount: 0,
			cachedTrackCount: 0,
			unmatchedDownloadCount: 0,
			invalidDownloadRecordCount: 0,
			copiedTrackCount: 0,
			reusedTrackCount: 0,
		},
		tracks: [],
		batches: [],
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying Music Lab batches", () => {
	it("downloads, probes, deduplicates, reports, and resumes a failed batch", async () => {
		const root = await createTemporaryDirectory();
		const sourceCacheRoot = path.join(root, "jianying-cache");
		const qcutCacheRoot = path.join(root, "qcut-cache");
		await writeCandidateDatabase({ sourceCacheRoot });
		const catalog = createJianyingMusicLabCatalog({
			cacheRoot: qcutCacheRoot,
			manifest: emptyManifest(),
		});
		let thirdTrackShouldFail = true;
		const downloadCandidate = vi.fn(async ({ candidate }) => {
			if (candidate.trackId === TRACK_IDS[2] && thirdTrackShouldFail) {
				throw new Error(`temporary failure ${candidate.previewUrl}`);
			}
			return candidate.trackId === TRACK_IDS[2] ? THIRD_BYTES : SHARED_BYTES;
		});
		const probeAudio = vi.fn(async () => ({
			codecName: "aac",
			durationSeconds: 93,
			fileExtension: "m4a" as const,
		}));

		const first = await cacheNextJianyingMusicBatch({
			catalog,
			limit: 3,
			sourceCacheRoot,
			now: () => FIXED_NOW,
			downloadCandidate,
			probeAudio,
		});

		expect(first.batch).toMatchObject({
			requestedCount: 3,
			eligibleCount: 3,
			attemptedCount: 3,
			newTrackCount: 2,
			downloadedPayloadCount: 1,
			sharedPayloadCount: 1,
			failedCount: 1,
			remainingEligibleCount: 1,
			totalCachedTrackCount: 2,
		});
		expect(first.updatedCatalog.manifest.tracks).toHaveLength(2);
		expect(
			new Set(
				first.updatedCatalog.manifest.tracks.map((track) => track.fileName)
			)
		).toHaveLength(1);
		expect(first.updatedCatalog.manifest.tracks[0]?.fileName).toMatch(/\.m4a$/);
		expect(await readdir(path.join(qcutCacheRoot, "audio"))).toHaveLength(1);
		expect(
			(
				await loadJianyingMusicLabTrack({
					catalog: first.updatedCatalog,
					trackId: TRACK_IDS[0],
				})
			).mimeType
		).toBe("audio/mp4");

		const firstReport = await readFile(
			path.join(qcutCacheRoot, "batches", `${first.batch.batchId}.json`),
			"utf8"
		);
		expect(firstReport).not.toContain("https://");
		expect(firstReport).not.toContain("vlabvod.com");
		expect(firstReport).toContain("[redacted-url]");
		expect(
			await readFile(path.join(qcutCacheRoot, "manifest.json"), "utf8")
		).not.toContain("https://");

		thirdTrackShouldFail = false;
		const second = await cacheNextJianyingMusicBatch({
			catalog: first.updatedCatalog,
			limit: 3,
			sourceCacheRoot,
			now: () => FIXED_NOW,
			downloadCandidate,
			probeAudio,
		});

		expect(second.batch).toMatchObject({
			eligibleCount: 1,
			attemptedCount: 1,
			newTrackCount: 1,
			failedCount: 0,
			remainingEligibleCount: 0,
			totalCachedTrackCount: 3,
		});
		expect(second.updatedCatalog.manifest.tracks).toHaveLength(3);
		expect(second.updatedCatalog.manifest.batches).toHaveLength(2);
		expect(await readdir(path.join(qcutCacheRoot, "audio"))).toHaveLength(2);
		expect(downloadCandidate).toHaveBeenCalledTimes(4);
	});
});
