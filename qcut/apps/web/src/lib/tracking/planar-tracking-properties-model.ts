import type {
	PlanarQuad,
	PlanarTrackingErrorCode,
	PlanarTrackingReference,
} from "@qcut/editor-core";

export const DEFAULT_PLANAR_SEED_QUAD: PlanarQuad = {
	topLeft: { x: 0.25, y: 0.25 },
	topRight: { x: 0.75, y: 0.25 },
	bottomRight: { x: 0.75, y: 0.75 },
	bottomLeft: { x: 0.25, y: 0.75 },
};

export function upsertPlanarTrackingReference({
	reference,
	references,
}: {
	reference: PlanarTrackingReference;
	references: PlanarTrackingReference[] | undefined;
}): PlanarTrackingReference[] {
	const existing = references ?? [];
	return [
		...existing.filter((candidate) => candidate.id !== reference.id),
		reference,
	];
}

export function readPlanarTrackingErrorCode({
	cause,
}: {
	cause: unknown;
}): PlanarTrackingErrorCode {
	if (cause instanceof DOMException && cause.name === "AbortError") {
		return "cancelled";
	}
	if (cause instanceof Error) {
		const code = Reflect.get(cause, "code");
		if (typeof code === "string") return code as PlanarTrackingErrorCode;
	}
	return "decode-failed";
}
