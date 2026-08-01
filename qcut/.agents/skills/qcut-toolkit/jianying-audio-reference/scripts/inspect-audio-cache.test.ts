import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	findAudioCategories,
	findAudioRecords,
} from "./inspect-audio-cache";
import { resolveLocalAudio } from "./audio-cache-files";

const temporaryDirectories: string[] = [];

function fixtureCache() {
	const root = mkdtempSync(path.join(os.tmpdir(), "jianying-audio-skill-"));
	temporaryDirectories.push(root);
	const cacheRoot = path.join(root, "Cache");
	const databaseRoot = path.join(cacheRoot, "ressdk_db/account");
	const musicRoot = path.join(cacheRoot, "music");
	mkdirSync(databaseRoot, { recursive: true });
	mkdirSync(musicRoot, { recursive: true });
	const databasePath = path.join(databaseRoot, "rp.db");
	const database = new Database(databasePath);
	database.exec(`
		CREATE TABLE http_cache (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT UNIQUE NOT NULL,
			response_body TEXT NOT NULL,
			timestamp TEXT
		)
	`);
	return { cacheRoot, database, databasePath, musicRoot };
}

function audioItem({
	title,
	id,
	md5,
	url,
	durationMs = 365,
	durationSeconds = 1,
}: {
	title: string;
	id: string;
	md5: string;
	url: string;
	durationMs?: number | null;
	durationSeconds?: number;
}) {
	const audioEffect = {
		duration: durationSeconds,
		...(durationMs === null ? {} : { duration_ms: durationMs }),
	};
	return {
		common_attr: {
			title,
			id,
			effect_id: id,
			md5,
			publish_source: "ies_music",
			category_ids: [10892, 10902],
			download_info: { format: "mp3", url },
			business_info: {
				json_str: JSON.stringify({ is_vip: false, paid_type: "free" }),
			},
			business_scope: ["剪映"],
			copyright: { copyright_text: "", artist_name: "" },
			status: 102,
		},
		audio_effect: audioEffect,
		author: { name: "reference", source: 1, uid: "author-1" },
	};
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("Jianying audio cache inspector", () => {
	test("preserves resource IDs and resolves category names", () => {
		const { database, databasePath } = fixtureCache();
		database
			.query("INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)")
			.run(
				"/artist/v1/panel/audio",
				JSON.stringify({
					data: {
						categories: [
							{ category_id: 10892, category_name: "热门", category_key: "10892" },
							{ category_id: 5914402, category_name: "网感口播🔥", category_key: "wanggan" },
							{ category_id: 5914764, category_name: "热梗语录", category_key: "regeng" },
							{ category_id: 5914405, category_name: "提示音", category_key: "tishi" },
						],
					},
				}),
				"2026-08-01 00:00:00"
			);
		database
			.query("INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)")
			.run(
				"/artist/v1/effect/category_audio_test",
				JSON.stringify({
					data: {
						effect_item_list: [
							audioItem({
								title: "拳击声",
								id: "7605848839072812331",
								md5: "abc",
								url: "https://example.test/punch.mp3",
							}),
						],
					},
				}),
				"2026-08-01 00:01:00"
			);
		database.close();

		const records = findAudioRecords({ databasePaths: [databasePath], title: "拳击声" });
		expect(records).toHaveLength(1);
		expect(records[0]?.resourceId).toBe("7605848839072812331");
		expect(records[0]?.durationMs).toBe(365);
		expect(findAudioCategories({ databasePaths: [databasePath] })).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "10892", name: "热门" }),
				expect.objectContaining({ id: "5914402", name: "网感口播🔥" }),
			])
		);
	});

	test("preserves fractional second durations when duration_ms is absent", () => {
		const { database, databasePath } = fixtureCache();
		database
			.query("INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)")
			.run(
				"/artist/v1/effect/category_audio_test",
				JSON.stringify({
					data: {
						effect_item_list: [
							audioItem({
								title: "小数时长",
								id: "fractional-duration",
								md5: "",
								url: "https://example.test/fractional.mp3",
								durationMs: null,
								durationSeconds: 1.5,
							}),
						],
					},
				}),
				"2026-08-01 00:01:00"
			);
		database.close();

		const [record] = findAudioRecords({
			databasePaths: [databasePath],
			title: "小数时长",
		});
		expect(record?.durationMs).toBe(1500);
	});

	test("verifies a legacy content-md5 payload", () => {
		const { cacheRoot, database, databasePath, musicRoot } = fixtureCache();
		const payload = Buffer.from("reference audio bytes");
		const md5 = createHash("md5").update(payload).digest("hex");
		writeFileSync(path.join(musicRoot, `${md5}.mp3`), payload);
		database
			.query("INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)")
			.run(
				"/artist/v1/effect/category_audio_test",
				JSON.stringify({
					data: {
						effect_item_list: [
							audioItem({
								title: "提示音",
								id: "6896679333541285133",
								md5,
								url: "https://example.test/ding.mp3",
							}),
						],
					},
				}),
				"2026-08-01 00:01:00"
			);
		database.close();

		const [record] = findAudioRecords({ databasePaths: [databasePath], title: "提示音" });
		expect(record).toBeDefined();
		const evidence = resolveLocalAudio({ record: record!, cacheRoot, verify: true });
		expect(evidence.state).toBe("verified");
		expect(evidence.mappingStrategy).toBe("metadata-md5");
		expect(evidence.contentMd5).toBe(md5);
		expect(evidence.metadataMd5Matches).toBe(true);
	});

	test("resolves an empty-md5 resource through the current URL cache key", () => {
		const { cacheRoot, database, databasePath, musicRoot } = fixtureCache();
		const url = "https://example.test/direct.mp3?signature=current";
		const payload = Buffer.from("direct payload");
		const contentMd5 = createHash("md5").update(payload).digest("hex");
		const urlHash = createHash("md5").update(url).digest("hex");
		writeFileSync(path.join(musicRoot, `${contentMd5}.mp3`), payload);
		writeFileSync(
			path.join(musicRoot, "downLoadcfg"),
			JSON.stringify({
				list: [{ date: "1", hex: urlHash, path: `${contentMd5}.mp3` }],
			})
		);
		database
			.query("INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)")
			.run(
				"/artist/v1/effect/category_audio_test",
				JSON.stringify({
					data: {
						effect_item_list: [
							audioItem({
								title: "新音效",
								id: "7605845683291032868",
								md5: "",
								url,
							}),
						],
					},
				}),
				"2026-08-01 00:01:00"
			);
		database.close();

		const [record] = findAudioRecords({ databasePaths: [databasePath], title: "新音效" });
		expect(record).toBeDefined();
		const evidence = resolveLocalAudio({ record: record!, cacheRoot, verify: true });
		expect(evidence.state).toBe("verified");
		expect(evidence.mappingStrategy).toBe("download-config-url-hash");
		expect(evidence.contentMd5).toBe(contentMd5);
	});
});
