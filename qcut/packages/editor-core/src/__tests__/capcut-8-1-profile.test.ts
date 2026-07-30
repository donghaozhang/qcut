import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildCapCut81ActiveContentMirrorPaths,
	buildCapCut81PlaceholderAssetPath,
	CAPCUT_8_1_MATERIAL_BUCKET_KEYS,
	CAPCUT_8_1_SCAFFOLD_PROFILE,
	CAPCUT_8_1_TOP_LEVEL_KEYS,
	createEmptyCapCut81Materials,
	parseCapCut81PlaceholderAssetPath,
} from "../jianying-draft/capcut-8-1-profile.js";

const TIMELINE_ID = "11111111-2222-4333-8444-555555555555";
const PLACEHOLDER_ID = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";

function readProfileFixture(): unknown {
	const fixturePath = join(
		process.cwd(),
		"packages/editor-core/src/__tests__/fixtures/jianying/capcut-8.1-scaffold-profile.json"
	);
	return JSON.parse(readFileSync(fixturePath, "utf8"));
}

describe("CapCut 8.1 scaffold profile", () => {
	it("matches the manually minimized, identity-free observation fixture", () => {
		const fixture = readProfileFixture();

		expect(CAPCUT_8_1_SCAFFOLD_PROFILE).toEqual(fixture);
		expect(CAPCUT_8_1_TOP_LEVEL_KEYS).toHaveLength(35);
		expect(CAPCUT_8_1_MATERIAL_BUCKET_KEYS).toHaveLength(54);

		const serializedFixture = JSON.stringify(fixture);
		expect(serializedFixture).not.toContain("/Users/");
		expect(serializedFixture).not.toContain("\\Users\\");
		expect(serializedFixture).not.toContain("@");
		expect(CAPCUT_8_1_SCAFFOLD_PROFILE.evidence.payloadIncluded).toBe(false);
	});

	it("builds the four active content mirror paths from one timeline id", () => {
		expect(
			buildCapCut81ActiveContentMirrorPaths({ timelineId: TIMELINE_ID })
		).toEqual([
			"draft_info.json",
			"template-2.tmp",
			`Timelines/${TIMELINE_ID}/draft_info.json`,
			`Timelines/${TIMELINE_ID}/template-2.tmp`,
		]);
	});

	it("rejects unsafe timeline ids before constructing mirror paths", () => {
		expect(() =>
			buildCapCut81ActiveContentMirrorPaths({
				timelineId: "../another-project",
			})
		).toThrow("timelineId must be a UUID");
	});

	it("creates one independent empty array for every observed material bucket", () => {
		const materials = createEmptyCapCut81Materials();

		expect(Object.keys(materials)).toEqual(CAPCUT_8_1_MATERIAL_BUCKET_KEYS);
		expect(Object.values(materials)).toHaveLength(54);
		expect(
			Object.values(materials).every((bucket) => bucket.length === 0)
		).toBe(true);

		materials.videos.push({ id: "video-1" });
		expect(materials.videos).toHaveLength(1);
		expect(materials.audios).toHaveLength(0);
	});

	it.each([
		"audio",
		"image",
		"video",
	] as const)("round-trips %s placeholder asset paths", (mediaFolder) => {
		const value = {
			fileName: "旅行 片段-01.mp4",
			mediaFolder,
			placeholderId: PLACEHOLDER_ID,
		};
		const path = buildCapCut81PlaceholderAssetPath(value);

		expect(path).toBe(
			`##_draftpath_placeholder_${PLACEHOLDER_ID}_##/assets/${mediaFolder}/旅行 片段-01.mp4`
		);
		expect(parseCapCut81PlaceholderAssetPath({ path })).toEqual(value);
	});

	it("rejects asset traversal and non-placeholder paths", () => {
		expect(() =>
			buildCapCut81PlaceholderAssetPath({
				fileName: "../private.mov",
				mediaFolder: "video",
				placeholderId: PLACEHOLDER_ID,
			})
		).toThrow("fileName must be one safe path segment");
		expect(
			parseCapCut81PlaceholderAssetPath({
				path: "/Users/USER/private.mov",
			})
		).toBeNull();
		expect(
			parseCapCut81PlaceholderAssetPath({
				path: `##_draftpath_placeholder_${PLACEHOLDER_ID}_##/assets/video/../private.mov`,
			})
		).toBeNull();
	});
});
