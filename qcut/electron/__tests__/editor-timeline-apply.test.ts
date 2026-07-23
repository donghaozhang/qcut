import { describe, expect, it, vi } from "vitest";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import { timelineApplyManifest } from "../native-pipeline/editor/editor-timeline-apply.js";

function makeOptions(manifest: object): CLIRunOptions {
	return {
		command: "editor:timeline:apply",
		projectId: "project-1",
		manifest: JSON.stringify(manifest),
		atomic: true,
		verify: true,
		outputDir: "./output",
		json: true,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
	} as CLIRunOptions;
}

function makeClient({ finalName = "Titles" }: { finalName?: string } = {}) {
	let timelineReads = 0;
	const get = vi.fn(async (url: string) => {
		if (url === "/api/claude/navigator/projects") {
			return { activeProjectId: "project-1", projects: [] };
		}
		if (url === "/api/claude/media/project-1") return [];
		if (url === "/api/claude/timeline/project-1") {
			timelineReads += 1;
			if (timelineReads <= 2) {
				return {
					tracks: [
						{
							id: "main-track",
							index: 0,
							name: "Main Track",
							type: "media",
							isMain: true,
							elements: [],
						},
					],
				};
			}
			return {
				tracks: [
					{
						id: "main-track",
						index: 0,
						name: "Main Video",
						type: "media",
						isMain: true,
						elements: [
							{
								id: "video-1",
								startTime: 0,
								duration: 2,
							},
						],
						transitions: [],
					},
					{
						id: "track-1",
						index: 1,
						name: finalName,
						type: "text",
						elements: [
							{
								id: "element-1",
								startTime: 0,
								duration: 2,
								content: "Hello from CLI",
								fontSize: 72,
								color: "#ffcc00",
							},
						],
						transitions: [],
					},
				],
			};
		}
		throw new Error(`Unexpected GET ${url}`);
	});
	const post = vi.fn(async (url: string) => {
		if (url === "/api/claude/navigator/open") {
			return { navigated: true, projectId: "project-1" };
		}
		if (url === "/api/claude/transaction/begin") {
			return { transactionId: "transaction-1" };
		}
		if (url === "/api/claude/timeline/project-1/tracks") {
			return { trackId: "track-1" };
		}
		if (url === "/api/claude/timeline/project-1/elements/batch") {
			return {
				added: [
					{ index: 0, success: true, elementId: "video-1" },
					{ index: 1, success: true, elementId: "element-1" },
				],
				failedCount: 0,
			};
		}
		if (url.endsWith("/commit")) return { committed: true };
		if (url.endsWith("/rollback")) return { rolledBack: true };
		throw new Error(`Unexpected POST ${url}`);
	});
	return {
		client: {
			get,
			post,
			patch: vi.fn(),
			delete: vi.fn(),
		} as unknown as EditorApiClient,
		get,
		post,
	};
}

const manifest = {
	replace: true,
	tracks: [
		{
			alias: "main",
			name: "Main Video",
			type: "media",
			elements: [
				{
					alias: "video",
					type: "media",
					mediaId: "existing-media",
					startTime: 0,
					duration: 2,
				},
			],
		},
		{
			alias: "titles",
			name: "Titles",
			type: "text",
			elements: [
				{
					alias: "headline",
					type: "text",
					startTime: 0,
					duration: 2,
					content: "Hello from CLI",
					fontSize: 72,
					color: "#ffcc00",
				},
			],
		},
	],
};

