// @vitest-environment node
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	handleComposeEditorProject,
	type ComposeEditorProjectDependencies,
} from "../native-pipeline/cli/cli-handlers-compose-project.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";

function fixtureSnapshot(): ComposeSnapshot {
	const project = {
		id: "project-created",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 0,
	};
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-31T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media: [],
			captions: [],
		}),
		project,
		media: [],
		captions: [],
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

function fixtureBuild() {
	const snapshot = fixtureSnapshot();
	return {
		manifest: {} as never,
		manifestSha256: "a".repeat(64),
		configDirectory: "/tmp",
		patch: {
			schemaVersion: COMPOSE_PROTOCOL_VERSION,
			id: "patch-1",
			source: "manifest-compiler" as const,
			intentKind: "full-compose" as const,
			mode: "idempotent" as const,
			snapshotId: snapshot.id,
			sourceFingerprint: snapshot.sourceFingerprint,
			createdAt: "2026-08-31T00:00:00.000Z",
			operations: (["clip:a", "clip:b"] as const).map((id, index) => ({
				kind: "insert-media-clip" as const,
				id,
				startTime: index * 10,
				duration: 10,
				asset: {
					provider: "local" as const,
					assetType: "media" as const,
					assetId: `manifest:${id}.mp4`,
					localPath: `/abs/${id}.mp4`,
				},
				mediaKind: "video" as const,
				trackRole: "main-video" as const,
				trimStart: 1,
				trimEnd: 1,
				sourceDuration: 12,
			})),
			warnings: [],
		},
		timelineDuration: 14.5,
		warnings: [],
	};
}

interface FakeClientCall {
	method: string;
	path: string;
	body?: unknown;
}

function makeDependencies({
	applyResult,
	liveElementIds = ["clip:a", "clip:b"],
	projects = [{ id: "project-created" }, { id: "project-other" }],
}: {
	applyResult?: { success: boolean; error?: string; data?: unknown };
	liveElementIds?: string[];
	projects?: Array<{ id: string }>;
} = {}) {
	const calls: FakeClientCall[] = [];
	const client = {
		post: vi.fn(async (path: string, body?: unknown) => {
			calls.push({ method: "post", path, body });
			if (path === "/api/claude/project/create") {
				return { projectId: "project-created" };
			}
			return {};
		}),
		get: vi.fn(async (path: string) => {
			calls.push({ method: "get", path });
			if (path === "/api/claude/navigator/projects") return projects;
			return {};
		}),
	};
	const dependencies: ComposeEditorProjectDependencies = {
		createClient: vi.fn(() => client as never),
		capture: vi.fn(async () => fixtureSnapshot()),
		build: vi.fn(async () => fixtureBuild()),
		apply: vi.fn(async () => {
			return (
				applyResult ?? {
					success: true,
					data: {
						applied: { "clip:a": "el-1", "clip:b": "el-2" },
						skipped: [],
						alreadyAppliedOperationIds: [],
					},
				}
			);
		}),
		ensureReady: vi.fn(async () => ({ ready: true }) as never),
		readTimeline: vi.fn(async () => ({
			elementIds: new Set(liveElementIds),
			transitionCuts: new Set<string>(),
			mainTrackId: "track-main",
		})),
	};
	return { dependencies, client, calls };
}

async function baseOptions(): Promise<CLIRunOptions> {
	const outputDir = await mkdtemp(join(tmpdir(), "compose-project-cli-"));
	return {
		config: "/tmp/edit.qcut-compose.json",
		name: "Compose Demo",
		outputDir,
		json: true,
		// Keeps the reopen poll loop short so the vanish test stays fast.
		timeoutMs: 1200,
	} as CLIRunOptions;
}

const noProgress = () => {};

describe("handleComposeEditorProject", () => {
	it("creates a project, applies the patch, and verifies the reopen", async () => {
		const { dependencies, calls } = makeDependencies();
		const result = await handleComposeEditorProject(
			await baseOptions(),
			noProgress,
			new AbortController().signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			projectId: "project-created",
			createdProject: true,
			timelineDuration: 14.5,
			reopen: { navigatedAway: true, missingElementIds: [] },
		});
		expect(dependencies.apply).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: "project-created" }),
			expect.any(Function),
			expect.any(AbortSignal)
		);
		// Away-and-back navigation proves the timeline persisted.
		const opens = calls.filter(
			(call) => call.path === "/api/claude/navigator/open"
		);
		expect(
			opens.map((call) => (call.body as { projectId: string }).projectId)
		).toEqual(["project-other", "project-created"]);
	});

	it("deletes a created project when apply fails and keeps the root cause", async () => {
		const { dependencies, calls } = makeDependencies({
			applyResult: { success: false, error: "boom from apply" },
		});
		const result = await handleComposeEditorProject(
			await baseOptions(),
			noProgress,
			new AbortController().signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/boom from apply/);
		expect(result.error).toMatch(/was deleted again/);
		expect(
			calls.some(
				(call) =>
					call.path === "/api/claude/project/delete" &&
					(call.body as { projectId: string }).projectId === "project-created"
			)
		).toBe(true);
	});

	it("treats skipped operations as failure", async () => {
		const { dependencies } = makeDependencies({
			applyResult: {
				success: true,
				data: {
					applied: {},
					skipped: [{ operationId: "clip:a", reason: "no path" }],
				},
			},
		});
		const result = await handleComposeEditorProject(
			await baseOptions(),
			noProgress,
			new AbortController().signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/skipped operations/);
	});

	it("fails verification when elements vanish after reopen", async () => {
		const { dependencies } = makeDependencies({ liveElementIds: ["clip:a"] });
		const result = await handleComposeEditorProject(
			await baseOptions(),
			noProgress,
			new AbortController().signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/disappeared after reopen/);
		expect(result.error).toMatch(/clip:b/);
	});

	it("rejects conflicting and missing target options", async () => {
		const { dependencies } = makeDependencies();
		const signal = new AbortController().signal;
		const options = await baseOptions();
		expect(
			(
				await handleComposeEditorProject(
					{ ...options, projectDir: "/tmp/x" },
					noProgress,
					signal,
					dependencies
				)
			).error
		).toMatch(/--project-dir/);
		expect(
			(
				await handleComposeEditorProject(
					{ ...options, projectId: "p2" },
					noProgress,
					signal,
					dependencies
				)
			).error
		).toMatch(/mutually exclusive/);
		expect(
			(
				await handleComposeEditorProject(
					{ ...options, name: undefined },
					noProgress,
					signal,
					dependencies
				)
			).error
		).toMatch(/--name to create/);
	});
});
