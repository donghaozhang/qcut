const PLAN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The only renderer-controlled commit fields. The warning list is an explicit
 * confirmation of the exact warnings returned by `plan`.
 */
export interface StandaloneJianyingDraftCommitRequest {
	acceptedWarningFingerprints?: string[];
	planToken: string;
}

export class StandaloneJianyingDraftCommitValidationError extends Error {
	constructor({ message }: { message: string }) {
		super(`Invalid standalone JianYing commit request: ${message}`);
		this.name = "StandaloneJianyingDraftCommitValidationError";
	}
}

function getCommitRecord({
	input,
}: {
	input: unknown;
}): Record<string, unknown> {
	if (
		typeof input !== "object" ||
		input === null ||
		Array.isArray(input) ||
		(Object.getPrototypeOf(input) !== Object.prototype &&
			Object.getPrototypeOf(input) !== null)
	) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: "expected a plain object.",
		});
	}
	if (Object.getOwnPropertySymbols(input).length > 0) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: "symbol properties are not allowed.",
		});
	}
	const descriptors = Object.getOwnPropertyDescriptors(input);
	for (const [key, descriptor] of Object.entries(descriptors)) {
		if (!("value" in descriptor) || !descriptor.enumerable) {
			throw new StandaloneJianyingDraftCommitValidationError({
				message: `property ${key} must be an enumerable data property.`,
			});
		}
	}
	return input as Record<string, unknown>;
}

export function normalizeCommitRequest({
	input,
}: {
	input: unknown;
}): Required<StandaloneJianyingDraftCommitRequest> {
	const request = getCommitRecord({ input });
	const allowedKeys = new Set(["acceptedWarningFingerprints", "planToken"]);
	const unknownKeys = Object.keys(request).filter(
		(key) => !allowedKeys.has(key)
	);
	if (unknownKeys.length > 0) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: `unknown properties: ${unknownKeys.join(", ")}.`,
		});
	}
	if (
		typeof request.planToken !== "string" ||
		!PLAN_TOKEN_PATTERN.test(request.planToken)
	) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: "planToken must be a 256-bit base64url token.",
		});
	}
	const rawWarningFingerprints = request.acceptedWarningFingerprints ?? [];
	if (!Array.isArray(rawWarningFingerprints)) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: "acceptedWarningFingerprints must be an array.",
		});
	}
	if (rawWarningFingerprints.length > 10_000) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: "acceptedWarningFingerprints exceeds 10000 entries.",
		});
	}
	const acceptedWarningFingerprints: string[] = [];
	for (const [index, fingerprint] of rawWarningFingerprints.entries()) {
		if (
			typeof fingerprint !== "string" ||
			fingerprint.length === 0 ||
			fingerprint.length > 4096
		) {
			throw new StandaloneJianyingDraftCommitValidationError({
				message: `acceptedWarningFingerprints[${index}] must be a non-empty bounded string.`,
			});
		}
		acceptedWarningFingerprints.push(fingerprint);
	}
	if (
		new Set(acceptedWarningFingerprints).size !==
		acceptedWarningFingerprints.length
	) {
		throw new StandaloneJianyingDraftCommitValidationError({
			message: "acceptedWarningFingerprints must not contain duplicates.",
		});
	}
	return {
		acceptedWarningFingerprints: acceptedWarningFingerprints.sort(),
		planToken: request.planToken,
	};
}
