import { describe, expect, it, vi } from "vitest";
import type { EditorApiClient } from "../../editor/editor-api-client.js";
import { RESTRICTED_MEDIA_EXPORT_ERROR_CODE } from "../../../types/restricted-media-export-policy.js";
import { buildProjectJSON } from "../project-json-builder.js";

const METADATA = {
	animatedSticker: false,
	batchId: "jianying-2026-08-23-batch-18-v2",
	checksumSha256:
		"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
	itemId: "42002",
	redistribution: "prohibited",
	referenceOnly: true,
	source: "sticker-lab",
	usage: "internal-reference-only",
} as const;

const STRIPPED_PRIVATE_RUNTIME_METADATA = {
	source: "sticker-runtime-resource",
	stickerAssetId: `sticker-lab:${METADATA.batchId}:${METADATA.itemId}`,
} as const;

function createClient({ metadata }: { metadata: unknown }): EditorApiClient {
	return {
		get: vi.fn(async (requestPath: string) => {
			if (requestPath.endsWith("/settings")) {
				return {
					createdAt: "2026-08-23T00:00:00.000Z",
					name: "Sticker Lab",
					updatedAt: "2026-08-23T00:00:01.000Z",
				};
			}
			if (requestPath.endsWith("/stats")) {
				return { elementCount: 1, trackCount: 1 };
			}
			if (requestPath.includes("/media/")) {
				return [
					{
						createdAt: 1_777_075_200_000,
						id: "media-reference",
						metadata,
						name: "reference.png",
						path: "/project/media/reference.png",
						type: "image",
					},
				];
			}
			if (requestPath.endsWith("/navigator/projects")) {
				return { activeProjectId: "project-1", projects: [] };
			}
			throw new Error(`Unexpected path: ${requestPath}`);
		}),
	} as unknown as EditorApiClient;
}

describe("project.json restricted media provenance", () => {
	it("preserves the exact metadata through JSON serialization", async () => {
		const project = await buildProjectJSON(
			createClient({ metadata: METADATA }),
			"project-1"
		);
		const roundTripped = JSON.parse(JSON.stringify(project));

		expect(roundTripped.media).toHaveLength(1);
		expect(roundTripped.media[0].metadata).toEqual(METADATA);
		expect(Object.keys(roundTripped.media[0].metadata).sort()).toEqual(
			Object.keys(METADATA).sort()
		);
	});

	it("preserves normalized runtime descriptors and resource IDs", async () => {
		const metadata = {
			...METADATA,
			animatedSticker: true,
			stickerRuntime: {
				kind: "png-sequence",
				completion: "freeze-last",
				cycleDurationSeconds: 1,
				frames: [
					{
						durationSeconds: 1,
						startSeconds: 0,
						source: "$resource:asset_0001",
					},
				],
				repeat: { kind: "infinite" },
			},
			stickerRuntimeResources: { asset_0001: "runtime-frame-1" },
		} as const;
		const project = await buildProjectJSON(
			createClient({ metadata }),
			"project-1"
		);

		expect(project.media[0]?.metadata).toEqual(metadata);
	});

	it("fails closed when restricted metadata is malformed", async () => {
		await expect(
			buildProjectJSON(
				createClient({
					metadata: { ...METADATA, rootPath: "/private/reference-root" },
				}),
				"project-1"
			)
		).rejects.toMatchObject({
			code: RESTRICTED_MEDIA_EXPORT_ERROR_CODE,
			mediaIds: ["media-reference"],
		});
	});

	it("fails closed when private runtime metadata has its policy flags stripped", async () => {
		await expect(
			buildProjectJSON(
				createClient({ metadata: STRIPPED_PRIVATE_RUNTIME_METADATA }),
				"project-1"
			)
		).rejects.toMatchObject({
			code: RESTRICTED_MEDIA_EXPORT_ERROR_CODE,
			mediaIds: ["media-reference"],
		});
	});

	it("does not reinterpret ordinary media metadata as restricted", async () => {
		const project = await buildProjectJSON(
			createClient({ metadata: { camera: "phone" } }),
			"project-1"
		);

		expect(project.media).toHaveLength(1);
		expect(project.media[0].metadata).toBeUndefined();
	});
});
