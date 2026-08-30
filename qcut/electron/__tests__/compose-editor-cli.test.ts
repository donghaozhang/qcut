import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleComposeValidate } from "../native-pipeline/cli/cli-handlers-compose.js";
import {
	handleComposeApply,
	handleComposeSnapshot,
	type ComposeEditorDependencies,
} from "../native-pipeline/cli/cli-handlers-compose-editor.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	type ComposePatch,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";

let directory = "";
let snapshotPath = "";
let patchPath = "";

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
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media,
			captions: [],
		}),
		project,
		media,
		captions: [],
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

function fixturePatch({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): ComposePatch {
	return {
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
			{
				kind: "update-media-zoom",
				id: "zoom:1",
				trackId: "track-video",
				elementId: "element-1",
				startTime: 4,
				duration: 2,
				fromScale: 1,
				toScale: 1.2,
			},
		],
		warnings: [],
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
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-compose-cli-"));
	const snapshot = fixtureSnapshot();
	snapshotPath = path.join(directory, "snapshot.json");
	patchPath = path.join(directory, "patch.json");
	fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
	fs.writeFileSync(patchPath, JSON.stringify(fixturePatch({ snapshot })));
});

afterAll(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("compose validate mode selection", () => {
	it("rejects mixing manifest mode with patch mode", async () => {
		const result = await handleComposeValidate(
			options({ config: "edit.json", snapshot: snapshotPath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("manifest mode");
	});

	it("requires both patch-mode inputs", async () => {
		const result = await handleComposeValidate(
			options({ snapshot: snapshotPath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--snapshot and --patch");
	});

	it("validates a patch against its snapshot", async () => {
		const result = await handleComposeValidate(
			options({ snapshot: snapshotPath, patch: patchPath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			mode: "patch",
			valid: true,
			operationCount: 2,
		});
	});

	it("fails on a stale snapshot fingerprint", async () => {
		const snapshot = fixtureSnapshot();
		const stale = {
			...fixturePatch({ snapshot }),
			sourceFingerprint: "0".repeat(64),
		};
		const stalePath = path.join(directory, "stale-patch.json");
		fs.writeFileSync(stalePath, JSON.stringify(stale));
		const result = await handleComposeValidate(
			options({ snapshot: snapshotPath, patch: stalePath }),
			noProgress,
			signal
		);
		expect(result.success).toBe(false);
		const issues = (result.data as { issues: Array<{ code: string }> }).issues;
		expect(issues.map(({ code }) => code)).toContain("snapshot-mismatch");
	});
});

describe("compose snapshot handler", () => {
	it("captures and writes the snapshot through injected dependencies", async () => {
		const snapshot = fixtureSnapshot();
		const dependencies: ComposeEditorDependencies = {
			createClient: vi.fn(() => ({}) as never),
			capture: vi.fn(async () => snapshot),
			applyManifest: vi.fn(),
		} as unknown as ComposeEditorDependencies;
		const outputPath = path.join(directory, "captured", "snapshot.json");
		const result = await handleComposeSnapshot(
			options({ output: outputPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			snapshotId: "snapshot-1",
			mediaCount: 1,
		});
		expect(JSON.parse(fs.readFileSync(outputPath, "utf-8"))).toMatchObject({
			id: "snapshot-1",
		});
	});
});

describe("compose apply handler", () => {
	it("validates, converts, applies, and maps operation ids to elements", async () => {
		const applyManifest = vi.fn(async (_client, opts: CLIRunOptions) => {
			const manifest = JSON.parse(opts.manifest ?? "{}");
			expect(manifest.projectId).toBe("project-1");
			return {
				success: true,
				data: {
					elements: { "caption:1": "created-element-1" },
					transitionIds: [],
					verified: true,
				},
			};
		});
		const dependencies = {
			createClient: vi.fn(() => ({}) as never),
			capture: vi.fn(),
			applyManifest,
			resolveAssets: vi.fn(async () => ({ reports: [], issues: [] })),
			materializeAssets: vi.fn(async ({ patch }: { patch: unknown }) => patch),
		} as unknown as ComposeEditorDependencies;
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: patchPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			applied: { "caption:1": "created-element-1" },
			verified: true,
		});
		const skipped = (result.data as { skipped: Array<{ operationId: string }> })
			.skipped;
		expect(skipped.map(({ operationId }) => operationId)).toEqual(["zoom:1"]);
	});

	it("refuses to apply a patch that fails validation", async () => {
		const snapshot = fixtureSnapshot();
		const broken = {
			...fixturePatch({ snapshot }),
			sourceFingerprint: "0".repeat(64),
		};
		const brokenPath = path.join(directory, "broken-patch.json");
		fs.writeFileSync(brokenPath, JSON.stringify(broken));
		const applyManifest = vi.fn();
		const dependencies = {
			createClient: vi.fn(() => ({}) as never),
			capture: vi.fn(),
			applyManifest,
			resolveAssets: vi.fn(async () => ({ reports: [], issues: [] })),
			materializeAssets: vi.fn(async ({ patch }: { patch: unknown }) => patch),
		} as unknown as ComposeEditorDependencies;
		const result = await handleComposeApply(
			options({ snapshot: snapshotPath, patch: brokenPath }),
			noProgress,
			signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(applyManifest).not.toHaveBeenCalled();
	});
});
