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

function fixtureSourceDuration(
	element: Record<string, unknown>
): number | undefined {
	if (typeof element.duration !== "number") return undefined;
	const trimStart =
		typeof element.trimStart === "number" && element.trimStart > 0
			? element.trimStart
			: 0;
	const trimEnd =
		typeof element.trimEnd === "number" && element.trimEnd > 0
			? element.trimEnd
			: 0;
	return Math.max(0, element.duration - trimStart - trimEnd);
}

/** Mirror of the live bridge's constant-rate timelineDuration read-back. */
function fixtureTimelineDuration(
	element: Record<string, unknown>
): number | undefined {
	const sourceDuration = fixtureSourceDuration(element);
	if (sourceDuration === undefined) return undefined;
	const playbackRate =
		typeof element.playbackRate === "number" && element.playbackRate > 0
			? element.playbackRate
			: 1;
	return sourceDuration / playbackRate;
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
	mediaTransitions = [],
}: {
	finalName?: string;
	videoElement?: Record<string, unknown>;
	textElement?: Record<string, unknown>;
	mediaFiles?: Array<{ id: string; name: string; size: number }>;
	textAboveMedia?: boolean;
	mediaTransitions?: Array<Record<string, unknown> & { id: string }>;
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
						duration: fixtureSourceDuration(videoElement),
						timelineDuration:
							typeof videoElement.timelineDuration === "number"
								? videoElement.timelineDuration
								: fixtureTimelineDuration(videoElement),
					},
				],
				transitions: mediaTransitions,
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
		if (
			url === "/api/claude/timeline/project-1/tracks/main-track/transitions"
		) {
			return { transitionId: "transition-1" };
		}
		if (url.endsWith("/commit")) return { committed: true };
		if (url.endsWith("/rollback")) return { rolledBack: true };
		throw new Error(`Unexpected POST ${url}`);
	});
	const patch = vi.fn(async () => ({
		updatedCount: 1,
		failedCount: 0,
		results: [{ index: 0, success: true }],
	}));
	return {
		client: {
			get,
			post,
			patch,
			delete: vi.fn(),
		} as unknown as EditorApiClient,
		get,
		post,
		patch,
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
						elements: [
							{ id: "video-1", startTime: 0, duration: 2, timelineDuration: 2 },
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
	it("updates existing media keyframes inside the atomic manifest", async () => {
		const keyframes = {
			scaleX: [
				{ id: "zoom-x-start", frame: 0, value: 1, easing: "easeInOut" },
				{ id: "zoom-x-end", frame: 60, value: 1.2, easing: "easeInOut" },
			],
			scaleY: [
				{ id: "zoom-y-start", frame: 0, value: 1, easing: "easeInOut" },
				{ id: "zoom-y-end", frame: 60, value: 1.2, easing: "easeInOut" },
			],
		};
		const { client, patch } = makeClient({
			videoElement: { startTime: 0, duration: 2, keyframes },
		});
		const result = await timelineApplyManifest(
			client,
			makeOptions({
				tracks: [],
				updates: [
					{
						alias: "zoom:1",
						elementId: "video-1",
						trackId: "main-track",
						keyframes,
					},
				],
			})
		);

		expect(result.success).toBe(true);
		expect(patch).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/elements/batch",
			{ updates: [{ elementId: "video-1", keyframes }] }
		);
	});

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

	it("rejects a transition whose easing changed during read-back", async () => {
		const transitionManifest = {
			...manifest,
			transitions: [
				{
					track: "main",
					from: "video",
					to: "headline",
					type: "push",
					presetId: "move-left",
					direction: "right",
					duration: 1,
					easing: "easeInOutQuint",
				},
			],
		};
		const { client, post } = makeClient({
			mediaTransitions: [
				{
					id: "transition-1",
					fromElementId: "video-1",
					toElementId: "element-1",
					type: "push",
					presetId: "move-left",
					direction: "right",
					duration: 1,
					easing: "easeInOut",
				},
			],
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(transitionManifest)
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("field 'easing' did not match");
		expect(post).toHaveBeenCalledWith(
			"/api/claude/transaction/transaction-1/rollback",
			expect.objectContaining({ reason: expect.stringContaining("easing") })
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

	it("verifies a cleared text animation phase as none", async () => {
		const clearedManifest = {
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
										presetId: "none",
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
				textAnimations: { schemaVersion: 1 },
			},
		});

		const result = await timelineApplyManifest(
			client,
			makeOptions(clearedManifest)
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
				duration: 20,
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
				duration: 20,
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

/** Fake editor with one sticker lane, for read-back verification tests. */
function makeStickerClient({
	stickerElement,
}: {
	stickerElement: Record<string, unknown>;
}) {
	let timelineReads = 0;
	const get = vi.fn(async (url: string) => {
		if (url === "/api/claude/navigator/projects") {
			return { activeProjectId: "project-1", projects: [] };
		}
		if (url === "/api/claude/media/project-1") return [];
		if (url === "/api/claude/timeline/project-1") {
			timelineReads += 1;
			const mainTrack = {
				id: "main-track",
				index: 1,
				name: "Main Track",
				type: "media",
				isMain: true,
				elements: [],
			};
			if (timelineReads <= 2) return { tracks: [mainTrack] };
			return {
				tracks: [
					{
						id: "track-1",
						index: 0,
						name: "Stickers",
						type: "sticker",
						elements: [{ id: "element-1", ...stickerElement }],
						transitions: [],
					},
					mainTrack,
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
				added: [{ index: 0, success: true, elementId: "element-1" }],
				failedCount: 0,
			};
		}
		if (url === "/api/claude/transaction/transaction-1/commit") return {};
		if (url === "/api/claude/transaction/transaction-1/rollback") return {};
		throw new Error(`Unexpected POST ${url}`);
	});
	return {
		client: {
			get,
			post,
			patch: vi.fn(async () => ({ success: true })),
			delete: vi.fn(async () => true),
		} as unknown as EditorApiClient,
		post,
	};
}

describe("timeline read-back catches dropped fields", () => {
	const audioFadeManifest = {
		replace: true,
		tracks: [
			{
				alias: "main",
				name: "Main Video",
				type: "media",
				elements: [
					{
						alias: "clip",
						type: "media",
						mediaId: "existing-media",
						startTime: 0,
						duration: 2,
						audioFadeIn: 1,
						audioFadeOut: 0.5,
					},
				],
			},
		],
	};

	it("fails and rolls back when the editor drops audio fades", async () => {
		const { client, post } = makeClient({
			videoElement: { startTime: 0, duration: 2 },
		});
		const result = await timelineApplyManifest(
			client,
			makeOptions(audioFadeManifest)
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("audioFadeIn");
		expect(post).toHaveBeenCalledWith(
			"/api/claude/transaction/transaction-1/rollback",
			expect.objectContaining({ reason: expect.stringContaining("audioFade") })
		);
	});

	it("passes when the editor persists the audio fades", async () => {
		const { client } = makeClient({
			videoElement: {
				startTime: 0,
				duration: 2,
				audioFadeIn: 1,
				audioFadeOut: 0.5,
			},
		});
		const result = await timelineApplyManifest(
			client,
			makeOptions(audioFadeManifest)
		);
		expect(result.success).toBe(true);
	});

	it("catches a 2x clip whose timeline span ignored the playback rate", async () => {
		const ratedManifest = {
			replace: true,
			tracks: [
				{
					alias: "main",
					name: "Main Video",
					type: "media",
					elements: [
						{
							alias: "clip",
							type: "media",
							mediaId: "existing-media",
							startTime: 0,
							duration: 2,
							playbackRate: 2,
						},
					],
				},
			],
		};
		// A lying editor reports the raw 2s span instead of 2s / 2 = 1s.
		const lying = makeClient({
			videoElement: {
				startTime: 0,
				duration: 2,
				playbackRate: 2,
				timelineDuration: 2,
			},
		});
		const badResult = await timelineApplyManifest(
			lying.client,
			makeOptions(ratedManifest)
		);
		expect(badResult.success).toBe(false);
		expect(badResult.error).toContain("timelineDuration");

		// The truthful editor reports (2 − 0) / 2 = 1s and verifies.
		const truthful = makeClient({
			videoElement: { startTime: 0, duration: 2, playbackRate: 2 },
		});
		const goodResult = await timelineApplyManifest(
			truthful.client,
			makeOptions(ratedManifest)
		);
		expect(goodResult.success).toBe(true);
	});

	it("catches transitions that lose their engine identity", async () => {
		const packageHash = "b".repeat(40);
		const transitionManifest = {
			...manifest,
			transitions: [
				{
					track: "main",
					from: "video",
					to: "headline",
					type: "wipe",
					presetId: "jianying-wipe",
					duration: 1,
					engine: "jianying-local",
					packageHash,
				},
			],
		};
		const { client } = makeClient({
			mediaTransitions: [
				{
					id: "transition-1",
					fromElementId: "video-1",
					toElementId: "element-1",
					type: "wipe",
					presetId: "jianying-wipe",
					duration: 1,
					engine: "qcut",
				},
			],
		});
		const result = await timelineApplyManifest(
			client,
			makeOptions(transitionManifest)
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("engine");
		expect(result.error).toContain("packageHash");
	});

	it("catches stickers that lose animation and aspect-lock fields", async () => {
		const stickerManifest = {
			tracks: [
				{
					alias: "stickers",
					name: "Stickers",
					type: "sticker",
					elements: [
						{
							alias: "sticker-op",
							type: "sticker",
							stickerId: "sticker-op",
							stickerAssetId: "sticker-lab:batch:1",
							mediaId: "m1",
							startTime: 0,
							duration: 2,
							maintainAspectRatio: false,
							animationInType: "fade",
							animationInDuration: 0.5,
							animationLoopType: "pulse",
							animationLoopIntensity: 0.5,
						},
					],
				},
			],
		};
		const storedSticker = {
			type: "sticker",
			stickerId: "sticker-op",
			stickerAssetId: "sticker-lab:batch:1",
			mediaId: "m1",
			startTime: 0,
			duration: 2,
			maintainAspectRatio: false,
			animationInType: "fade",
			animationInDuration: 0.5,
			animationLoopType: "pulse",
			animationLoopIntensity: 0.5,
		};

		// Dropping just the loop animation must fail the whole apply.
		const lying = makeStickerClient({
			stickerElement: {
				...storedSticker,
				animationLoopType: undefined,
				animationLoopIntensity: undefined,
			},
		});
		const badResult = await timelineApplyManifest(
			lying.client,
			makeOptions(stickerManifest)
		);
		expect(badResult.success).toBe(false);
		expect(badResult.error).toContain("animationLoopType");
		expect(lying.post).toHaveBeenCalledWith(
			"/api/claude/transaction/transaction-1/rollback",
			expect.anything()
		);

		const truthful = makeStickerClient({ stickerElement: storedSticker });
		const goodResult = await timelineApplyManifest(
			truthful.client,
			makeOptions(stickerManifest)
		);
		expect(goodResult.success).toBe(true);
	});
});
