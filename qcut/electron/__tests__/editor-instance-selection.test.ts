import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	discoverQCutInstances,
	handleInstancesCommand,
	resolveEditorInstance,
} from "../native-pipeline/cli/instance-selection.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";

function options(
	command: string,
	stateDir: string,
	overrides: Partial<CLIRunOptions> = {}
): CLIRunOptions {
	return {
		command,
		stateDir,
		outputDir: "./output",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: false,
		...overrides,
	};
}

const tempDirs: string[] = [];

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("QCut instance selection", () => {
	it("discovers the installed and dev instances concurrently", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "qcut-instances-"));
		tempDirs.push(stateDir);
		const fetchImpl = vi.fn(async (url: string | URL) => {
			const port = new URL(String(url)).port;
			if (port !== "8765" && port !== "8878") {
				throw new Error("offline");
			}
			return new Response(
				JSON.stringify({
					success: true,
					data: { status: "ok", appVersion: `test-${port}` },
				}),
				{ status: 200, headers: { "content-type": "application/json" } }
			);
		}) as unknown as typeof fetch;

		const instances = await discoverQCutInstances({
			stateDir,
			fetchImpl,
			timeoutMs: 50,
		});

		expect(instances.map((instance) => instance.port)).toEqual([8765, 8878]);
		expect(instances[1].appVersion).toBe("test-8878");
	});

	it("fails fast when multiple instances are live and none is selected", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "qcut-instances-"));
		tempDirs.push(stateDir);
		vi.stubEnv("QCUT_API_PORT", "");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL) => {
				const port = new URL(String(url)).port;
				if (port === "8765" || port === "8878") {
					return new Response(JSON.stringify({ status: "ok" }), {
						status: 200,
					});
				}
				throw new Error("offline");
			})
		);

		await expect(
			resolveEditorInstance(options("editor:health", stateDir))
		).rejects.toThrow("Multiple QCut instances");
	});

	it("persists instances use for following commands and named sessions", async () => {
		const stateDir = mkdtempSync(join(tmpdir(), "qcut-instances-"));
		tempDirs.push(stateDir);
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL) => {
				if (new URL(String(url)).port === "8878") {
					return new Response(JSON.stringify({ status: "ok" }), {
						status: 200,
					});
				}
				throw new Error("offline");
			})
		);

		const selected = await handleInstancesCommand(
			options("instances-use", stateDir, { port: "8878" })
		);
		const resolved = await resolveEditorInstance(
			options("editor:health", stateDir)
		);

		expect(selected.success).toBe(true);
		expect(selected.data).toEqual(
			expect.objectContaining({
				instance: expect.objectContaining({ port: 8878, selected: true }),
			})
		);
		expect(resolved).toEqual(
			expect.objectContaining({ port: "8878", source: "instances use" })
		);
		const persisted = JSON.parse(
			readFileSync(join(stateDir, "selected-instance.json"), "utf8")
		);
		expect(persisted.port).toBe(8878);
	});
});
