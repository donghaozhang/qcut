import {
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_BLEND,
	type TemattingBlendImplementation,
} from "./tematting-blend.js";

export const NATIVE_METAL_LIBRARY_SHA256 =
	"0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9";

export function selectTemattingBlendImplementation({
	arch,
	disabled,
	librarySha256,
	platform,
}: {
	arch: string;
	disabled: boolean;
	librarySha256: string;
	platform: NodeJS.Platform;
}): TemattingBlendImplementation {
	if (
		platform === "darwin" &&
		arch === "arm64" &&
		!disabled &&
		librarySha256 === NATIVE_METAL_LIBRARY_SHA256
	) {
		return TEMATTING_NATIVE_METAL_BLEND;
	}
	return TEMATTING_COMPATIBLE_BLEND;
}

export async function executeTemattingWithFallback({
	execute,
	onFallback,
	preferred,
}: {
	execute: (implementation: TemattingBlendImplementation) => Promise<void>;
	onFallback?: (error: unknown) => void;
	preferred: TemattingBlendImplementation;
}) {
	try {
		await execute(preferred);
		return preferred;
	} catch (error) {
		if (
			preferred !== TEMATTING_NATIVE_METAL_BLEND ||
			(error instanceof Error && error.name === "AbortError")
		) {
			throw error;
		}
		onFallback?.(error);
		await execute(TEMATTING_COMPATIBLE_BLEND);
		return TEMATTING_COMPATIBLE_BLEND;
	}
}
