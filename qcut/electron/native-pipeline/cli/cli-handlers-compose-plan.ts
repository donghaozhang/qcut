import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	COMPOSE_PROTOCOL_VERSION,
	hasComposeValidationErrors,
	validateComposePatch,
	type ComposeIntent,
	type ComposeIntentKind,
	type ComposeJob,
	type ComposeSnapshot,
} from "../compose/compose-protocol.js";
import { createComposeProviderAdapter } from "../compose/providers/index.js";
import { loadComposeJsonArgument } from "./cli-handlers-compose-editor.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

const INTENT_KINDS = new Set<ComposeIntentKind>([
	"smart-packaging",
	"subtitle-style",
	"resource-match",
	"full-compose",
]);
const TERMINAL_JOB_STATUSES = new Set<ComposeJob["status"]>([
	"completed",
	"failed",
	"canceled",
]);
const MAX_POLL_ATTEMPTS = 120;

export interface ComposePlanDependencies {
	createAdapter: typeof createComposeProviderAdapter;
	pollDelayMs: number;
}

const DEFAULT_DEPENDENCIES: ComposePlanDependencies = {
	createAdapter: createComposeProviderAdapter,
	pollDelayMs: 1_000,
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function resolveComposeIntent({
	value,
}: {
	value: string | undefined;
}): Promise<ComposeIntent> {
	if (!value || INTENT_KINDS.has(value as ComposeIntentKind)) {
		return {
			schemaVersion: COMPOSE_PROTOCOL_VERSION,
			kind: (value as ComposeIntentKind) ?? "smart-packaging",
			options: {},
		};
	}
	const parsed = (await loadComposeJsonArgument({ value })) as {
		kind?: string;
		options?: Record<string, unknown>;
	};
	if (
		typeof parsed?.kind !== "string" ||
		!INTENT_KINDS.has(parsed.kind as ComposeIntentKind)
	) {
		throw new Error(
			`Compose intent needs a kind of ${[...INTENT_KINDS].join(", ")}.`
		);
	}
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		kind: parsed.kind as ComposeIntentKind,
		options: parsed.options ?? {},
	};
}

async function persistComposeJob({
	job,
	outputDir,
}: {
	job: ComposeJob;
	outputDir: string;
}): Promise<string> {
	const jobPath = resolve(join(outputDir, "compose", "jobs", `${job.id}.json`));
	await mkdir(dirname(jobPath), { recursive: true });
	await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
	return jobPath;
}

export async function handleComposePlan(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposePlanDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		if (!options.snapshot) {
			throw new Error("compose plan needs --snapshot.");
		}
		const snapshot = (await loadComposeJsonArgument({
			value: options.snapshot,
		})) as ComposeSnapshot;
		const intent = await resolveComposeIntent({ value: options.intent });
		const providerName = options.provider ?? "local";
		if (!["qcut", "openrouter", "fal", "local"].includes(providerName)) {
			throw new Error(`Unknown compose provider: ${providerName}`);
		}
		const adapter = dependencies.createAdapter({
			provider: providerName as ComposeJob["provider"],
		});

		onProgress({
			stage: "processing",
			percent: 10,
			message: `Planning with the ${providerName} provider...`,
		});
		let job = await adapter.createJob({ snapshot, intent });
		if (!TERMINAL_JOB_STATUSES.has(job.status)) {
			job = await adapter.uploadAssets({ job, snapshot });
		}
		let attempts = 0;
		while (!TERMINAL_JOB_STATUSES.has(job.status)) {
			if (attempts >= MAX_POLL_ATTEMPTS) {
				job = await adapter.cancelJob({ job });
				break;
			}
			if (attempts > 0) await sleep(dependencies.pollDelayMs);
			attempts += 1;
			job = await adapter.pollJob({ job, snapshot, intent, signal });
			onProgress({
				stage: "polling",
				percent: Math.round(job.progress * 100),
				message: `Compose job ${job.id}: ${job.status}`,
			});
		}

		const jobPath = await persistComposeJob({
			job,
			outputDir: options.outputDir,
		});
		if (job.status !== "completed") {
			return {
				success: false,
				error:
					job.error?.message ?? `Compose plan ended with status ${job.status}`,
				data: { job, jobPath },
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		const patch = await adapter.downloadPatch({ job });
		const issues = validateComposePatch({ snapshot, patch });
		if (hasComposeValidationErrors({ issues })) {
			return {
				success: false,
				error: "The provider returned a patch that fails validation.",
				data: { job, jobPath, issues },
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		const outputPath = resolve(
			options.output ?? join(options.outputDir, `${patch.id}.json`)
		);
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, `${JSON.stringify(patch, null, 2)}\n`);
		onProgress({
			stage: "complete",
			percent: 100,
			message: `Compose patch ${patch.id} ready`,
		});
		return {
			success: true,
			outputPath,
			outputPaths: [outputPath, jobPath],
			data: {
				job,
				jobPath,
				patchId: patch.id,
				operationCount: patch.operations.length,
				warnings: patch.warnings,
				issues,
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose plan failed: ${error instanceof Error ? error.message : String(error)}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}
