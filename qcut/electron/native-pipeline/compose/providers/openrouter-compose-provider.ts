import type {
	ComposeIntent,
	ComposeJobError,
	ComposePatch,
	ComposePatchOperation,
	ComposeProvider,
	ComposeSnapshot,
} from "../compose-protocol.js";
import { COMPOSE_PROTOCOL_VERSION } from "../compose-protocol.js";
import { callModelApi } from "../../infra/api-caller.js";
import {
	createComposeJobRecord,
	transitionComposeJob,
	type ComposeProviderAdapter,
} from "./compose-provider.js";

const OPENROUTER_COMPLETIONS_URL =
	"https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.7-flash";
const KNOWN_OPERATION_KINDS = new Set([
	"add-caption",
	"add-text-overlay",
	"add-sticker",
	"add-sound-effect",
	"update-media-zoom",
	"upsert-transition",
]);

export interface OpenRouterComposeProviderDependencies {
	fetchImpl?: typeof fetch;
	apiKey?: string;
	model?: string;
	modelApiCallImpl?: typeof callModelApi;
	jobProvider?: Extract<ComposeProvider, "openrouter" | "qcut">;
}

function systemPrompt(): string {
	return [
		"You plan QCut timeline patches. Respond with a JSON object:",
		'{"operations": [...]}. Each operation needs kind, startTime, duration.',
		'Kinds: "add-text-overlay" (text, textTemplateId), "add-caption" (text,',
		'language), "upsert-transition" (trackId, fromElementId, toElementId,',
		'presetId of "crossfade"|"dissolve"), "update-media-zoom" (trackId,',
		"elementId, fromScale, toScale). Only reference elementIds present in",
		"the snapshot. Respond with JSON only, no prose.",
	].join(" ");
}

/** The upload payload carries timeline structure only — never local paths. */
function snapshotSummary({ snapshot }: { snapshot: ComposeSnapshot }): string {
	return JSON.stringify({
		project: snapshot.project,
		media: snapshot.media.map(
			({ id, kind, trackId, elementId, startTime, duration, trimStart }) => ({
				id,
				kind,
				trackId,
				elementId,
				startTime,
				duration,
				trimStart,
			})
		),
		captions: snapshot.captions,
		beats: snapshot.beats,
		shots: snapshot.shots,
	});
}

function categorizedError({
	status,
	message,
}: {
	status?: number;
	message: string;
}): ComposeJobError {
	if (status === 401 || status === 403) {
		return {
			code: `openrouter-${status}`,
			message,
			category: "auth",
			retryable: false,
		};
	}
	if (status === 402 || status === 429) {
		return {
			code: `openrouter-${status}`,
			message,
			category: "quota",
			retryable: status === 429,
		};
	}
	return {
		code: status ? `openrouter-${status}` : "openrouter-network",
		message,
		category: "retryable",
		retryable: true,
	};
}

function statusFromApiError({
	message,
}: {
	message: string;
}): number | undefined {
	const match = /API error (\d{3})/.exec(message);
	return match ? Number(match[1]) : undefined;
}

function extractJson({ content }: { content: string }): unknown {
	const trimmed = content.trim();
	const unfenced = trimmed.startsWith("```")
		? trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
		: trimmed;
	return JSON.parse(unfenced);
}

function sanitizeOperations({
	value,
}: {
	value: unknown;
}): ComposePatchOperation[] {
	const record = value as { operations?: unknown };
	if (!Array.isArray(record?.operations)) {
		throw new Error("The model response has no operations array.");
	}
	const operations: ComposePatchOperation[] = [];
	for (const [index, candidate] of record.operations.entries()) {
		if (typeof candidate !== "object" || candidate === null) continue;
		const operation = candidate as Record<string, unknown>;
		const kind = operation.kind;
		if (typeof kind !== "string" || !KNOWN_OPERATION_KINDS.has(kind)) {
			continue;
		}
		if (
			typeof operation.startTime !== "number" ||
			typeof operation.duration !== "number"
		) {
			continue;
		}
		operations.push({
			...(operation as unknown as ComposePatchOperation),
			id: `openrouter:${kind}:${index}`,
		});
	}
	return operations;
}

