import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runEditorDemo } from "../native-pipeline/cli/editor-demo-run.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";

let tempDir = "";

afterEach(() => {
	if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	tempDir = "";
});

describe("editor demo run", () => {
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
});
