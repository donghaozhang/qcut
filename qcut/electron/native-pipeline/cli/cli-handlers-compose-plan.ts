import { mkdir, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createComposeJobStore } from "../compose/providers/compose-job-store.js";
import { dirname, join, resolve } from "node:path";
import {
	COMPOSE_PROTOCOL_VERSION,
	hasComposeValidationErrors,
	validateComposePatch,
	validateComposeSnapshot,
	type ComposeIntent,
	type ComposeIntentKind,
	type ComposeJob,
	type ComposeSnapshot,
} from "../compose/compose-protocol.js";
import { createComposeProviderAdapter } from "../compose/providers/index.js";
import {
	composeResourceQuery,
	discoverComposeResources,
} from "../compose/compose-resource-broker.js";
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
	discoverResources: typeof discoverComposeResources;
	pollDelayMs: number;
}

const DEFAULT_DEPENDENCIES: ComposePlanDependencies = {
	createAdapter: createComposeProviderAdapter,
	discoverResources: discoverComposeResources,
	pollDelayMs: 1_000,
};

function mergeResourceCandidates({
	existing,
	discovered,
}: {
	existing: ComposeSnapshot["availableResources"];
	discovered: ComposeSnapshot["availableResources"];
}): ComposeSnapshot["availableResources"] {
	const byIdentity = new Map<
		string,
		ComposeSnapshot["availableResources"][number]
	>();
	for (const resource of [...existing, ...discovered]) {
		byIdentity.set(
			`${resource.provider}:${resource.assetType}:${resource.assetId}`,
			resource
		);
	}
	return [...byIdentity.values()];
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
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/.test(job.id))
		throw new Error("Invalid Compose job ID.");
	await mkdir(dirname(jobPath), { recursive: true });
	const temporary = `${jobPath}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, {
		mode: 0o600,
		flag: "wx",
	});
	await rename(temporary, jobPath);
	return jobPath;
}

export async function handleComposePlan(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposePlanDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	let activeJob: ComposeJob | undefined;
	try {
		const resumed = options.jobId
			? await createComposeJobStore().read({ id: options.jobId })
			: undefined;
		if (resumed && (options.snapshot || options.intent))
			throw new Error(
				"Resume uses the original snapshot and intent; omit --snapshot and --intent."
			);
		if (!options.snapshot && !resumed) {
			throw new Error("compose plan needs --snapshot or --job-id to resume.");
		}
		let snapshot =
			resumed?.snapshot ??
			((await loadComposeJsonArgument({
				value: options.snapshot ?? "",
			})) as ComposeSnapshot);
		const intent =
			resumed?.intent ??
			(await resolveComposeIntent({ value: options.intent }));
		const providerName = resumed?.job.provider ?? options.provider ?? "local";
		if (resumed && options.provider && options.provider !== providerName)
			throw new Error("Cannot change a resumed job's provider.");
		if (!["qcut", "openrouter", "fal", "local"].includes(providerName)) {
			throw new Error(`Unknown compose provider: ${providerName}`);
		}
		if (
			hasComposeValidationErrors({
				issues: validateComposeSnapshot({ snapshot }),
			})
		)
			throw new Error("Invalid Compose snapshot.");
		if (
			!resumed &&
			(providerName === "qcut" ||
				providerName === "openrouter" ||
				providerName === "fal")
		) {
			const broker = await dependencies.discoverResources({
				query: composeResourceQuery({
					snapshot,
					intentQuery: intent.options.resourceQuery,
				}),
				signal,
			});
			snapshot = {
				...snapshot,
				availableResources: mergeResourceCandidates({
					existing: Array.isArray(snapshot.availableResources)
						? snapshot.availableResources
						: [],
					discovered: broker.resources,
				}),
				resourceWarnings: [
					...(snapshot.resourceWarnings ?? []),
					...broker.warnings,
				],
				capabilities: { ...snapshot.capabilities, ...broker.capabilities },
			};
		}
		const adapter = dependencies.createAdapter({
			provider: providerName as ComposeJob["provider"],
		});

		onProgress({
			stage: "processing",
			percent: 10,
			message: `Planning with the ${providerName} provider...`,
		});
		let job = resumed?.job ?? (await adapter.createJob({ snapshot, intent }));
		activeJob = job;
		await persistComposeJob({ job, outputDir: options.outputDir });
		if (!TERMINAL_JOB_STATUSES.has(job.status)) {
			job = await adapter.uploadAssets({ job, snapshot });
			activeJob = job;
			await persistComposeJob({ job, outputDir: options.outputDir });
		}
		const poll = async ({
			current,
			attempts,
		}: {
			current: ComposeJob;
			attempts: number;
		}): Promise<ComposeJob> => {
			if (
				TERMINAL_JOB_STATUSES.has(current.status) ||
				attempts >= MAX_POLL_ATTEMPTS
			)
				return current;
			signal.throwIfAborted();
			if (attempts > 0)
				await delay(dependencies.pollDelayMs, undefined, { signal });
			const next = await adapter.pollJob({
				job: current,
				snapshot,
				intent,
				signal,
			});
			activeJob = next;
			await persistComposeJob({ job: next, outputDir: options.outputDir });
			onProgress({
				stage: "polling",
				percent: Math.round(next.progress * 100),
				message: `Compose job ${next.id}: ${next.status}`,
			});
			return poll({ current: next, attempts: attempts + 1 });
		};
		job = await poll({ current: job, attempts: 0 });

		const jobPath = await persistComposeJob({
			job,
			outputDir: options.outputDir,
		});
		if (job.status !== "completed") {
			return {
				success: false,
				error:
					job.error?.message ??
					`Compose plan is ${job.status}.` +
						((providerName === "qcut" || providerName === "fal") &&
						!TERMINAL_JOB_STATUSES.has(job.status)
							? ` Resume with --job-id ${job.id}; the remote job was not canceled.`
							: ""),
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
			...(activeJob
				? { data: { job: activeJob, resumeJobId: activeJob.id } }
				: {}),
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}
