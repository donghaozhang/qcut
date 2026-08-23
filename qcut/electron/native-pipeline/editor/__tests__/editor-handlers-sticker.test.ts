import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import type { CLIRunOptions } from "../../cli/cli-runner/types";
import type { EditorApiClient } from "../editor-api-client";
import {
	handleStickerCommand,
	type StickerHandlerDependencies,
} from "../editor-handlers-sticker";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function baseOptions({ command }: { command: string }): CLIRunOptions {
	return {
		command,
		outputDir: "/tmp",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function stickerLabDependencies({
	mimeType = "image/gif",
}: {
	mimeType?: "image/gif" | "image/png";
} = {}): StickerHandlerDependencies {
	const stickerId = mimeType === "image/gif" ? "18001" : "18002";
	return {
		discoverLocalReferences: async () => ({
			rootPath: "/private/QCut Sticker Lab",
			catalogs: [],
			warnings: [],
			summary: {
				batchCount: 0,
				categoryCount: 0,
				itemCount: 0,
				totalBytes: 0,
			},
		}),
		readLocalReference: async ({ batchId }) => ({
			bytes:
				mimeType === "image/gif"
					? new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
					: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			fileName: `${stickerId}.${mimeType === "image/gif" ? "gif" : "png"}`,
			mimeType,
			batchId,
			stickerId,
			checksumSha256: "a".repeat(64),
		}),
	};
}

describe("editor sticker handlers", () => {
	test("searches without requiring an open project", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					icons: ["fluent-emoji-flat:warning"],
					total: 1,
				}),
				{ status: 200 }
			);
		const result = await handleStickerCommand({} as EditorApiClient, {
			...baseOptions({ command: "editor:sticker:search" }),
			query: "warning",
			collection: "fluent-emoji-flat",
		});

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			total: 1,
			results: [{ id: "fluent-emoji-flat:warning" }],
		});
	});

	test("materializes a searched sticker before adding it to the timeline", async () => {
		globalThis.fetch = async () =>
			new Response(
				'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ffb020"/></svg>',
				{ status: 200, headers: { "Content-Type": "image/svg+xml" } }
			);
		let importedSource = "";
		let elementPayload: Record<string, unknown> | undefined;
		const client = {
			post: async (path: string, body: Record<string, unknown>) => {
				if (path.includes("/media/")) {
					importedSource = String(body.source);
					expect(existsSync(importedSource)).toBe(true);
					return { id: "media-sticker" };
				}
				elementPayload = body;
				return { id: "element-sticker" };
			},
		} as unknown as EditorApiClient;
		const result = await handleStickerCommand(client, {
			...baseOptions({ command: "editor:sticker:add" }),
			projectId: "project-1",
			stickerId: "fluent-emoji-flat:warning",
			startTime: 2,
			endTime: 4,
			x: 100,
			y: 120,
			width: 220,
		});

		expect(result.success).toBe(true);
		expect(importedSource.endsWith(".png")).toBe(true);
		expect(existsSync(importedSource)).toBe(false);
		expect(elementPayload).toMatchObject({
			type: "sticker",
			stickerId: "fluent-emoji-flat:warning",
			mediaId: "media-sticker",
			startTime: 2,
			duration: 2,
			x: 100,
			y: 120,
			width: 220,
		});
	});

	test("imports an animated local reference with strict private metadata", async () => {
		let importedSource = "";
		let importPayload: Record<string, unknown> | undefined;
		let elementPayload: Record<string, unknown> | undefined;
		const client = {
			post: async (path: string, body: Record<string, unknown>) => {
				if (path.includes("/media/")) {
					importedSource = String(body.source);
					importPayload = body;
					expect(importedSource.endsWith(".gif")).toBe(true);
					expect(existsSync(importedSource)).toBe(true);
					expect([...readFileSync(importedSource)]).toEqual([
						0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
					]);
					return { id: "media-local-gif" };
				}
				elementPayload = body;
				return { id: "element-local-gif" };
			},
		} as unknown as EditorApiClient;
		const result = await handleStickerCommand(
			client,
			{
				...baseOptions({ command: "editor:sticker:add" }),
				projectId: "project-1",
				provider: "sticker-lab",
				root: "/private/QCut Sticker Lab",
				batchId: "jianying-2026-08-23-batch-18-v2",
				stickerId: "18001",
				startTime: 1,
				endTime: 4,
			},
			stickerLabDependencies()
		);

		expect(existsSync(importedSource)).toBe(false);
		expect(importPayload).toEqual({
			source: importedSource,
			metadata: {
				source: "sticker-lab",
				animatedSticker: true,
				referenceOnly: true,
				usage: "internal-reference-only",
				redistribution: "prohibited",
				batchId: "jianying-2026-08-23-batch-18-v2",
				itemId: "18001",
				checksumSha256: "a".repeat(64),
			},
		});
		expect(JSON.stringify(importPayload?.metadata)).not.toContain("rootPath");
		expect(elementPayload).toMatchObject({
			type: "sticker",
			stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
			mediaId: "media-local-gif",
			startTime: 1,
			duration: 3,
		});
		expect(result).toMatchObject({
			success: true,
			data: {
				timeline: { id: "element-local-gif" },
				referenceOnly: true,
				usage: "internal-reference-only",
				redistribution: "prohibited",
				warning: expect.stringContaining("Do not redistribute"),
				provenance: {
					kind: "local-reference",
					rootPath: "/private/QCut Sticker Lab",
					batchId: "jianying-2026-08-23-batch-18-v2",
					stickerId: "18001",
					byteSize: 6,
					checksumSha256: "a".repeat(64),
				},
			},
		});
	});

	test("marks PNG local references as static", async () => {
		let metadata: Record<string, unknown> | undefined;
		const client = {
			post: async (path: string, body: Record<string, unknown>) => {
				if (path.includes("/media/")) {
					metadata = body.metadata as Record<string, unknown>;
					return { id: "media-local-png" };
				}
				return { id: "element-local-png" };
			},
		} as unknown as EditorApiClient;

		await handleStickerCommand(
			client,
			{
				...baseOptions({ command: "editor:sticker:add" }),
				projectId: "project-1",
				provider: "sticker-lab",
				batchId: "jianying-2026-08-23-batch-18-v2",
				stickerId: "18002",
				endTime: 2,
			},
			stickerLabDependencies({ mimeType: "image/png" })
		);

		expect(metadata).toMatchObject({ animatedSticker: false });
	});

	test("sends flat sticker update fields to the timeline route", async () => {
		let patchedPath = "";
		let patchedBody: unknown;
		const client = {
			patch: async (path: string, body: unknown) => {
				patchedPath = path;
				patchedBody = body;
				return { updated: true };
			},
		} as unknown as EditorApiClient;

		const result = await handleStickerCommand(client, {
			...baseOptions({ command: "editor:sticker:update" }),
			projectId: "project/one",
			elementId: "element/one",
			x: 120,
			y: 240,
			width: 320,
			startTime: 2,
			endTime: 5,
		});

		expect(result.success).toBe(true);
		expect(patchedPath).toBe(
			"/api/claude/timeline/project%2Fone/elements/element%2Fone"
		);
		expect(patchedBody).toEqual({
			x: 120,
			y: 240,
			width: 320,
			startTime: 2,
			duration: 3,
		});
		expect(patchedBody).not.toHaveProperty("changes");
	});

	test("cleans the temporary local reference when import fails", async () => {
		let importedSource = "";
		const client = {
			post: async (_path: string, body: Record<string, unknown>) => {
				importedSource = String(body.source);
				expect(existsSync(importedSource)).toBe(true);
				throw new Error("import unavailable");
			},
		} as unknown as EditorApiClient;

		await expect(
			handleStickerCommand(
				client,
				{
					...baseOptions({ command: "editor:sticker:add" }),
					projectId: "project-1",
					provider: "sticker-lab",
					batchId: "jianying-2026-08-23-batch-18-v2",
					stickerId: "18001",
					endTime: 2,
				},
				stickerLabDependencies()
			)
		).rejects.toThrow("import unavailable");
		expect(existsSync(importedSource)).toBe(false);
	});

	test("removes imported local media when the timeline write fails", async () => {
		const timelineError = new Error("timeline unavailable");
		let importedSource = "";
		let deletedPath = "";
		const client = {
			post: async (path: string, body: Record<string, unknown>) => {
				if (path.includes("/media/")) {
					importedSource = String(body.source);
					return { id: "media/local" };
				}
				throw timelineError;
			},
			delete: async (path: string) => {
				deletedPath = path;
				return { deleted: true };
			},
		} as unknown as EditorApiClient;
		let caught: unknown;
		try {
			await handleStickerCommand(
				client,
				{
					...baseOptions({ command: "editor:sticker:add" }),
					projectId: "project/one",
					provider: "sticker-lab",
					batchId: "jianying-2026-08-23-batch-18-v2",
					stickerId: "18001",
					endTime: 2,
				},
				stickerLabDependencies()
			);
		} catch (error) {
			caught = error;
		}

		expect(caught).toBe(timelineError);
		expect(deletedPath).toBe("/api/claude/media/project%2Fone/media%2Flocal");
		expect(existsSync(importedSource)).toBe(false);
	});

	test("reports both timeline and imported media rollback failures", async () => {
		const timelineError = new Error("timeline rejected element");
		let rollbackAttempted = false;
		const client = {
			post: async (path: string) => {
				if (path.includes("/media/")) return { id: "media-local" };
				throw timelineError;
			},
			delete: async () => {
				rollbackAttempted = true;
				throw new Error("rollback unavailable");
			},
		} as unknown as EditorApiClient;
		let caught: unknown;
		try {
			await handleStickerCommand(
				client,
				{
					...baseOptions({ command: "editor:sticker:add" }),
					projectId: "project-1",
					provider: "sticker-lab",
					batchId: "jianying-2026-08-23-batch-18-v2",
					stickerId: "18001",
					endTime: 2,
				},
				stickerLabDependencies()
			);
		} catch (error) {
			caught = error;
		}

		expect(rollbackAttempted).toBe(true);
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toBe(
			"Timeline placement failed: timeline rejected element. Imported media rollback also failed: rollback unavailable"
		);
	});

	test("requires explicit sticker-lab provider selectors", async () => {
		const client = {} as EditorApiClient;
		const batchWithoutProvider = await handleStickerCommand(client, {
			...baseOptions({ command: "editor:sticker:add" }),
			projectId: "project-1",
			batchId: "jianying-2026-08-23-batch-18-v2",
			stickerId: "18001",
			endTime: 2,
		});
		const compositeWithoutProvider = await handleStickerCommand(client, {
			...baseOptions({ command: "editor:sticker:add" }),
			projectId: "project-1",
			stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
			endTime: 2,
		});
		const missingBatch = await handleStickerCommand(client, {
			...baseOptions({ command: "editor:sticker:add" }),
			projectId: "project-1",
			provider: "sticker-lab",
			stickerId: "18001",
			endTime: 2,
		});
		const sourceConflict = await handleStickerCommand(client, {
			...baseOptions({ command: "editor:sticker:add" }),
			projectId: "project-1",
			provider: "sticker-lab",
			batchId: "jianying-2026-08-23-batch-18-v2",
			stickerId: "18001",
			source: "/tmp/reference.gif",
			endTime: 2,
		});

		expect(batchWithoutProvider.error).toContain(
			"--batch-id requires --provider sticker-lab"
		);
		expect(compositeWithoutProvider.error).toContain("explicit --provider");
		expect(missingBatch.error).toBe("Missing --batch-id");
		expect(sourceConflict.error).toContain("--source cannot be used");
	});
});
