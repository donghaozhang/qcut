import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "../jianying-draft/index.js";
import type { QCutDraftExportSnapshotV1 } from "../jianying-draft/types.js";

function createGoldenSnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				duration: 5,
				height: 1080,
				id: "video-1",
				name: "clip.mp4",
				sourcePath: "/source/clip.mp4",
				type: "video",
				width: 1920,
			},
		],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Golden Fixture",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: { "clip-1": 5 },
		tracks: [
			{
				elements: [
					{
						duration: 5,
						id: "clip-1",
						mediaId: "video-1",
						name: "clip-1",
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				hidden: false,
				id: "track-1",
				muted: false,
				name: "Video",
				order: 0,
				type: "media",
			},
		],
	};
}

function buildGoldenContent() {
	return buildJianyingDraft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: "/qcut-fixture/draft",
		snapshot: createGoldenSnapshot(),
		targetPlatform: "macos",
	}).content;
}

function serializeGoldenContent(): string {
	return JSON.stringify(buildGoldenContent());
}

describe("JianYing plaintext 5.9 golden fixture", () => {
	it("matches the independently generated single-video baseline", () => {
		const fixturePath = join(
			process.cwd(),
			"packages/editor-core/src/__tests__/fixtures/jianying/plaintext-5.9-single-video.json"
		);
		const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

		expect(JSON.parse(serializeGoldenContent())).toEqual(fixture);
	});

	it("serializes deterministically and parses back without loss", () => {
		const first = serializeGoldenContent();
		const second = serializeGoldenContent();

		expect(first).toBe(second);
		expect(JSON.parse(first)).toEqual(JSON.parse(second));
	});
});
