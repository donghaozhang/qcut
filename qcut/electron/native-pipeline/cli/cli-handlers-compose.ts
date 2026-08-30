import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadComposeManifest } from "../compose/compose-manifest.js";
import { createComposeProject } from "../compose/compose-project.js";
import { renderResolvedComposeProject } from "../compose/compose-render.js";
import { resolveComposeProject } from "../compose/compose-resolver.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export interface ComposeHandlerDependencies {
	load: typeof loadComposeManifest;
	resolve: typeof resolveComposeProject;
	render: typeof renderResolvedComposeProject;
	createProject: typeof createComposeProject;
}

const DEFAULT_DEPENDENCIES: ComposeHandlerDependencies = {
	load: loadComposeManifest,
	resolve: resolveComposeProject,
	render: renderResolvedComposeProject,
	createProject: createComposeProject,
};

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function requireConfig({ options }: { options: CLIRunOptions }): string {
	const config = options.config?.trim();
	if (!config) throw new Error("Missing --config compose manifest path.");
	return config;
}

async function loadAndResolve({
	options,
	signal,
	dependencies,
}: {
	options: CLIRunOptions;
	signal: AbortSignal;
	dependencies: ComposeHandlerDependencies;
}) {
	const loaded = await dependencies.load({
		configPath: requireConfig({ options }),
	});
	return dependencies.resolve({ loaded, signal });
}

export async function handleComposeValidate(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposeHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		onProgress({
			stage: "validating",
			percent: 10,
			message: "Resolving compose media and local resources...",
		});
		const resolved = await loadAndResolve({ options, signal, dependencies });
		let lockPath: string | undefined;
		if (options.output) {
			lockPath = resolve(options.output);
			await mkdir(dirname(lockPath), { recursive: true });
			await writeFile(lockPath, `${JSON.stringify(resolved.lock, null, 2)}\n`);
		}
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Compose manifest is valid",
		});
		return {
			success: true,
			...(lockPath ? { outputPath: lockPath, outputPaths: [lockPath] } : {}),
			data: {
				valid: true,
				config: resolved.loaded.configPath,
				duration: resolved.duration,
				clipCount: resolved.clips.length,
				filterCount: resolved.lock.filters.length,
				transitionCount: resolved.loaded.manifest.transitions.length,
				stickerCount: resolved.overlays.length,
				soundEffectCount: resolved.audio.length,
				lock: resolved.lock,
				lockPath,
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose validation failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}

export async function handleComposeRender(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposeHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		onProgress({
			stage: "validating",
			percent: 5,
			message: "Validating compose manifest...",
		});
		const resolved = await loadAndResolve({ options, signal, dependencies });
		if (options.dryRun) {
			return {
				success: true,
				data: {
					dryRun: true,
					config: resolved.loaded.configPath,
					duration: resolved.duration,
					lock: resolved.lock,
				},
				duration: (Date.now() - startedAt) / 1000,
			};
		}
		const outputPath = options.output
			? resolve(options.output)
			: join(resolve(options.outputDir), "compose.mp4");
		const result = await dependencies.render({
			resolved,
			outputPath,
			force: options.force ?? false,
			signal,
			onProgress,
		});
		return {
			success: true,
			outputPath: result.outputPath,
			outputPaths: [result.outputPath, result.lockPath, result.reportPath],
			data: result,
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose render failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}

export async function handleComposeProject(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposeHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		onProgress({
			stage: "validating",
			percent: 10,
			message: "Validating compose project resources...",
		});
		const resolved = await loadAndResolve({ options, signal, dependencies });
		const projectDirectory = options.projectDir
			? resolve(options.projectDir)
			: join(resolve(options.outputDir), "qcut-compose-project");
		onProgress({
			stage: "packaging",
			percent: 60,
			message: "Copying locked assets into a portable QCut compose project...",
		});
		const result = await dependencies.createProject({
			resolved,
			projectDirectory,
			force: options.force ?? false,
		});
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Portable compose project complete",
		});
		return {
			success: true,
			outputPath: result.projectPath,
			outputPaths: [result.projectPath, result.manifestPath, result.lockPath],
			data: result,
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose project failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}
