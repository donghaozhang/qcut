import type {
	PlanarTrackingSidecarV1,
	PlanarTrackingValidationIssue,
} from "./planar-types.js";
import { validatePlanarTrackingSidecar } from "./planar-sidecar-validation.js";

export class PlanarTrackingSidecarValidationError extends Error {
	readonly issues: readonly PlanarTrackingValidationIssue[];

	constructor({
		issues,
	}: {
		issues: readonly PlanarTrackingValidationIssue[];
	}) {
		super(
			`Invalid planar tracking sidecar: ${issues
				.map((issue) => `${issue.path}: ${issue.message}`)
				.join("; ")}`
		);
		this.name = "PlanarTrackingSidecarValidationError";
		this.issues = issues;
	}
}

function requireValidSidecar({
	value,
}: {
	value: unknown;
}): PlanarTrackingSidecarV1 {
	const validation = validatePlanarTrackingSidecar({ value });
	if (!validation.valid) {
		throw new PlanarTrackingSidecarValidationError({
			issues: validation.issues,
		});
	}
	return validation.value;
}

export function serializePlanarTrackingSidecar({
	sidecar,
}: {
	sidecar: PlanarTrackingSidecarV1;
}): string {
	return `${JSON.stringify(requireValidSidecar({ value: sidecar }))}\n`;
}

export function parsePlanarTrackingSidecar({
	serialized,
}: {
	serialized: string;
}): PlanarTrackingSidecarV1 {
	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch (cause) {
		throw new Error("Planar tracking sidecar is not valid JSON.", { cause });
	}
	return requireValidSidecar({ value });
}
