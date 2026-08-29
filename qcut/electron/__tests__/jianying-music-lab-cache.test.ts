// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildJianyingMusicLabCatalog,
	loadJianyingMusicLabTrack,
} from "../jianying-music-lab-cache.js";

const TRACK_ID = "7376283782371969061";
const TRACK_FILE_NAME = "c44fe6be59f4babada39dcfcbc31e608.mp3";
const UNKNOWN_FILE_NAME = "a".repeat(32) + ".mp3";
const TRACK_BYTES = Buffer.from("ID3 verified Jianying music fixture");
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
	const directory = await mkdtemp(path.join(tmpdir(), "qcut-music-lab-"));
	temporaryDirectories.push(directory);
	return directory;
}

function md5Text({ value }: { value: string }) {
	return createHash("md5").update(value).digest("hex");
}

async function writeMusicDatabase({
	sourceCacheRoot,
}: {
	sourceCacheRoot: string;
}) {
	const databaseDirectory = path.join(sourceCacheRoot, "ressdk_db", "account");
	await mkdir(databaseDirectory, { recursive: true });
	const database = new DatabaseSync(path.join(databaseDirectory, "rp.db"));
	try {
		database.exec(
			"CREATE TABLE http_cache (id INTEGER PRIMARY KEY, response_body TEXT, timestamp TEXT)"
		);
		const responseBody = JSON.stringify({
			data: {
				songs: [
					{
						id: "__TRACK_ID__",
						title: "Groovy hammond",
						author: "Royaltyfreemusicforvideos",
						album: "",
						duration: 101,
						genres: ["布鲁斯"],
						paid_type: "subscribe",
						copyrighted: true,
						is_commerce: false,
					},
				],
			},
		}).replace('"__TRACK_ID__"', TRACK_ID);
		database
			.prepare(
				"INSERT INTO http_cache (response_body, timestamp) VALUES (?, ?)"
			)
			.run(responseBody, "2026-08-29 05:54:31");
	} finally {
		database.close();
	}
}

async function writeMusicDownloads({
	sourceCacheRoot,
}: {
	sourceCacheRoot: string;
}) {
	const musicRoot = path.join(sourceCacheRoot, "music");
	await mkdir(musicRoot, { recursive: true });
	await Promise.all([
		writeFile(path.join(musicRoot, TRACK_FILE_NAME), TRACK_BYTES),
		writeFile(path.join(musicRoot, UNKNOWN_FILE_NAME), "unmatched cache"),
		writeFile(
			path.join(musicRoot, "downLoadcfg"),
			JSON.stringify({
				list: [
					{
						date: "1784337198462",
						hex: md5Text({ value: TRACK_ID }),
						path: TRACK_FILE_NAME,
					},
					{
						date: "1784337198463",
						hex: "b".repeat(32),
						path: UNKNOWN_FILE_NAME,
					},
					{
						date: "1784337198464",
						hex: "not-a-hash",
						path: "../escape.mp3",
					},
				],
			})
		),
	]);
}

async function createFixture() {
	const root = await createTemporaryDirectory();
	const sourceCacheRoot = path.join(root, "jianying-cache");
	const qcutCacheRoot = path.join(root, "qcut-cache");
	await Promise.all([
		writeMusicDatabase({ sourceCacheRoot }),
		writeMusicDownloads({ sourceCacheRoot }),
	]);
	return { root, sourceCacheRoot, qcutCacheRoot };
}

