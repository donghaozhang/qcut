import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CLIRunOptions } from "../../cli/cli-runner/types";
import type { EditorApiClient } from "../editor-api-client";
import {
	handleStickerCommand,
	type StickerHandlerDependencies,
} from "../editor-handlers-sticker";

const ROOT_PATH = "/private/QCut Sticker Lab";
const BATCH_ID = "jianying-2026-08-30-batch-19";
const STICKER_ID = "19005";
const PRIMARY_CHECKSUM = "a".repeat(64);
const RESOURCE_CHECKSUM = "b".repeat(64);

function runtimeStickerLabDependencies(): StickerHandlerDependencies {
	const primaryBytes = new Uint8Array([1, 2, 3, 4]);
	const resourceBytes = new Uint8Array([5, 6, 7, 8]);
	const descriptor = {
		kind: "atlas-animation" as const,
		atlasSource: "atlas/SequenceMap.png",
		atlasSize: { width: 32, height: 32 },
		cycleDurationSeconds: 1,
		frames: [
			{
				id: "frame-0",
				startSeconds: 0,
				durationSeconds: 1,
				frameRect: { x: 0, y: 0, width: 32, height: 32 },
				rotated: false,
				trimmed: false,
				spriteSourceRect: { x: 0, y: 0, width: 32, height: 32 },
				sourceSize: { width: 32, height: 32 },
			},
		],
		repeat: { kind: "infinite" as const },
		completion: "freeze-last" as const,
	};
	return {
		discoverLocalReferences: async () => ({
			rootPath: ROOT_PATH,
			catalogs: [
				{
					version: 1,
					batchId: BATCH_ID,
					referenceOnly: true,
					categories: [
						{
							id: "runtime",
							label: "Runtime",
							sourcePanel: "Test fixture",
							items: [
								{
									id: STICKER_ID,
									displayName: "Atlas runtime",
									fileName: "atlas-preview.png",
									mimeType: "image/png",
									sourceKind: "atlas-animation",
									playback: {
										kind: "animated",
										frameCount: 1,
										cycleDuration: 1,
										loop: true,
									},
									asset: {
										kind: "local-reference",
										rootPath: ROOT_PATH,
										batchId: BATCH_ID,
										stickerId: STICKER_ID,
										byteSize: primaryBytes.byteLength,
										checksumSha256: PRIMARY_CHECKSUM,
									},
									runtimePackage: {
										descriptor,
										resources: [
											{
												resourceName: "atlas/SequenceMap.png",
												fileName: "SequenceMap.png",
												mimeType: "image/png",
												asset: {
													kind: "local-reference-runtime-resource",
													rootPath: ROOT_PATH,
													batchId: BATCH_ID,
													stickerId: STICKER_ID,
													resourceName: "atlas/SequenceMap.png",
													byteSize: resourceBytes.byteLength,
													checksumSha256: RESOURCE_CHECKSUM,
												},
											},
										],
									},
								},
							],
						},
					],
					itemCount: 1,
					totalBytes: primaryBytes.byteLength + resourceBytes.byteLength,
				},
			],
			warnings: [],
			summary: {
				batchCount: 1,
				categoryCount: 1,
				itemCount: 1,
				totalBytes: primaryBytes.byteLength + resourceBytes.byteLength,
			},
		}),
		readLocalReference: async ({ batchId, resourceName }) =>
			resourceName
				? {
						batchId,
						bytes: resourceBytes,
						checksumSha256: RESOURCE_CHECKSUM,
						fileName: "SequenceMap.png",
						mimeType: "image/png",
						resourceName,
						stickerId: STICKER_ID,
					}
				: {
						batchId,
						bytes: primaryBytes,
						checksumSha256: PRIMARY_CHECKSUM,
						fileName: "atlas-preview.png",
						mimeType: "image/png",
						stickerId: STICKER_ID,
					},
	};
}

describe("editor sticker runtime handler", () => {
	test("rolls back primary and runtime resources when timeline placement fails", async () => {
		const timelineError = new Error("timeline rejected runtime sticker");
		const deletedPaths: string[] = [];
		const importedSources: string[] = [];
		let timelineElement: Record<string, unknown> | undefined;
		const client = {
			post: async (path: string, body: Record<string, unknown>) => {
				if (path.includes("/media/")) {
					const metadata = body.metadata as Record<string, unknown>;
					importedSources.push(String(body.source));
					return {
						id:
							metadata.source === "sticker-runtime-resource"
								? "media-runtime"
								: "media-primary",
					};
				}
				timelineElement = body;
				throw timelineError;
			},
			delete: async (path: string) => {
				deletedPaths.push(path);
				return true;
			},
		} as unknown as EditorApiClient;
		const options = {
			command: "editor:sticker:add",
			outputDir: "/tmp",
			saveIntermediates: false,
			json: true,
			verbose: false,
			quiet: true,
			projectId: "project/runtime",
			provider: "sticker-lab",
			batchId: BATCH_ID,
			stickerId: STICKER_ID,
			endTime: 2,
		} satisfies CLIRunOptions;

		await expect(
			handleStickerCommand(client, options, runtimeStickerLabDependencies())
		).rejects.toBe(timelineError);
		expect(new Set(deletedPaths)).toEqual(
			new Set([
				"/api/claude/media/project%2Fruntime/media-primary",
				"/api/claude/media/project%2Fruntime/media-runtime",
			])
		);
		expect(timelineElement).toMatchObject({
			mediaId: "media-primary",
			stickerRuntime: {
				kind: "atlas-animation",
				atlasSource: "$resource:asset_0001",
			},
		});
		expect(importedSources.every((source) => !existsSync(source))).toBe(true);
	});
});
