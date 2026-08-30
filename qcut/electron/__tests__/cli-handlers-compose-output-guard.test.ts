import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	type ComposeHandlerDependencies,
	handleComposeRender,
	handleComposeValidate,
} from "../native-pipeline/cli/cli-handlers-compose.js";
import type { ResolvedComposeProject } from "../native-pipeline/compose/compose-resolver.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";

let directory = "";
let configPath = "";
let clipPath = "";

function fakeResolved(): ResolvedComposeProject {
	return {
		loaded: {
			configPath,
			manifest: { transitions: [] },
		},
		clips: [{ sourcePath: clipPath }],
		transitionsByCut: [],
		overlays: [],
		audio: [],
		duration: 1,
		lock: { filters: [] },
	} as unknown as ResolvedComposeProject;
}

function fakeDependencies(): ComposeHandlerDependencies {
	return {
		load: vi.fn(async () => fakeResolved().loaded),
		resolve: vi.fn(async () => fakeResolved()),
		render: vi.fn(async ({ outputPath }: { outputPath: string }) => ({
			outputPath,
			lockPath: `${outputPath}.lock.json`,
			reportPath: `${outputPath}.report.json`,
		})),
		createProject: vi.fn(),
	} as unknown as ComposeHandlerDependencies;
}

function options(partial: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "compose",
		config: configPath,
		outputDir: directory,
		...partial,
	} as CLIRunOptions;
}

const noProgress = () => {};

describe("compose CLI output overwrite guard", () => {
	beforeAll(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-compose-guard-"));
		configPath = path.join(directory, "edit.qcut-compose.json");
		clipPath = path.join(directory, "clip.mp4");
		fs.writeFileSync(configPath, "{}\n");
		fs.writeFileSync(clipPath, "not-really-video");
	});

	afterAll(() => {
		fs.rmSync(directory, { recursive: true, force: true });
	});

	it("rejects validate --output pointing at the compose config", async () => {
		const result = await handleComposeValidate(
			options({ output: configPath }),
			noProgress,
			new AbortController().signal,
			fakeDependencies()
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("must not overwrite");
		expect(fs.readFileSync(configPath, "utf8")).toBe("{}\n");
	});

	it("rejects validate --output pointing at a resolved input asset", async () => {
		const result = await handleComposeValidate(
			options({ output: clipPath }),
			noProgress,
			new AbortController().signal,
			fakeDependencies()
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("must not overwrite");
		expect(fs.readFileSync(clipPath, "utf8")).toBe("not-really-video");
	});

	it("writes the lock file for a distinct validate --output path", async () => {
		const lockPath = path.join(directory, "locks", "validate-lock.json");
		const result = await handleComposeValidate(
			options({ output: lockPath }),
			noProgress,
			new AbortController().signal,
			fakeDependencies()
		);
		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(lockPath);
		expect(fs.existsSync(lockPath)).toBe(true);
	});

	it("rejects render --output pointing at a resolved input asset", async () => {
		const dependencies = fakeDependencies();
		const result = await handleComposeRender(
			options({ output: clipPath }),
			noProgress,
			new AbortController().signal,
			dependencies
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("must not overwrite");
		expect(dependencies.render).not.toHaveBeenCalled();
	});
});
