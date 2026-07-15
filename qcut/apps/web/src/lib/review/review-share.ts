import {
	isReviewPackage,
	type PortableReviewComment,
	type ReviewPackage,
} from "@qcut/editor-core/collaboration";

export type { PortableReviewComment, ReviewPackage };

const REVIEW_PACKAGE_PREFIX = "qcut-review:v1:";
const MAX_REVIEW_PACKAGE_LENGTH = 200_000;

function bytesToBase64Url({ bytes }: { bytes: Uint8Array }) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

function base64UrlToBytes({ value }: { value: string }) {
	const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	const binary = atob(padded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeReviewPackage({
	reviewPackage,
}: {
	reviewPackage: ReviewPackage;
}) {
	const bytes = new TextEncoder().encode(JSON.stringify(reviewPackage));
	return `${REVIEW_PACKAGE_PREFIX}${bytesToBase64Url({ bytes })}`;
}

export function decodeReviewPackage({ token }: { token: string }) {
	const trimmedToken = token.trim();
	if (
		!trimmedToken.startsWith(REVIEW_PACKAGE_PREFIX) ||
		trimmedToken.length > MAX_REVIEW_PACKAGE_LENGTH
	) {
		return null;
	}
	try {
		const encoded = trimmedToken.slice(REVIEW_PACKAGE_PREFIX.length);
		const parsed: unknown = JSON.parse(
			new TextDecoder().decode(base64UrlToBytes({ value: encoded }))
		);
		return isReviewPackage({ value: parsed })
			? (parsed as ReviewPackage)
			: null;
	} catch {
		return null;
	}
}