function makeImportedMediaClient({ exportFails = false } = {}) {
	let timelineReads = 0;
	const get = vi.fn(async (url: string) => {
		if (url === "/api/claude/navigator/projects") {
			return { activeProjectId: "project-1", projects: [] };
		}
		if (url === "/api/claude/media/project-1") return [];
		if (url === "/api/claude/timeline/project-1") {
			timelineReads += 1;
			if (timelineReads <= 2) {
				return {
					tracks: [
						{
							id: "main-track",
							index: 0,
							name: "Main Track",
							type: "media",
							isMain: true,
							elements: [],
						},
					],
				};
			}
			return {
				tracks: [
					{
						id: "main-track",
						index: 0,
						name: "Main Video",
						type: "media",
						isMain: true,
						elements: [{ id: "video-1", startTime: 0, duration: 2 }],
						transitions: [],
					},
				],
			};
		}
		throw new Error(`Unexpected GET ${url}`);
	});
	const post = vi.fn(async (url: string) => {
		if (url === "/api/claude/navigator/open") {
			return { navigated: true, projectId: "project-1" };
		}
		if (url === "/api/claude/media/project-1/batch-import") {
			return [
				{
					index: 0,
					success: true,
					mediaFile: { id: "imported-media", name: "imported.mp4" },
				},
			];
		}
		if (url === "/api/claude/transaction/begin") {
			return { transactionId: "transaction-1" };
		}
		if (url === "/api/claude/timeline/project-1/elements/batch") {
			return {
				added: [{ index: 0, success: true, elementId: "video-1" }],
				failedCount: 0,
			};
		}
		if (url.endsWith("/commit")) return { committed: true };
		if (url === "/api/claude/export/project-1/start" && exportFails) {
			throw new Error("Export unavailable");
		}
		throw new Error(`Unexpected POST ${url}`);
	});
	const remove = vi.fn(async () => ({ success: true }));
	return {
		client: {
			get,
			post,
			patch: vi.fn(async () => ({ success: true })),
			delete: remove,
		} as unknown as EditorApiClient,
		post,
		remove,
	};
}

const mixedMediaManifest = {
	replace: true,
	media: [{ mediaId: "existing-media" }, { path: "/tmp/imported.mp4" }],
	tracks: [
		{
			alias: "main",
			name: "Main Video",
			type: "media",
			elements: [
				{
					alias: "clip",
					type: "media",
					media: "media-1",
					startTime: 0,
					duration: 2,
				},
			],
		},
	],
};

describe("editor timeline apply", () => {
	it("creates named tracks and full text atomically, then verifies read-back", async () => {
		const { client, post } = makeClient();
		const result = await timelineApplyManifest(client, makeOptions(manifest));

		expect(result.success).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({ atomic: true, verified: true })
		);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/tracks",
			expect.objectContaining({ type: "text", name: "Titles", index: 1 })
		);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/elements/batch",
			{
				elements: [
					expect.objectContaining({
						trackId: "main-track",
						mediaId: "existing-media",
					}),
					expect.objectContaining({
						trackId: "track-1",
						content: "Hello from CLI",
						fontSize: 72,
						color: "#ffcc00",
					}),
				],
			}
		);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/transaction/transaction-1/commit",
			{}
		);
	});

	it("rolls back when read-back verification differs", async () => {
		const { client, post } = makeClient({ finalName: "Wrong name" });
		const result = await timelineApplyManifest(client, makeOptions(manifest));

		expect(result.success).toBe(false);
		expect(result.error).toContain("name mismatch");
		expect(result.data).toEqual(expect.objectContaining({ rolledBack: true }));
		expect(post).toHaveBeenCalledWith(
			"/api/claude/transaction/transaction-1/rollback",
			expect.objectContaining({
				reason: expect.stringContaining("name mismatch"),
			})
		);
	});

	it("keeps anonymous media aliases aligned with manifest indexes", async () => {
		const { client, post } = makeImportedMediaClient();
		const result = await timelineApplyManifest(
			client,
			makeOptions(mixedMediaManifest)
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({
				media: expect.objectContaining({
					"media-0": "existing-media",
					"media-1": "imported-media",
				}),
			})
		);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/elements/batch",
			{
				elements: [expect.objectContaining({ sourceId: "imported-media" })],
			}
		);
	});

	it("does not roll back committed media when export startup fails", async () => {
		const { client, post, remove } = makeImportedMediaClient({
			exportFails: true,
		});
		const result = await timelineApplyManifest(
			client,
			makeOptions({
				...mixedMediaManifest,
				export: { start: true, format: "mp4" },
			})
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Export unavailable");
		expect(result.data).toEqual(
			expect.objectContaining({ rolledBack: false, cleanedMedia: [] })
		);
		expect(
			post.mock.calls.some(([url]) => String(url).endsWith("/rollback"))
		).toBe(false);
		expect(remove).not.toHaveBeenCalled();
	});
});
