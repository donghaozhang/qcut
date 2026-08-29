/**
 * Pins the export-start route guard: the renderer can only snapshot the
 * currently open project, so POST /api/claude/export/:projectId/start must
 * refuse a projectId that does not match the snapshot instead of silently
 * exporting the wrong timeline.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => tmpdir()),
		getVersion: vi.fn(() => "0.0.1-test"),
		isPackaged: false,
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		removeListener: vi.fn(),
	},
	BrowserWindow: {
		getAllWindows: vi.fn(() => []),
	},
}));

vi.mock("../claude/handlers/claude-export-handler.js", async (original) => ({
	...(await original<Record<string, unknown>>()),
	startExportJob: vi.fn(async () => ({
		jobId: "test-job",
		status: "queued",
	})),
	startRendererExportJob: vi.fn(async () => ({
		jobId: "renderer-test-job",
		status: "queued",
	})),
}));

vi.mock("../claude/handlers/claude-media-handler.js", async (original) => ({
	...(await original<Record<string, unknown>>()),
	listMediaFiles: vi.fn(async () => []),
}));

import {
	registerSharedRoutes,
	type WindowAccessor,
} from "../claude/http/claude-http-shared-routes";
import type { Router } from "../claude/utils/http-router";
import type { ClaudeTimeline } from "../types/claude-api";
import {
	startExportJob,
	startRendererExportJob,
} from "../claude/handlers/claude-export-handler.js";
import { listMediaFiles } from "../claude/handlers/claude-media-handler.js";

const restrictedMetadata = {
	animatedSticker: true,
	batchId: "jianying-2026-08-23-batch-18-v2",
	checksumSha256: "a".repeat(64),
	itemId: "18001",
	redistribution: "prohibited" as const,
	referenceOnly: true as const,
	source: "sticker-lab" as const,
	usage: "internal-reference-only" as const,
};

type RouteHandler = (req: {
	params: Record<string, string>;
	query: Record<string, string>;
	body?: unknown;
}) => Promise<unknown>;

function buildRouterHarness(): {
	router: Router;
	getHandler: (method: string, path: string) => RouteHandler;
} {
	const handlers = new Map<string, RouteHandler>();
	const record = (method: string) => (path: string, handler: RouteHandler) => {
		handlers.set(`${method} ${path}`, handler);
	};
	const router = {
		get: record("GET"),
		post: record("POST"),
		patch: record("PATCH"),
		delete: record("DELETE"),
		handle: () => {},
	} as unknown as Router;
	return {
		router,
		getHandler: (method, path) => {
			const handler = handlers.get(`${method} ${path}`);
			if (!handler) throw new Error(`Route not registered: ${method} ${path}`);
			return handler;
		},
	};
}

function buildAccessor(timeline: ClaudeTimeline): WindowAccessor {
	return new Proxy({} as WindowAccessor, {
		get(target, property) {
			const override = Reflect.get(target, property);
			if (override !== undefined) return override;
			if (property === "requestTimeline") {
				return async () => timeline;
			}
			if (property === "requestStateSnapshot") {
				return async () => ({
					version: 1,
					timestamp: Date.now(),
					state: { media: { items: [] } },
				});
			}
			if (property === "getAppVersion") {
				return () => "0.0.1-test";
			}
			if (property === "getWindow") {
				return () => ({ webContents: { send: () => {} } });
			}
			return vi.fn(async () => ({}));
		},
	});
}

function buildTimeline(projectId?: string): ClaudeTimeline {
	return {
		name: "Guard test",
		duration: 1,
		width: 1920,
		height: 1080,
		fps: 30,
		tracks: [],
		projectId,
	};
}

const EXPORT_START = "POST /api/claude/export/:projectId/start";

describe("export start project guard", () => {
	beforeEach(() => {
		vi.mocked(startExportJob).mockClear();
		vi.mocked(startRendererExportJob).mockClear();
		vi.mocked(listMediaFiles).mockReset().mockResolvedValue([]);
	});

	it("rejects a projectId that is not the open project with 409", async () => {
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, buildAccessor(buildTimeline("project-a")));
		const [method, path] = EXPORT_START.split(" ");
		await expect(
			getHandler(
				method,
				path
			)({
				params: { projectId: "project-b" },
				query: {},
				body: {},
			})
		).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining("not open"),
		});
		expect(startExportJob).not.toHaveBeenCalled();
	});

	it("starts the export when the projectId matches the open project", async () => {
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, buildAccessor(buildTimeline("project-a")));
		const [method, path] = EXPORT_START.split(" ");
		const result = await getHandler(
			method,
			path
		)({
			params: { projectId: "project-a" },
			query: {},
			body: {},
		});
		expect(result).toMatchObject({ jobId: "test-job" });
		expect(startExportJob).toHaveBeenCalledTimes(1);
		expect(startRendererExportJob).not.toHaveBeenCalled();
	});

	it("routes runtime stickers through the live renderer instead of native FFmpeg", async () => {
		vi.mocked(listMediaFiles).mockResolvedValue([
			{
				createdAt: 1,
				id: "actual-runtime-media",
				modifiedAt: 2,
				name: "cached-runtime.gif",
				path: "/tmp/cached-runtime.gif",
				size: 100,
				type: "image",
			},
			{
				createdAt: 1,
				id: "actual-runtime-resource",
				modifiedAt: 2,
				name: "atlas.png",
				path: "/tmp/atlas.png",
				size: 100,
				type: "image",
			},
		]);
		const timeline: ClaudeTimeline = {
			...buildTimeline("project-a"),
			duration: 1,
			tracks: [
				{
					elements: [
						{
							duration: 1,
							endTime: 1,
							id: "runtime-sticker",
							mediaId: "stale-runtime-media",
							sourceName: "cached-runtime.gif",
							startTime: 0,
							trackIndex: 0,
							type: "sticker",
						},
					],
					index: 0,
					name: "Runtime stickers",
					type: "sticker",
				},
			],
		};
		const accessor = buildAccessor(timeline);
		accessor.requestLocalVideoExport = vi.fn(async () => {});
		accessor.requestStateSnapshot = vi.fn(async () => ({
			state: {
				media: {
					items: [
						{
							id: "actual-runtime-media",
							localPath: "",
							metadata: {
								...restrictedMetadata,
								stickerRuntime: { kind: "direct-gif" },
								stickerRuntimeResources: {
									atlas: "actual-runtime-resource",
								},
							},
							name: "cached-runtime.gif",
							type: "image",
						},
						{
							id: "actual-runtime-resource",
							localPath: "",
							metadata: {
								...restrictedMetadata,
								source: "sticker-runtime-resource",
								stickerAssetId:
									"sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
								stickerAssetVersion: 1,
								stickerRuntimeResourceName: "atlas.png",
								stickerRuntimeSourceUrl: "https://example.invalid/atlas.png",
							},
							name: "atlas.png",
							type: "image",
						},
					],
				},
			},
			timestamp: Date.now(),
			version: 1,
		}));
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, accessor);
		const [method, path] = EXPORT_START.split(" ");

		const result = await getHandler(
			method,
			path
		)({
			params: { projectId: "project-a" },
			query: {},
			body: { outputPath: "/tmp/runtime-export.mp4" },
		});

		expect(result).toMatchObject({ jobId: "renderer-test-job" });
		expect(startRendererExportJob).toHaveBeenCalledWith(
			expect.objectContaining({
				dispatch: accessor.requestLocalVideoExport,
				mediaFiles: expect.arrayContaining([
					expect.objectContaining({
						id: "actual-runtime-media",
						metadata: expect.objectContaining({
							stickerRuntime: { kind: "direct-gif" },
							stickerRuntimeResources: {
								atlas: "actual-runtime-resource",
							},
						}),
					}),
					expect.objectContaining({
						id: "actual-runtime-resource",
						metadata: expect.objectContaining({
							source: "sticker-runtime-resource",
							stickerRuntimeResourceName: "atlas.png",
						}),
					}),
				]),
				projectId: "project-a",
			})
		);
		expect(startExportJob).not.toHaveBeenCalled();
	});

	it("fails closed when the snapshot has no projectId", async () => {
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, buildAccessor(buildTimeline(undefined)));
		const [method, path] = EXPORT_START.split(" ");
		await expect(
			getHandler(
				method,
				path
			)({
				params: { projectId: "project-b" },
				query: {},
				body: {},
			})
		).rejects.toMatchObject({
			message: expect.stringContaining("did not identify its project"),
			status: 409,
		});
		expect(startExportJob).not.toHaveBeenCalled();
		expect(startRendererExportJob).not.toHaveBeenCalled();
	});

	it("fails closed when renderer media metadata cannot be verified", async () => {
		const { router, getHandler } = buildRouterHarness();
		const accessor = buildAccessor(buildTimeline("project-a"));
		accessor.requestStateSnapshot = vi.fn(async () => {
			throw new Error("renderer unavailable");
		});
		registerSharedRoutes(router, accessor);
		const [method, path] = EXPORT_START.split(" ");

		await expect(
			getHandler(
				method,
				path
			)({
				params: { projectId: "project-a" },
				query: {},
				body: {},
			})
		).rejects.toMatchObject({
			status: 503,
			message: expect.stringContaining("restricted media cannot be verified"),
		});
		expect(startExportJob).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "empty", localPath: "" },
		{ label: "stale", localPath: "stale-relative-path.png" },
	])("preserves restricted metadata when the renderer localPath is $label", async ({
		localPath,
	}) => {
		const diskMedia = {
			createdAt: 1,
			id: "disk-sticker",
			modifiedAt: 2,
			name: "restricted-sticker.png",
			path: "/tmp/restricted-sticker.png",
			size: 100,
			type: "image" as const,
		};
		vi.mocked(listMediaFiles).mockResolvedValue([diskMedia]);
		const timeline: ClaudeTimeline = {
			...buildTimeline("project-a"),
			duration: 5,
			tracks: [
				{
					elements: [
						{
							duration: 5,
							endTime: 5,
							id: "sticker-element",
							mediaId: "renderer-sticker",
							sourceName: "restricted-sticker.png",
							startTime: 0,
							trackIndex: 0,
							type: "sticker",
						},
					],
					index: 0,
					name: "Stickers",
					type: "sticker",
				},
			],
		};
		const accessor = buildAccessor(timeline);
		accessor.requestLocalVideoExport = vi.fn(async () => {});
		accessor.requestStateSnapshot = vi.fn(async () => ({
			state: {
				media: {
					items: [
						{
							id: "renderer-sticker",
							localPath,
							metadata: restrictedMetadata,
							name: "restricted-sticker.png",
							type: "image" as const,
						},
					],
				},
			},
			timestamp: Date.now(),
			version: 1,
		}));
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, accessor);
		const [method, path] = EXPORT_START.split(" ");

		await getHandler(
			method,
			path
		)({
			params: { projectId: "project-a" },
			query: {},
			body: {},
		});

		const [{ mediaFiles }] = vi.mocked(startRendererExportJob).mock.calls[0];
		expect(mediaFiles).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "renderer-sticker",
					metadata: restrictedMetadata,
					path: diskMedia.path,
				}),
				expect.objectContaining({
					id: "disk-sticker",
					metadata: restrictedMetadata,
				}),
			])
		);
		expect(startExportJob).not.toHaveBeenCalled();
	});

	it("routes a stale-name pathless static Sticker Lab sticker through the renderer", async () => {
		const timeline: ClaudeTimeline = {
			...buildTimeline("project-a"),
			duration: 5,
			tracks: [
				{
					elements: [
						{
							duration: 5,
							endTime: 5,
							id: "static-sticker-element",
							mediaId: "stale-static-sticker-id",
							sourceName: "indexeddb-static-sticker.png",
							startTime: 0,
							stickerId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
							trackIndex: 0,
							type: "sticker",
						},
					],
					index: 0,
					name: "Stickers",
					type: "sticker",
				},
			],
		};
		const accessor = buildAccessor(timeline);
		accessor.requestLocalVideoExport = vi.fn(async () => {});
		accessor.requestStateSnapshot = vi.fn(async () => ({
			state: {
				media: {
					items: [
						{
							id: "indexeddb-static-sticker",
							localPath: "",
							metadata: {
								...restrictedMetadata,
								animatedSticker: false,
							},
							name: "indexeddb-static-sticker.png",
							type: "image" as const,
						},
					],
				},
			},
			timestamp: Date.now(),
			version: 1,
		}));
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, accessor);
		const [method, path] = EXPORT_START.split(" ");

		await getHandler(
			method,
			path
		)({
			params: { projectId: "project-a" },
			query: {},
			body: { outputPath: "/tmp/pathless-static.mp4" },
		});

		expect(startRendererExportJob).toHaveBeenCalledWith(
			expect.objectContaining({
				dispatch: accessor.requestLocalVideoExport,
				mediaFiles: expect.arrayContaining([
					expect.objectContaining({
						id: "indexeddb-static-sticker",
						path: "",
					}),
				]),
			})
		);
		expect(startExportJob).not.toHaveBeenCalled();
	});
});
