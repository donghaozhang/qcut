import { describe, expect, it, vi } from "vitest";
import type { EditorApiClient } from "../../editor/editor-api-client.js";
import type { CLIRunOptions } from "../cli-runner/types.js";

const writeFileSync = vi.hoisted(() => vi.fn());

vi.mock("fs", () => ({
	default: {
		existsSync: vi.fn(() => true),
		mkdirSync: vi.fn(),
		writeFileSync,
	},
}));

import { handleMediaProjectCommand } from "../../editor/editor-handlers-media.js";

function createClient(): EditorApiClient {
	return {
		get: vi.fn(async (requestPath: string) => {
			if (requestPath.endsWith("/settings")) return { name: "Restricted" };
			if (requestPath.endsWith("/stats")) return {};
			if (requestPath.includes("/media/")) {
				return [
					{
						id: "restricted-sticker",
						metadata: {
							animatedSticker: true,
							batchId: "jianying-2026-08-23-batch-18-v2",
							checksumSha256: "a".repeat(64),
							itemId: "18001",
							redistribution: "prohibited",
							referenceOnly: true,
							source: "sticker-lab",
							usage: "internal-reference-only",
						},
						name: "reference.gif",
						path: "/private/reference.gif",
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

describe("project state restricted export policy", () => {
	it("refuses project exchange before creating the output file", async () => {
		const result = await handleMediaProjectCommand(
			createClient(),
			{
				command: "editor:project:export-state",
				output: "/tmp/must-not-exist-project-state.json",
				outputDir: "/tmp",
				projectId: "project-1",
			} as CLIRunOptions,
			vi.fn()
		);

		expect(result).toMatchObject({
			error: expect.stringContaining(
				"Sticker Lab reference-only media cannot be exported or redistributed."
			),
			success: false,
		});
		expect(writeFileSync).not.toHaveBeenCalled();
	});
});
