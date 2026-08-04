import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { getCommand } from "../native-pipeline/cli/command-registry.js";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import { handleInteropCommand } from "../native-pipeline/editor/editor-handlers-interop.js";
import {
	QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
	type QCutPersistedImportEvidenceSnapshot,
} from "../types/qcut-import-evidence-api.js";
import {
	QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	type QCutSameProfileWritebackResult,
} from "../types/qcut-same-profile-writeback-api.js";
import {
	BASE_URL,
	clearRoutes,
	installFetchMock,
	lastCapturedBody,
	makeOpts,
	mockRoute,
	originalFetch,
} from "./editor-cli-test-setup";

const BUNDLE_DIGEST = "b".repeat(64);
let temporaryDirectory = "";

function createSnapshot(): QCutPersistedImportEvidenceSnapshot {
	return {
		binding: {
			bundleDigest: BUNDLE_DIGEST,
			importId: "plan-token",
			profileId: "capcut-desktop-8.1-plaintext",
		},
		capture: {
			appVersion: "test",
			capturedAtIso: "2026-08-05T01:02:03.000Z",
			readPasses: 2,
			source: "qcut-renderer-persisted-storage",
		},
		media: [],
		project: {
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Imported Project",
			sceneId: "scene-1",
			width: 1920,
		},
		schema: QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
		schemaVersion: 1,
		tracks: [],
	};
}

describe("interop import snapshot CLI", () => {
	let client: EditorApiClient;

	beforeAll(async () => {
		installFetchMock(BASE_URL);
		client = new EditorApiClient({ baseUrl: BASE_URL });
		temporaryDirectory = await mkdtemp(join(tmpdir(), "qcut-interop-cli-"));
	});

	afterEach(() => clearRoutes());
	afterAll(async () => {
		globalThis.fetch = originalFetch;
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("registers and parses the nested command", () => {
		expect(getCommand("editor:interop:import-snapshot")).toBeDefined();
		expect(
			parseCliArgs([
				"editor",
				"interop",
				"import-snapshot",
				"--project-id",
				"project-1",
				"--bundle-digest",
				BUNDLE_DIGEST,
				"--output",
				"snapshot.json",
			])
		).toMatchObject({
			command: "editor:interop:import-snapshot",
			projectId: "project-1",
			bundleDigest: BUNDLE_DIGEST,
			output: "snapshot.json",
		});
		expect(getCommand("editor:interop:writeback")).toBeDefined();
		expect(
			parseCliArgs([
				"editor",
				"interop",
				"writeback",
				"--project-id",
				"project-1",
			])
		).toMatchObject({
			command: "editor:interop:writeback",
			projectId: "project-1",
		});
		expect(getCommand("editor:interop:writeback-recover")).toBeDefined();
		expect(
			parseCliArgs([
				"editor",
				"interop",
				"writeback-recover",
				"--recovery-token",
				"selection-1",
			])
		).toMatchObject({
			command: "editor:interop:writeback-recover",
			recoveryToken: "selection-1",
		});
	});

	it("writes through the pathless same-profile endpoint", async () => {
		const written: QCutSameProfileWritebackResult = {
			contentSha256: "c".repeat(64),
			operation: "writeback",
			outcome: "written",
			projectId: "project-1",
			replacedMirrorCount: 4,
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
			transactionId: "transaction-1",
			warnings: [],
		};
		mockRoute("POST", "/api/claude/interop/writeback", {
			success: true,
			data: written,
		});

		const result = await handleInteropCommand({
			client,
			options: makeOpts({
				command: "editor:interop:writeback",
				projectId: "project-1",
			}),
		});

		expect(result).toEqual({ data: written, success: true });
		expect(JSON.parse(lastCapturedBody ?? "{}")).toEqual({
			action: "writeback",
			projectId: "project-1",
		});
		expect(JSON.stringify(result)).not.toContain("draftDirectory");
	});

	it("returns a blocked profile gate as a failed CLI command", async () => {
		const blocked: QCutSameProfileWritebackResult = {
			issues: [],
			message: "Exact CapCut 8.1 verification is required.",
			operation: "writeback",
			outcome: "blocked",
			projectId: "project-1",
			reason: "writeback-not-ready",
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
		};
		mockRoute("POST", "/api/claude/interop/writeback", {
			success: true,
			data: blocked,
		});

		expect(
			await handleInteropCommand({
				client,
				options: makeOpts({
					command: "editor:interop:writeback",
					projectId: "project-1",
				}),
			})
		).toEqual({
			data: blocked,
			error: blocked.message,
			success: false,
		});
	});

	it("recovers only through an opaque token", async () => {
		const recovered: QCutSameProfileWritebackResult = {
			operation: "recover",
			outcome: "recovered",
			recoveryAction: "rolled-back",
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
			transactionId: "transaction-1",
			warnings: [],
		};
		mockRoute("POST", "/api/claude/interop/writeback", {
			success: true,
			data: recovered,
		});

		const result = await handleInteropCommand({
			client,
			options: makeOpts({
				command: "editor:interop:writeback-recover",
				recoveryToken: "selection-1",
			}),
		});

		expect(result).toEqual({ data: recovered, success: true });
		expect(JSON.parse(lastCapturedBody ?? "{}")).toEqual({
			action: "recover",
			recoveryToken: "selection-1",
		});
	});

	it("rejects an invalid recovery token before contacting the editor", async () => {
		const result = await handleInteropCommand({
			client,
			options: makeOpts({
				command: "editor:interop:writeback-recover",
				recoveryToken: "",
			}),
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("bounded non-empty token");
	});

	it("captures and exclusively writes trusted persisted evidence", async () => {
		mockRoute("POST", "/api/claude/interop/import-snapshot", {
			success: true,
			data: createSnapshot(),
		});
		const output = join(temporaryDirectory, "snapshot.json");
		const options = makeOpts({
			command: "editor:interop:import-snapshot",
			projectId: "project-1",
			bundleDigest: BUNDLE_DIGEST,
			output,
		});
		const result = await handleInteropCommand({ client, options });

		expect(result.success).toBe(true);
		expect(JSON.parse(lastCapturedBody ?? "{}")).toEqual({
			expectedBundleDigest: BUNDLE_DIGEST,
			projectId: "project-1",
		});
		expect(JSON.parse(await readFile(output, "utf8"))).toEqual(
			createSnapshot()
		);

		await expect(handleInteropCommand({ client, options })).rejects.toThrow(
			"EEXIST"
		);
	});

	it("rejects invalid digests before contacting the editor", async () => {
		const result = await handleInteropCommand({
			client,
			options: makeOpts({
				command: "editor:interop:import-snapshot",
				projectId: "project-1",
				bundleDigest: "not-a-digest",
			}),
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("SHA-256");
	});

	it("does not overwrite an existing output before a capture", async () => {
		const output = join(temporaryDirectory, "existing.json");
		await writeFile(output, "keep");
		mockRoute("POST", "/api/claude/interop/import-snapshot", {
			success: true,
			data: createSnapshot(),
		});

		await expect(
			handleInteropCommand({
				client,
				options: makeOpts({
					command: "editor:interop:import-snapshot",
					projectId: "project-1",
					bundleDigest: BUNDLE_DIGEST,
					output,
				}),
			})
		).rejects.toThrow("EEXIST");
		expect(await readFile(output, "utf8")).toBe("keep");
	});
});
