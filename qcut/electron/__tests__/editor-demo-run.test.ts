import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	resolveDemoExportPath,
	runEditorDemo,
} from "../native-pipeline/cli/editor-demo-run.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";

let tempDir = "";

afterEach(() => {
	if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	tempDir = "";
});

describe("editor demo run", () => {
	it("resolves relative export paths next to the plan", () => {
		const planDirectory = join(tmpdir(), "portable-demo");
		const planPath = join(planDirectory, "promo.json");
		const absoluteExportPath = join(tmpdir(), "final.mp4");

		expect(
			resolveDemoExportPath({
				planPath,
				plannedPath: "promo-final.mp4",
			})
		).toBe(join(planDirectory, "promo-final.mp4"));
		expect(
			resolveDemoExportPath({
				planPath,
				plannedPath: absoluteExportPath,
			})
		).toBe(absoluteExportPath);
		expect(resolveDemoExportPath({ planPath })).toBe(
			join(planDirectory, "promo-export.mp4")
		);
	});

	it("prepares the active project, skips idle actions, and writes an event track", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "qcut-demo-"));
		const planPath = join(tempDir, "promo.json");
		const eventTrack = join(tempDir, "promo.pointer.json");
		writeFileSync(
			planPath,
			JSON.stringify({
				name: "Promo",
				actions: [{ action: "sleep", durationMs: 30_000 }],
				export: false,
			})
		);
		const get = vi.fn(async (url: string) => {
			if (url === "/api/claude/navigator/projects") {
				return { activeProjectId: "promo-project" };
			}
			if (url === "/api/claude/media/promo-project") return [];
			if (url === "/api/claude/timeline/promo-project") return { tracks: [] };
			throw new Error(`Unexpected GET ${url}`);
		});
		const client = {
			get,
			post: vi.fn(async (url: string) => {
				if (url === "/api/claude/navigator/open") {
					return { navigated: true, projectId: "promo-project" };
				}
				throw new Error(`Unexpected POST ${url}`);
			}),
			requireCapability: vi.fn(),
		} as unknown as EditorApiClient;
		const options: CLIRunOptions = {
			command: "editor:demo:run",
			plan: planPath,
			eventTrack,
			speed: 1.5,
			skipIdle: true,
			outputDir: "./output",
			saveIntermediates: false,
			json: true,
			verbose: false,
			quiet: false,
		};

		const result = await runEditorDemo({
			client,
			options,
			onProgress: vi.fn(),
		});

		expect(result.success).toBe(true);
		expect(options.projectId).toBe("promo-project");
		const track = JSON.parse(readFileSync(eventTrack, "utf8"));
		expect(track.speed).toBe(1.5);
		expect(track.skipIdle).toBe(true);
		expect(track.events[0]).toEqual(
			expect.objectContaining({ action: "sleep", skipped: true })
		);
	});

	it("runs a relative V2 capture plan and verifies the recording artifact", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "qcut-demo-v2-"));
		const planPath = join(tempDir, "promo.json");
		const actionsPath = join(tempDir, "actions.json");
		const recordingPath = join(tempDir, "capture.mp4");
		writeFileSync(
			actionsPath,
			JSON.stringify([{ action: "sleep", durationMs: 0 }])
		);
		writeFileSync(
			planPath,
			JSON.stringify({
				version: 2,
				capture: {
					actions: "@actions.json",
					record: "capture.mp4",
					prewarm: false,
					prerollMs: 0,
					postrollMs: 0,
					verifyDuration: false,
					verifyResolution: false,
				},
				export: false,
			})
		);
		const get = vi.fn(async (url: string) => {
			if (url === "/api/claude/navigator/projects") {
				return { activeProjectId: "promo-project" };
			}
			if (url === "/api/claude/media/promo-project") return [];
			if (url === "/api/claude/timeline/promo-project") return { tracks: [] };
			if (url === "/api/claude/state") {
				return {
					version: 1,
					timestamp: Date.now(),
					state: {
						project: { activeProject: { id: "promo-project" } },
						editor: {
							initialization: {
								isInitializing: false,
								isPanelsReady: true,
							},
							preview: {
								panelMounted: true,
								canvasMounted: true,
								ready: true,
								reason: null,
								loading: false,
								activeVideoMediaIds: [],
								nativeCompositionStatus: "idle",
								lastPresentedAt: null,
								videos: [],
							},
						},
					},
				};
			}
			throw new Error(`Unexpected GET ${url}`);
		});
		const post = vi.fn(async (url: string) => {
			if (url === "/api/claude/navigator/open") {
				return { navigated: true, projectId: "promo-project" };
			}
			if (url === "/api/claude/screen-recording/start") {
				return { captureStartedAt: Date.now(), sessionId: "capture-1" };
			}
			if (url === "/api/claude/screen-recording/stop") {
				writeFileSync(recordingPath, "recording");
				return { filePath: recordingPath, bytesWritten: 9 };
			}
			throw new Error(`Unexpected POST ${url}`);
		});
		const client = {
			get,
			post,
			requireCapability: vi.fn(),
		} as unknown as EditorApiClient;
		const options: CLIRunOptions = {
			command: "editor:demo:run",
			plan: planPath,
			outputDir: "./output",
			saveIntermediates: false,
			json: true,
			verbose: false,
			quiet: false,
		};

		const result = await runEditorDemo({
			client,
			options,
			onProgress: vi.fn(),
		});

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(recordingPath);
		expect(result.data).toEqual(
			expect.objectContaining({
				projectId: "promo-project",
				stages: expect.objectContaining({
					preview: expect.objectContaining({
						preview: expect.objectContaining({ ready: true }),
					}),
					recording: expect.objectContaining({
						outputPath: recordingPath,
						bytes: 9,
						durationVerified: false,
					}),
				}),
			})
		);
		expect(post).toHaveBeenCalledWith("/api/claude/screen-recording/start", {
			captureMode: "editor",
			fileName: "capture.mp4",
			recordingQuality: "native",
		});
	});
});
