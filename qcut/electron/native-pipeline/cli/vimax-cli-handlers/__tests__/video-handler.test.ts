/**
 * @vitest-environment node
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CLIRunOptions } from "../../cli-runner/types.js";
import { handleVimaxNovel2Video } from "../video-handler.js";
import {
	resolveProjectPaths,
	safeProjectSlug,
	shotVideoPath,
	videoRegistryPath,
} from "../../../output/project-paths.js";
import type { ApiCallResult } from "../../../infra/api-caller.js";

// Route all project-paths writes to a throwaway dir per test.
let sandboxRoot: string;
let slug: string;

beforeEach(() => {
	sandboxRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "qcut-video-handler-test-")
	);
	process.env.QCUT_PROJECTS_DIR = sandboxRoot;
	slug = `proj-${Date.now()}`;
});

afterEach(() => {
	delete process.env.QCUT_PROJECTS_DIR;
	vi.restoreAllMocks();
});

/** Build a minimal fake project on disk under the test sandbox. */
function seedProject(
	options: {
		shots: Array<{ shotId: string; characters?: string[]; description?: string }>;
		portraits?: Record<string, { bytes?: Uint8Array }>;
	}
): { slug: string; paths: ReturnType<typeof resolveProjectPaths> } {
	const normalized = safeProjectSlug(slug);
	const paths = resolveProjectPaths(normalized);
	fs.mkdirSync(paths.scriptsDir, { recursive: true });
	fs.mkdirSync(paths.portraitsDir, { recursive: true });

	// Write one chunk containing all shots.
	const chunk = {
		scenes: [
			{
				title: "test",
				shots: options.shots.map((s) => ({
					shot_id: s.shotId,
					description: s.description ?? `shot ${s.shotId}`,
					characters: s.characters ?? [],
					duration_seconds: 5,
				})),
			},
		],
	};
	fs.writeFileSync(
		path.join(paths.scriptsDir, "chunk_001.json"),
		JSON.stringify(chunk, null, 2)
	);

	// Seed portraits if provided.
	if (options.portraits) {
		const registry: Record<string, { character_name: string; front_view: string }> =
			{};
		for (const [name, spec] of Object.entries(options.portraits)) {
			const charDir = path.join(paths.portraitsDir, name);
			fs.mkdirSync(charDir, { recursive: true });
			const p = path.join(charDir, "front.png");
			fs.writeFileSync(p, spec.bytes ?? new Uint8Array([1, 2, 3, 4]));
			registry[name] = { character_name: name, front_view: p };
		}
		fs.writeFileSync(
			paths.portraitRegistryPath,
			JSON.stringify(
				{ project_id: normalized, portraits: registry },
				null,
				2
			)
		);
	}

	return { slug: normalized, paths };
}

function makeUploadStub() {
	return vi.fn(async ({ filePath }: { filePath: string }) => ({
		url: `https://upload.example/${path.basename(filePath)}`,
		contentType: "image/png",
		bytes: 4,
	}));
}

function makeApiStub(
	factory: (call: {
		endpoint: string;
		modelKey?: string;
		payload: Record<string, unknown>;
	}) => ApiCallResult | Promise<ApiCallResult>
) {
	return vi.fn(async (call: {
		endpoint: string;
		modelKey?: string;
		payload: Record<string, unknown>;
	}) => factory(call));
}

function makeDownloadStub() {
	return vi.fn(async (url: string, outputPath: string) => {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, `fake mp4 bytes from ${url}`);
		return outputPath;
	});
}

function baseOptions(slugValue: string): CLIRunOptions {
	return {
		command: "vimax:novel2video",
		projectId: slugValue,
	} as unknown as CLIRunOptions;
}

const noProgress = () => {};

