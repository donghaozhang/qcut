export const VIDEO_OBJECT_ALPHA_QUALITY_FAILURE =
	"video-object-alpha-quality-v1";
export const VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE =
	"video-object graph returned only the hostless 0/1/2 Alpha signature for the complete stream";

export function isConfirmedVideoObjectHostlessAlphaFailure({
	error,
}: {
	error: unknown;
}) {
	return (
		error instanceof Error &&
		error.message.includes(VIDEO_OBJECT_ALPHA_QUALITY_FAILURE) &&
		error.message.includes(VIDEO_OBJECT_HOSTLESS_ALPHA_SIGNATURE)
	);
}

export class VideoObjectRuntimeCircuitBreaker {
	readonly #rejectedCapabilities = new Set<string>();

	isOpen({ capabilitySha256 }: { capabilitySha256: string }) {
		return this.#rejectedCapabilities.has(capabilitySha256);
	}

	reject({
		capabilitySha256,
		error,
	}: {
		capabilitySha256: string;
		error: unknown;
	}) {
		if (!isConfirmedVideoObjectHostlessAlphaFailure({ error })) {
			return false;
		}
		this.#rejectedCapabilities.add(capabilitySha256);
		return true;
	}
}
