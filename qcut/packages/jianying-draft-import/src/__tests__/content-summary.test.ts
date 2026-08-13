import { describe, expect, it } from "vitest";
import { buildContentSummary } from "../import-session.js";
import type { DraftSourceSnapshot } from "../snapshot-reader.js";

function createSnapshot({
	content,
}: {
	content: Record<string, unknown>;
}): DraftSourceSnapshot {
	return {
		rootRealPath: "/redacted/jianying-subdraft",
		files: [
			{
				relativePath: "draft_content.json",
				byteLength: 1024,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
				identity: {
					device: "1",
					inode: "2",
					size: "1024",
					mtimeNanoseconds: "3",
				},
			},
		],
		parsedJsonByPath: { "draft_content.json": content },
		bytesByPath: { "draft_content.json": Buffer.from("{}") },
		issues: [],
	};
}

describe("buildContentSummary", () => {
	it("uses last_modified_platform when a Jianying subdraft has neutral platform metadata", () => {
		const summary = buildContentSummary({
			snapshot: createSnapshot({
				content: {
					new_version: "183.0.0",
					version: 360_000,
					platform: {
						app_id: 0,
						app_source: "",
						app_version: "",
					},
					last_modified_platform: {
						app_id: 3704,
						app_source: "lv",
						app_version: "11.3.0-beta2",
					},
				},
			}),
		});

		expect(summary).toMatchObject({
			appId: 3704,
			appSource: "lv",
			appVersion: "11.3.0-beta2",
			fileName: "draft_content.json",
			newVersion: "183.0.0",
			schemaVersion: 360_000,
		});
	});

	it("keeps a valid primary platform identity", () => {
		const summary = buildContentSummary({
			snapshot: createSnapshot({
				content: {
					platform: {
						app_id: 359_289,
						app_source: "cc",
						app_version: "8.1.1",
					},
					last_modified_platform: {
						app_id: 3704,
						app_source: "lv",
						app_version: "11.3.0-beta2",
					},
				},
			}),
		});

		expect(summary).toMatchObject({
			appId: 359_289,
			appSource: "cc",
			appVersion: "8.1.1",
		});
	});
});