describe("handleVimaxNovel2Video", () => {
	it("happy path: 2 shots with catalogued characters → ref2v", async () => {
		const { slug: s, paths } = seedProject({
			shots: [
				{ shotId: "1-1-1", characters: ["Alice"] },
				{ shotId: "1-1-2", characters: ["Alice", "Bob"] },
			],
			portraits: {
				Alice: {},
				Bob: {},
			},
		});

		const upload = makeUploadStub();
		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));
		const download = makeDownloadStub();

		const result = await handleVimaxNovel2Video(
			{ ...baseOptions(s), duration: "5" } as CLIRunOptions,
			noProgress,
			undefined,
			{ uploadImpl: upload, callModelApiImpl: api, downloadOutputImpl: download }
		);

		expect(result.success).toBe(true);
		expect(api).toHaveBeenCalledTimes(2);
		expect(download).toHaveBeenCalledTimes(2);
		expect(upload).toHaveBeenCalledTimes(2); // 2 portraits

		// Both calls used ref2v variant
		for (const call of api.mock.calls) {
			expect(call[0].modelKey).toBe("gmi_seedance_2_0_260128_ref2v");
			expect(call[0].payload.reference_images).toBeDefined();
		}

		// MP4s landed
		expect(fs.existsSync(shotVideoPath(paths, "1-1-1"))).toBe(true);
		expect(fs.existsSync(shotVideoPath(paths, "1-1-2"))).toBe(true);

		// Registry has 2 success entries
		const registry = JSON.parse(fs.readFileSync(videoRegistryPath(paths), "utf-8"));
		expect(registry.shots).toHaveLength(2);
		expect(registry.shots[0].status).toBe("success");
		expect(registry.shots[0].variant).toBe("gmi_seedance_2_0_260128_ref2v");

		// project.json.stages_completed contains 'videos'
		const metadata = JSON.parse(fs.readFileSync(paths.metadataPath, "utf-8"));
		expect(metadata.stages_completed).toContain("videos");
	});

	it("mixed variants: 1 ref2v + 1 t2v fallback", async () => {
		const { slug: s } = seedProject({
			shots: [
				{ shotId: "a", characters: ["Alice"] },
				{ shotId: "b", characters: ["Ghost"] }, // uncatalogued
			],
			portraits: { Alice: {} },
		});

		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);

		const variants = api.mock.calls.map((c) => c[0].modelKey).sort();
		expect(variants).toEqual([
			"gmi_seedance_2_0_260128_ref2v",
			"gmi_seedance_2_0_260128_t2v",
		]);
	});

	it("no portraits directory → all shots degrade to t2v, no uploads", async () => {
		const { slug: s } = seedProject({
			shots: [
				{ shotId: "a", characters: ["Alice"] },
				{ shotId: "b", characters: ["Bob"] },
			],
			// no portraits: omitted
		});

		const upload = makeUploadStub();
		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		const result = await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{ uploadImpl: upload, callModelApiImpl: api, downloadOutputImpl: makeDownloadStub() }
		);

		expect(result.success).toBe(true);
		expect(upload).not.toHaveBeenCalled();
		for (const call of api.mock.calls) {
			expect(call[0].modelKey).toBe("gmi_seedance_2_0_260128_t2v");
			expect(call[0].payload.reference_images).toBeUndefined();
		}
	});

	it("idempotent skip: pre-existing mp4 is not regenerated", async () => {
		const { slug: s, paths } = seedProject({
			shots: [
				{ shotId: "a" },
				{ shotId: "b" },
			],
		});
		fs.mkdirSync(paths.videosDir, { recursive: true });
		fs.writeFileSync(shotVideoPath(paths, "a"), "prior");

		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		// Only 'b' is regenerated
		expect(api).toHaveBeenCalledTimes(1);
		// Pre-existing file still has original content
		expect(fs.readFileSync(shotVideoPath(paths, "a"), "utf-8")).toBe("prior");
	});

	it("--force overwrites existing mp4s", async () => {
		const { slug: s, paths } = seedProject({ shots: [{ shotId: "a" }] });
		fs.mkdirSync(paths.videosDir, { recursive: true });
		fs.writeFileSync(shotVideoPath(paths, "a"), "prior");

		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		await handleVimaxNovel2Video(
			{ ...baseOptions(s), force: true } as CLIRunOptions,
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(api).toHaveBeenCalledTimes(1);
		expect(fs.readFileSync(shotVideoPath(paths, "a"), "utf-8")).toContain(
			"fake mp4 bytes"
		);
	});

	it("--max-shots caps the run", async () => {
		const { slug: s } = seedProject({
			shots: [
				{ shotId: "a" },
				{ shotId: "b" },
				{ shotId: "c" },
				{ shotId: "d" },
				{ shotId: "e" },
			],
		});

		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		await handleVimaxNovel2Video(
			{ ...baseOptions(s), maxShots: 2 } as CLIRunOptions,
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(api).toHaveBeenCalledTimes(2);
	});

	it("cost gate blocks runs above the ceiling", async () => {
		// 50 shots × 5s × $0.052 = $13, well above the $2 default.
		const shotList = Array.from({ length: 50 }, (_, i) => ({
			shotId: `s-${i}`,
		}));
		const { slug: s } = seedProject({ shots: shotList });

		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		const result = await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/cost/i);
		expect(api).not.toHaveBeenCalled();
	});

	it("--force bypasses cost gate", async () => {
		const shotList = Array.from({ length: 50 }, (_, i) => ({ shotId: `s-${i}` }));
		const { slug: s } = seedProject({ shots: shotList });
		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));
		const result = await handleVimaxNovel2Video(
			{ ...baseOptions(s), force: true, maxShots: 3 } as CLIRunOptions,
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(result.success).toBe(true);
		expect(api).toHaveBeenCalledTimes(3);
	});

	it("per-shot failure is non-fatal — run continues", async () => {
		const { slug: s, paths } = seedProject({
			shots: [
				{ shotId: "a" },
				{ shotId: "b" },
				{ shotId: "c" },
			],
		});
		let callIndex = 0;
		const api = makeApiStub(() => {
			const index = callIndex++;
			if (index === 1) {
				return { success: false, error: "provider explosion", duration: 0 };
			}
			return {
				success: true,
				outputUrl: "https://cdn.example/out.mp4",
				duration: 1,
				cost: 0.26,
			};
		});

		const result = await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(result.success).toBe(true);
		expect(result.data?.shots_failed).toBe(1);

		const registry = JSON.parse(fs.readFileSync(videoRegistryPath(paths), "utf-8"));
		const statuses = registry.shots.map((e: { status: string }) => e.status);
		expect(statuses).toEqual(["success", "failed", "success"]);
	});

	it("missing --project → clean error, no fs writes", async () => {
		const result = await handleVimaxNovel2Video(
			{ command: "vimax:novel2video" } as CLIRunOptions,
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: makeApiStub(() => ({
					success: true,
					outputUrl: "x",
					duration: 1,
				})),
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/project/i);
	});

	it("missing scripts/ → clean error", async () => {
		// Don't seed any scripts.
		const normalized = safeProjectSlug(slug);
		const paths = resolveProjectPaths(normalized);
		fs.mkdirSync(paths.root, { recursive: true });

		const result = await handleVimaxNovel2Video(
			baseOptions(normalized),
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: makeApiStub(() => ({
					success: true,
					outputUrl: "x",
					duration: 1,
				})),
				downloadOutputImpl: makeDownloadStub(),
			}
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/scripts/i);
	});

	it("portrait upload failure → that character treated as uncatalogued", async () => {
		const { slug: s } = seedProject({
			shots: [{ shotId: "a", characters: ["Alice"] }],
			portraits: { Alice: {} },
		});
		const upload = vi.fn(async () => {
			throw new Error("upload went boom");
		});
		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));

		const result = await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{
				uploadImpl: upload as unknown as typeof import("../../../output/upload-helper.js").uploadFileForReference,
				callModelApiImpl: api,
				downloadOutputImpl: makeDownloadStub(),
			}
		);

		expect(result.success).toBe(true);
		// No references present → t2v
		expect(api.mock.calls[0][0].modelKey).toBe("gmi_seedance_2_0_260128_t2v");
	});

	it("download failure is non-fatal and recorded in registry", async () => {
		const { slug: s, paths } = seedProject({ shots: [{ shotId: "a" }] });
		const api = makeApiStub(() => ({
			success: true,
			outputUrl: "https://cdn.example/out.mp4",
			duration: 1,
			cost: 0.26,
		}));
		const download = vi.fn(async () => {
			throw new Error("network down");
		});

		const result = await handleVimaxNovel2Video(
			baseOptions(s),
			noProgress,
			undefined,
			{
				uploadImpl: makeUploadStub(),
				callModelApiImpl: api,
				downloadOutputImpl: download as unknown as typeof import("../../../infra/api-caller.js").downloadOutput,
			}
		);
		expect(result.success).toBe(false);
		const registry = JSON.parse(fs.readFileSync(videoRegistryPath(paths), "utf-8"));
		expect(registry.shots[0].status).toBe("failed");
		expect(registry.shots[0].error).toMatch(/download/i);
	});
});
