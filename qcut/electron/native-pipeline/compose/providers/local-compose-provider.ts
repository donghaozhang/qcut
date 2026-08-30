import type {
	ComposeIntent,
	ComposeJob,
	ComposePatch,
	ComposePatchOperation,
	ComposeSnapshot,
} from "../compose-protocol.js";
import { COMPOSE_PROTOCOL_VERSION } from "../compose-protocol.js";
import {
	createComposeJobRecord,
	transitionComposeJob,
	type ComposeProviderAdapter,
} from "./compose-provider.js";

const HIGHLIGHT_CAPTION_LIMIT = 3;
const CROSSFADE_MAX_DURATION_SECONDS = 1;
const ADJACENCY_TOLERANCE_SECONDS = 0.05;

function highlightOperations({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): ComposePatchOperation[] {
	return [...snapshot.captions]
		.filter((caption) => caption.text.trim().length > 0)
		.sort(
			(left, right) =>
				right.text.length - left.text.length ||
				left.startTime - right.startTime ||
				left.id.localeCompare(right.id)
		)
		.slice(0, HIGHLIGHT_CAPTION_LIMIT)
		.map((caption) => ({
			kind: "add-text-overlay" as const,
			id: `text:${caption.id}`,
			sourceCaptionId: caption.id,
			text: caption.text,
			textTemplateId: "plain",
			startTime: caption.startTime,
			duration: caption.duration,
			reason: "caption-highlight",
		}));
}

function transitionOperations({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): ComposePatchOperation[] {
	const operations: ComposePatchOperation[] = [];
	const byTrack = new Map<string, ComposeSnapshot["media"]>();
	for (const media of snapshot.media) {
		if (media.kind !== "video") continue;
		const entries = byTrack.get(media.trackId) ?? [];
		entries.push(media);
		byTrack.set(media.trackId, entries);
	}
	for (const [trackId, entries] of byTrack) {
		const ordered = [...entries].sort(
			(left, right) => left.startTime - right.startTime
		);
		for (let index = 0; index + 1 < ordered.length; index += 1) {
			const from = ordered[index];
			const to = ordered[index + 1];
			const fromVisible = Math.max(0, from.duration - from.trimStart);
			const cut = from.startTime + fromVisible;
			if (Math.abs(cut - to.startTime) > ADJACENCY_TOLERANCE_SECONDS) {
				continue;
			}
			const duration = Math.min(
				CROSSFADE_MAX_DURATION_SECONDS,
				fromVisible / 2,
				Math.max(0.1, to.duration - to.trimStart) / 2
			);
			if (duration <= 0) continue;
			operations.push({
				kind: "upsert-transition",
				id: `transition:${trackId}:${from.elementId}:${to.elementId}`,
				trackId,
				fromElementId: from.elementId,
				toElementId: to.elementId,
				startTime: Math.max(0, cut - duration / 2),
				duration,
				presetId: "crossfade",
				reason: "shot-boundary",
			});
		}
	}
	return operations;
}

/**
 * Deterministic offline heuristic: highlight the strongest captions and
 * crossfade adjacent cuts. Operation ids derive from stable timeline
 * identities, so retrying a plan yields the same ids and merges idempotently.
 */
export function createLocalComposeProvider(): ComposeProviderAdapter {
	const patchesByJobId = new Map<string, ComposePatch>();
	return {
		provider: "local",
		createJob: async ({ snapshot, intent }) =>
			createComposeJobRecord({ provider: "local", snapshot, intent }),
		uploadAssets: async ({ job }) =>
			transitionComposeJob({ job, status: "running", progress: 0.5 }),
		pollJob: async ({ job, snapshot, intent }) => {
			const operations = [
				...highlightOperations({ snapshot }),
				...transitionOperations({ snapshot }),
			];
			const patch: ComposePatch = {
				schemaVersion: COMPOSE_PROTOCOL_VERSION,
				id: `${job.id}-patch`,
				source: "local-heuristic",
				intentKind: intent.kind,
				mode: "idempotent",
				snapshotId: snapshot.id,
				sourceFingerprint: snapshot.sourceFingerprint,
				createdAt: job.createdAt,
				provider: "local",
				operations,
				warnings:
					operations.length === 0
						? ["The local heuristic found nothing to add for this snapshot."]
						: [],
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
				throw new Error(`No result patch for local compose job ${job.id}`);
			}
			return patch;
		},
		cancelJob: async ({ job }) =>
			transitionComposeJob({ job, status: "canceled" }),
	};
}
