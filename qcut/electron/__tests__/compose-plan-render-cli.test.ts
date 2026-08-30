import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	handleComposeRenderPatch,
	type ComposeEditorDependencies,
} from "../native-pipeline/cli/cli-handlers-compose-editor.js";
import { handleComposePlan } from "../native-pipeline/cli/cli-handlers-compose-plan.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	type ComposePatch,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import { CLIPipelineRunner } from "../native-pipeline/cli/cli-runner/runner.js";

let directory = "";
let snapshotPath = "";

function fixtureSnapshot(): ComposeSnapshot {
	const project = {
		id: "project-1",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 30,
	};
	const media = [
		{
			id: "media-1",
			kind: "video" as const,
			trackId: "track-video",
			elementId: "element-1",
			startTime: 0,
			duration: 20,
			trimStart: 0,
		},
	];
	const captions = [
		{ id: "caption-1", text: "hello there", startTime: 1, duration: 2 },
	];
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media,
			captions,
		}),
		project,
		media,
		captions,
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

function options(partial: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "compose",
		outputDir: directory,
		...partial,
	} as CLIRunOptions;
}

const noProgress = () => {};
const signal = new AbortController().signal;

beforeAll(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-compose-plan-"));
	snapshotPath = path.join(directory, "snapshot.json");
	fs.writeFileSync(snapshotPath, JSON.stringify(fixtureSnapshot()));
});

afterAll(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("compose plan handler", () => {
	it("passes compose providers through the full CLI runner", async () => {
		const outputPath = path.join(directory, "runner", "patch.json");
		const runner = new CLIPipelineRunner();
		const result = await runner.run(
			options({
				command: "compose-plan",
				snapshot: snapshotPath,
				provider: "local",
				output: outputPath,
			}),
			noProgress
		);

		expect(result.success).toBe(true);
		expect(fs.existsSync(outputPath)).toBe(true);
	});

	it("plans with the local provider and persists a secret-free job record", async () => {
		const outputPath = path.join(directory, "plans", "patch.json");
		const result = await handleComposePlan(
			options({
				snapshot: snapshotPath,
				provider: "local",
				output: outputPath,
			}),
			noProgress,
			signal
		);
		expect(result.success).toBe(true);
		const patch = JSON.parse(
			fs.readFileSync(outputPath, "utf-8")
		) as ComposePatch;
		expect(patch.snapshotId).toBe("snapshot-1");
		expect(patch.operations.length).toBeGreaterThan(0);

		const data = result.data as { jobPath: string };
		const jobRecord = fs.readFileSync(data.jobPath, "utf-8");
		expect(JSON.parse(jobRecord)).toMatchObject({
			provider: "local",
			status: "completed",
			snapshotId: "snapshot-1",
		});
		expect(jobRecord).not.toMatch(/api[-_]?key|bearer|authorization/i);
	});

	it("surfaces the structured error for unavailable providers", async () => {
		const result = await handleComposePlan(
			options({ snapshot: snapshotPath, provider: "fal" }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		const data = result.data as { job: { error?: { category: string } } };
		expect(data.job.error?.category).toBe("unsupported");
	});

	it("rejects unknown intents and providers", async () => {
		const badIntent = await handleComposePlan(
			options({ snapshot: snapshotPath, intent: '{"kind":"nope"}' }),
			noProgress,
			signal
		);
		expect(badIntent.success).toBe(false);
		expect(badIntent.error).toContain("intent");

		const badProvider = await handleComposePlan(
			options({ snapshot: snapshotPath, provider: "aws" }),
			noProgress,
			signal
		);
		expect(badProvider.success).toBe(false);
		expect(badProvider.error).toContain("provider");
	});
});

describe("compose render patch mode", () => {
	function renderFixtures() {
		const snapshot = fixtureSnapshot();
		const patch: ComposePatch = {
			schemaVersion: COMPOSE_PROTOCOL_VERSION,
			id: "patch-1",
			source: "local-heuristic",
			intentKind: "smart-packaging",
			mode: "idempotent",
			snapshotId: snapshot.id,
			sourceFingerprint: snapshot.sourceFingerprint,
			createdAt: "2026-08-30T00:01:00.000Z",
			operations: [
				{
					kind: "add-caption",
					id: "caption:1",
					text: "hello",
					language: "en",
					startTime: 1,
					duration: 2,
				},
			],
			warnings: [],
		};
		const patchPath = path.join(directory, "render-patch.json");
		fs.writeFileSync(patchPath, JSON.stringify(patch));
		return { patchPath };
	}

	function renderDependencies() {
		const pollJob = vi.fn(async () => ({ status: "completed" }));
		const post = vi.fn(async (route: string) => {
			if (route.includes("/export/")) return { jobId: "export-1" };
			throw new Error(`unexpected post: ${route}`);
		});
		const get = vi.fn(async () => ({ tracks: [] }));
		return {
			pollJob,
			dependencies: {
				createClient: vi.fn(() => ({ get, post, pollJob }) as never),
				capture: vi.fn(),
				applyManifest: vi.fn(async () => ({
					success: true,
					data: {
						elements: { "caption:1": "created-1" },
						transitionIds: [],
						verified: true,
					},
				})),
				resolveAssets: vi.fn(async () => ({ reports: [], issues: [] })),
				prepareAssets: vi.fn(async ({ patch }: { patch: unknown }) => ({
					patch,
					bindings: {},
					importedMediaIds: [],
				})),
				rollbackStickerMedia: vi.fn(async () => undefined),
				probeOutput: vi.fn(async () => ({
					duration: 20,
					width: 1920,
					height: 1080,
					frameRate: 30,
					hasVideo: true,
					hasAudio: true,
				})),
				verifyFrames: vi.fn(async () => ({
					verificationDir: path.join(directory, "frames"),
					frames: [],
				})),
			} as unknown as ComposeEditorDependencies,
		};
	}

	it("applies, exports, probes, and writes a linked render report", async () => {
		const { patchPath } = renderFixtures();
		const { dependencies } = renderDependencies();
		const outputPath = path.join(directory, "render.mp4");
		const result = await handleComposeRenderPatch(
			options({
				snapshot: snapshotPath,
				patch: patchPath,
				output: outputPath,
				verifyFrames: "0,3",
			}),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			kind: "qcut-compose-render-report-v1",
			snapshotId: "snapshot-1",
			patchId: "patch-1",
			appliedOperationIds: ["caption:1"],
			export: { jobId: "export-1" },
			probe: { width: 1920, hasAudio: true },
		});
		const reportPath = (result.data as { reportPath: string }).reportPath;
		expect(JSON.parse(fs.readFileSync(reportPath, "utf-8"))).toMatchObject({
			export: { jobId: "export-1" },
		});
	});

	it("rejects non-editor targets in patch mode", async () => {
		const { patchPath } = renderFixtures();
		const { dependencies } = renderDependencies();
		const result = await handleComposeRenderPatch(
			options({ snapshot: snapshotPath, patch: patchPath, target: "headless" }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--target editor");
	});
});