function buildFixtureCatalog({
	qcutCacheRoot,
	sourceCacheRoot,
	refresh,
}: {
	qcutCacheRoot: string;
	sourceCacheRoot: string;
	refresh: boolean;
}) {
	return buildJianyingMusicLabCatalog({
		qcutCacheRoot,
		sourceCacheRoot,
		refresh,
		probeAudio: async () => ({
			codecName: "mp3",
			durationSeconds: 101,
			fileExtension: "mp3",
		}),
	});
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying Music Lab cache", () => {
	it("matches exact song IDs and mirrors only verified local music", async () => {
		const { qcutCacheRoot, sourceCacheRoot } = await createFixture();
		const catalog = await buildFixtureCatalog({
			qcutCacheRoot,
			sourceCacheRoot,
			refresh: true,
		});

		expect(catalog.result.stats).toMatchObject({
			sourceAvailable: true,
			databaseCount: 1,
			metadataSongCount: 1,
			downloadRecordCount: 3,
			invalidDownloadRecordCount: 1,
			matchedTrackCount: 1,
			cachedTrackCount: 1,
			unmatchedDownloadCount: 1,
			copiedTrackCount: 1,
			reusedTrackCount: 0,
		});
		expect(catalog.result.tracks).toEqual([
			expect.objectContaining({
				trackId: TRACK_ID,
				title: "Groovy hammond",
				author: "Royaltyfreemusicforvideos",
				durationSeconds: 101,
				genres: ["布鲁斯"],
				paidType: "subscribe",
				copyrighted: true,
				byteSize: TRACK_BYTES.byteLength,
			}),
		]);
		const manifest = JSON.parse(
			await readFile(path.join(qcutCacheRoot, "manifest.json"), "utf8")
		) as { tracks: { fileName: string }[] };
		expect(manifest.tracks).toHaveLength(1);
		expect(manifest.tracks[0]?.fileName).toMatch(
			new RegExp(`^${TRACK_ID}-[a-f0-9]{16}\\.mp3$`)
		);
		expect(
			await readFile(
				path.join(qcutCacheRoot, "audio", manifest.tracks[0]?.fileName ?? "")
			)
		).toEqual(TRACK_BYTES);
	});

	it("reuses verified files and keeps the private mirror after source eviction", async () => {
		const { qcutCacheRoot, root, sourceCacheRoot } = await createFixture();
		await buildFixtureCatalog({
			qcutCacheRoot,
			sourceCacheRoot,
			refresh: true,
		});
		const reused = await buildFixtureCatalog({
			qcutCacheRoot,
			sourceCacheRoot,
			refresh: true,
		});
		expect(reused.result.stats).toMatchObject({
			copiedTrackCount: 0,
			reusedTrackCount: 1,
			cachedTrackCount: 1,
		});

		await rm(sourceCacheRoot, { recursive: true, force: true });
		const preserved = await buildFixtureCatalog({
			qcutCacheRoot,
			sourceCacheRoot: path.join(root, "missing-source"),
			refresh: true,
		});
		expect(preserved.result.stats).toMatchObject({
			sourceAvailable: false,
			matchedTrackCount: 0,
			cachedTrackCount: 1,
		});
		expect(preserved.result.tracks[0]?.trackId).toBe(TRACK_ID);
	});

	it("loads only checksum-verified cached bytes", async () => {
		const { qcutCacheRoot, sourceCacheRoot } = await createFixture();
		const catalog = await buildFixtureCatalog({
			qcutCacheRoot,
			sourceCacheRoot,
			refresh: true,
		});
		const loaded = await loadJianyingMusicLabTrack({
			catalog,
			trackId: TRACK_ID,
		});
		expect(Buffer.from(loaded.bytes)).toEqual(TRACK_BYTES);
		expect(loaded.mimeType).toBe("audio/mpeg");

		const fileName = catalog.manifest.tracks[0]?.fileName ?? "";
		await writeFile(path.join(qcutCacheRoot, "audio", fileName), "corrupt");
		await expect(
			loadJianyingMusicLabTrack({ catalog, trackId: TRACK_ID })
		).rejects.toThrow("缓存校验失败");

		const repaired = await buildFixtureCatalog({
			qcutCacheRoot,
			sourceCacheRoot,
			refresh: true,
		});
		expect(repaired.result.stats).toMatchObject({
			copiedTrackCount: 1,
			reusedTrackCount: 0,
		});
		expect(
			Buffer.from(
				(
					await loadJianyingMusicLabTrack({
						catalog: repaired,
						trackId: TRACK_ID,
					})
				).bytes
			)
		).toEqual(TRACK_BYTES);
		await expect(
			loadJianyingMusicLabTrack({ catalog, trackId: "../escape" })
		).rejects.toThrow("音乐 ID 无效");
	});
});