/**
 * Plans a patch with an OpenRouter-routed model. The request carries a
 * path-free snapshot summary; the API key lives only in the request header
 * and never lands in the job record or the patch.
 */
export function createOpenRouterComposeProvider({
	fetchImpl,
	apiKey = process.env.OPENROUTER_API_KEY ?? "",
	model = DEFAULT_MODEL,
	modelApiCallImpl = callModelApi,
	jobProvider = "openrouter",
}: OpenRouterComposeProviderDependencies = {}): ComposeProviderAdapter {
	const patchesByJobId = new Map<string, ComposePatch>();
	return {
		provider: jobProvider,
		createJob: async ({ snapshot, intent }) =>
			createComposeJobRecord({ provider: jobProvider, snapshot, intent }),
		uploadAssets: async ({ job }) =>
			transitionComposeJob({ job, status: "uploading", progress: 0.2 }),
		pollJob: async ({ job, snapshot, intent, signal }) => {
			let content: string;
			try {
				const requestPayload = {
					model,
					messages: [
						{ role: "system", content: systemPrompt() },
						{
							role: "user",
							content: `Intent: ${intent.kind}. Snapshot: ${snapshotSummary({ snapshot })}`,
						},
					],
				};
				let responsePayload: unknown;
				if (fetchImpl) {
					if (!apiKey) {
						return transitionComposeJob({
							job,
							status: "failed",
							error: {
								code: "openrouter-missing-key",
								message: "OPENROUTER_API_KEY is not configured.",
								category: "auth",
								retryable: false,
							},
						});
					}
					const response = await fetchImpl(OPENROUTER_COMPLETIONS_URL, {
						method: "POST",
						signal,
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(requestPayload),
					});
					if (!response.ok) {
						return transitionComposeJob({
							job,
							status: "failed",
							error: categorizedError({
								status: response.status,
								message: `OpenRouter request failed (${response.status})`,
							}),
						});
					}
					responsePayload = await response.json();
				} else {
					const result = await modelApiCallImpl({
						provider: "openrouter",
						endpoint: "chat/completions",
						payload: requestPayload,
						signal,
						timeoutMs: 120_000,
					});
					if (!result.success) {
						const message = result.error ?? "OpenRouter request failed.";
						const missingCredentials = message.includes(
							"No API key configured"
						);
						return transitionComposeJob({
							job,
							status: "failed",
							error: missingCredentials
								? {
										code: "openrouter-missing-key",
										message,
										category: "auth",
										retryable: false,
									}
								: categorizedError({
										status: statusFromApiError({ message }),
										message,
									}),
						});
					}
					responsePayload = result.data;
				}
				const payload = responsePayload as {
					choices?: Array<{ message?: { content?: string } }>;
				};
				content = payload.choices?.[0]?.message?.content ?? "";
			} catch (error) {
				return transitionComposeJob({
					job,
					status: "failed",
					error: categorizedError({
						message: error instanceof Error ? error.message : String(error),
					}),
				});
			}
			let operations: ComposePatchOperation[];
			try {
				operations = sanitizeOperations({
					value: extractJson({ content }),
				});
			} catch (error) {
				return transitionComposeJob({
					job,
					status: "failed",
					error: {
						code: "openrouter-malformed-response",
						message: error instanceof Error ? error.message : String(error),
						category: "retryable",
						retryable: true,
					},
				});
			}
			const patch: ComposePatch = {
				schemaVersion: COMPOSE_PROTOCOL_VERSION,
				id: `${job.id}-patch`,
				source: "cloud",
				intentKind: intent.kind,
				mode: "idempotent",
				snapshotId: snapshot.id,
				sourceFingerprint: snapshot.sourceFingerprint,
				createdAt: job.createdAt,
				provider: jobProvider,
				operations,
				warnings: [],
			};
			patchesByJobId.set(job.id, patch);
			return transitionComposeJob({
				job,
				status: "completed",
				resultPatchId: patch.id,
			});
		},
		downloadPatch: async ({ job }) => {
			const patch = patchesByJobId.get(job.id);
			if (!patch) {
				throw new Error(`No result patch for OpenRouter compose job ${job.id}`);
			}
			return patch;
		},
		cancelJob: async ({ job }) =>
			transitionComposeJob({ job, status: "canceled" }),
	};
}
