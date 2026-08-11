import { existsSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import type { CLIRunOptions } from "../../cli/cli-runner/types";
import type { EditorApiClient } from "../editor-api-client";
import { handleStickerCommand } from "../editor-handlers-sticker";

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
});
