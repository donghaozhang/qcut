import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposePatch,
	type ComposePatchOperation,
} from "./compose-types.js";

function compareCodeUnits({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function sortOperations({
	operations,
}: {
	operations: readonly ComposePatchOperation[];
}): ComposePatchOperation[] {
	return [...operations].sort(
		(left, right) =>
			left.startTime - right.startTime ||
			left.duration - right.duration ||
			compareCodeUnits({ left: left.id, right: right.id })
	);
}

/**
 * Merges two patches for the same snapshot. Operations are keyed by id and the
 * incoming patch wins collisions, so replaying a merge with an already-merged
 * patch is a no-op apart from the new patch identity.
 */
export function mergeComposePatches({
	base,
	incoming,
	patchId,
	createdAt,
}: {
	base: ComposePatch;
	incoming: ComposePatch;
	patchId: string;
	createdAt: string;
}): ComposePatch {
	if (
		base.snapshotId !== incoming.snapshotId ||
		base.sourceFingerprint !== incoming.sourceFingerprint
	) {
		throw new Error("Cannot merge compose patches from different snapshots.");
	}
	const operationsById = new Map<string, ComposePatchOperation>();
	for (const operation of base.operations) {
		operationsById.set(operation.id, operation);
	}
	for (const operation of incoming.operations) {
		operationsById.set(operation.id, operation);
	}
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: patchId,
		source: incoming.source,
		intentKind: incoming.intentKind,
		mode: incoming.mode,
		snapshotId: base.snapshotId,
		sourceFingerprint: base.sourceFingerprint,
		createdAt,
		provider: incoming.provider ?? base.provider,
		remoteTaskId: incoming.remoteTaskId ?? base.remoteTaskId,
		operations: sortOperations({
			operations: [...operationsById.values()],
		}),
		warnings: [...new Set([...base.warnings, ...incoming.warnings])],
	};
}

export function countComposeOperations({
	patch,
}: {
	patch: ComposePatch;
}): Record<ComposePatchOperation["kind"], number> {
	const counts: Record<ComposePatchOperation["kind"], number> = {
		"add-caption": 0,
		"add-text-overlay": 0,
		"add-sticker": 0,
		"add-sound-effect": 0,
		"update-media-zoom": 0,
		"upsert-transition": 0,
		"insert-media-clip": 0,
		"set-media-filter-stack": 0,
		"add-filter-layer": 0,
	};
	for (const operation of patch.operations) {
		counts[operation.kind] += 1;
	}
	return counts;
}
