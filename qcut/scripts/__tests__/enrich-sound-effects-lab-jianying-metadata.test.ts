import { describe, expect, it } from "vitest";
import type { AudioRecord } from "../../.agents/skills/qcut-toolkit/jianying-audio-reference/scripts/inspect-audio-cache";
import { enrichSourceMap } from "../sound-effects-lab-jianying-metadata";

const record: AudioRecord = {
	title: "提示音",
	resourceId: "6896679799100689672",
	effectId: "effect",
	thirdResourceId: "third",
	metadataMd5: "0291b72047769e085e7595ce5d65dbd2",
	publishSource: "jianying",
	categoryIds: ["1"],
	durationMs: 1250,
	downloadFormat: "mp3",
	downloadUrl: "https://download.example/private.mp3",
	author: { name: "剪映小助手", source: "jianying", uid: "42" },
	access: {
		isVip: true,
		paidType: "vip",
		businessScope: ["video_edit"],
		copyrightText: "版权素材",
		copyrightArtist: "作者",
	},
	status: 1,
	observedRoutes: ["https://api.example/audio"],
	observedAt: "2026-08-26T00:00:00.000Z",
};

describe("Sound Effects Lab Jianying metadata enrichment", () => {
	it("adds entitlement and attribution metadata without private download URLs", () => {
		const result = enrichSourceMap({
			records: [record],
			source: {
				schemaVersion: 1,
				generatedAt: "2026-08-22T00:00:00.000Z",
				summary: { combinedResourceCount: 2 },
				resources: [
					{
						batch: "01",
						title: "提示音",
						resourceId: record.resourceId,
						contentMd5: record.metadataMd5,
						fileName: `${record.metadataMd5}.mp3`,
						localPath: `/tmp/${record.metadataMd5}.mp3`,
						mappingStrategy: "metadata-md5",
						categories: ["热门"],
					},
					{
						batch: "08",
						title: "CC0",
						resourceId: "8800000000000324894",
						contentMd5: "a3bb18a41c76abd0d1af22b05072655e",
						fileName: "a3bb18a41c76abd0d1af22b05072655e.mp3",
						localPath: "/tmp/a3bb18a41c76abd0d1af22b05072655e.mp3",
						mappingStrategy: "freesound-cc0",
						categories: ["热门"],
						source: {
							provider: "freesound",
							redistribution: "allowed",
						},
					},
				],
			},
		});

		expect(result.summary).toMatchObject({
			candidateCount: 1,
			matchedCount: 1,
			vipCount: 1,
			unmatchedCount: 0,
		});
		expect(result.source.resources[0]?.source).toMatchObject({
			provider: "jianying-reference",
			author: { name: "剪映小助手", source: "jianying" },
			access: {
				isVip: true,
				paidType: "vip",
				businessScope: ["video_edit"],
			},
		});
		expect(JSON.stringify(result.source)).not.toContain(record.downloadUrl);
		expect(JSON.stringify(result.source)).not.toContain(
			record.observedRoutes[0]
		);
	});
});
