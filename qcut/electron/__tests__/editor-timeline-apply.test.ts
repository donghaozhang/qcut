import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
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

function makeClient({
	finalName = "Titles",
	videoElement = { startTime: 0, duration: 2 },
	textElement = {
		startTime: 0,
		duration: 2,
		content: "Hello from CLI",
		fontSize: 72,
		color: "#ffcc00",
	},
	mediaFiles = [],
	textAboveMedia = false,
}: {
	finalName?: string;
	videoElement?: Record<string, unknown>;
	textElement?: Record<string, unknown>;
	mediaFiles?: Array<{ id: string; name: string; size: number }>;
	textAboveMedia?: boolean;
} = {}) {
	let timelineReads = 0;
	const get = vi.fn(async (url: string) => {
		if (url === "/api/claude/navigator/projects") {
			return { activeProjectId: "project-1", projects: [] };
		}
		if (url === "/api/claude/media/project-1") return mediaFiles;
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
			const mediaTrack = {
				id: "main-track",
				index: textAboveMedia ? 1 : 0,
				name: "Main Video",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-1",
						...videoElement,
					},
				],
				transitions: [],
			};
			const textTrack = {
				id: "track-1",
				index: textAboveMedia ? 0 : 1,
				name: finalName,
				type: "text",
				elements: [
					{
						id: "element-1",
						...textElement,
					},
				],
				transitions: [],
			};
			return {
				tracks: textAboveMedia
					? [textTrack, mediaTrack]
					: [mediaTrack, textTrack],
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
		if (url === "/api/claude/media/project-1/batch-import") {
			return [
				{
					success: true,
					mediaFile: { id: "imported-media", name: "yarra.mp4" },
				},
			];
		}
		if (url === "/api/claude/timeline/project-1/elements/batch") {
			return {
				added: textAboveMedia
					? [
							{ index: 0, success: true, elementId: "element-1" },
							{ index: 1, success: true, elementId: "video-1" },
						]
					: [
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

	it("keeps overlay tracks above the required main media track", async () => {
		const layeredManifest = {
			...manifest,
			tracks: [manifest.tracks[1], manifest.tracks[0]],
		};
		const { client, post } = makeClient({ textAboveMedia: true });
		const result = await timelineApplyManifest(
			client,
			makeOptions(layeredManifest)
		);

		expect(result).toEqual(expect.objectContaining({ success: true }));
		expect(post).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/tracks",
			expect.objectContaining({ type: "text", name: "Titles", index: 0 })
		);
		expect(client.patch).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/tracks/main-track",
			expect.objectContaining({ index: 1, name: "Main Video" })
		);
	});

	it("verifies declarative text animation presets against canonical state", async () => {
		const animatedManifest = {
			...manifest,
			tracks: manifest.tracks.map((track, index) =>
				index === 1
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									textAnimationPreset: {
										phase: "entrance",
										presetId: "laser-etch",
									},
								},
							],
						}
					: track
			),
		};
		const { client } = makeClient({
			textElement: {
				startTime: 0,
				duration: 2,
				content: "Hello from CLI",
				fontSize: 72,
				color: "#ffcc00",
				textAnimations: {
					schemaVersion: 1,
					entrance: {
						sourcePreset: { id: "laser-etch", version: 1 },
					},
				},
			},
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(animatedManifest)
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({ atomic: true, verified: true })
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

	it("verifies source trims against the effective media duration", async () => {
		const trimmedManifest = {
			...manifest,
			tracks: manifest.tracks.map((track, index) =>
				index === 0
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									duration: 20,
									trimStart: 2.4,
									trimEnd: 11.6,
								},
							],
						}
					: track
			),
		};
		const { client } = makeClient({
			videoElement: {
				startTime: 0,
				duration: 6,
				trimStart: 2.4,
				trimEnd: 11.6,
			},
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(trimmedManifest)
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({ atomic: true, verified: true })
		);
	});

	it("verifies media speed, reverse, and freeze timing", async () => {
		const speedKeyframes = [
			{ id: "slow", frame: 0, value: 0.5, easing: "linear" },
			{ id: "fast", frame: 60, value: 2, easing: "easeOut" },
		];
		const speedManifest = {
			...manifest,
			tracks: manifest.tracks.map((track, index) =>
				index === 0
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									playbackRate: 1.5,
									speedKeyframes,
									reverse: true,
									freezeFrameTime: 0.75,
									freezeFrameDuration: 0.5,
								},
							],
						}
					: track
			),
		};
		const { client } = makeClient({
			videoElement: {
				startTime: 0,
				duration: 2,
				playbackRate: 1.5,
				speedKeyframes,
				reverse: true,
				freezeFrameTime: 0.75,
				freezeFrameDuration: 0.5,
			},
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(speedManifest)
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({ atomic: true, verified: true })
		);
	});

	it("rolls back when a media speed field is not applied", async () => {
		const speedManifest = {
			...manifest,
			tracks: manifest.tracks.map((track, index) =>
				index === 0
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									playbackRate: 2,
								},
							],
						}
					: track
			),
		};
		const { client, post } = makeClient({
			videoElement: {
				startTime: 0,
				duration: 2,
				playbackRate: 1,
			},
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(speedManifest)
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("field 'playbackRate' did not match");
		expect(post).toHaveBeenCalledWith(
			"/api/claude/transaction/transaction-1/rollback",
			expect.any(Object)
		);
	});

	it("rejects a source trim that points at the wrong frame range", async () => {
		const trimmedManifest = {
			...manifest,
			tracks: manifest.tracks.map((track, index) =>
				index === 0
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									duration: 20,
									trimStart: 2.4,
									trimEnd: 11.6,
								},
							],
						}
					: track
			),
		};
		const { client } = makeClient({
			videoElement: {
				startTime: 0,
				duration: 6,
				trimStart: 2.5,
				trimEnd: 11.5,
			},
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(trimmedManifest)
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("trimStart");
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

	it("reuses an existing local media file with the same name and size", async () => {
		const root = await fs.mkdtemp(resolve(tmpdir(), "qcut-manifest-media-"));
		const mediaPath = resolve(root, "yarra.mp4");
		await fs.writeFile(mediaPath, "same-media-content");
		const stat = await fs.stat(mediaPath);
		const reusableManifest = {
			...manifest,
			media: [
				{
					alias: "yarra",
					path: mediaPath,
					filename: "yarra.mp4",
				},
			],
			tracks: manifest.tracks.map((track, index) =>
				index === 0
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									media: "yarra",
									mediaId: undefined,
								},
							],
						}
					: track
			),
		};
		const { client, post } = makeClient({
			mediaFiles: [
				{ id: "existing-yarra", name: "yarra.mp4", size: stat.size },
			],
		});

		try {
			const result = await timelineApplyManifest(
				client,
				makeOptions(reusableManifest)
			);

			expect(result.success).toBe(true);
			expect(
				post.mock.calls.some(([url]) => String(url).endsWith("/batch-import"))
			).toBe(false);
			expect(post).toHaveBeenCalledWith(
				"/api/claude/timeline/project-1/elements/batch",
				{
					elements: [
						expect.objectContaining({ sourceId: "existing-yarra" }),
						expect.any(Object),
					],
				}
			);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it("imports local media when an existing filename has different bytes", async () => {
		const root = await fs.mkdtemp(resolve(tmpdir(), "qcut-manifest-media-"));
		const mediaPath = resolve(root, "yarra.mp4");
		await fs.writeFile(mediaPath, "new-media-content");
		const differentMediaManifest = {
			...manifest,
			media: [
				{
					alias: "yarra",
					path: mediaPath,
					filename: "yarra.mp4",
				},
			],
			tracks: manifest.tracks.map((track, index) =>
				index === 0
					? {
							...track,
							elements: [
								{
									...track.elements[0],
									media: "yarra",
									mediaId: undefined,
								},
							],
						}
					: track
			),
		};
		const { client, post } = makeClient({
			mediaFiles: [{ id: "old-yarra", name: "yarra.mp4", size: 3 }],
		});

		try {
			const result = await timelineApplyManifest(
				client,
				makeOptions(differentMediaManifest)
			);

			expect(result.success).toBe(true);
			expect(
				post.mock.calls.some(([url]) => String(url).endsWith("/batch-import"))
			).toBe(true);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
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
