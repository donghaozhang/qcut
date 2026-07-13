import {
	isReviewPackage,
	mergeReviewComments,
	type ReviewPackage,
} from "@qcut/editor-core/collaboration";
import {
	LICENSE_SERVER_URL,
	getSessionToken,
} from "@/lib/ai-video/core/license-relay";

export interface CloudReviewSnapshot {
	package: ReviewPackage;
	revision: number;
	updatedAt: string;
}

export interface CloudReviewShare extends CloudReviewSnapshot {
	token: string;
	url: string;
}

export type UpdateCloudReviewResult =
	| { snapshot: CloudReviewSnapshot; status: "updated" }
	| { current: CloudReviewSnapshot | null; status: "conflict" };

interface CloudReviewResponse {
	package?: unknown;
	revision?: unknown;
	updatedAt?: unknown;
	token?: unknown;
	url?: unknown;
}

const REVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function parseSnapshot({ value }: { value: CloudReviewResponse }) {
	if (
		!isReviewPackage({ value: value.package }) ||
		typeof value.revision !== "number" ||
		!Number.isInteger(value.revision) ||
		value.revision < 1 ||
		typeof value.updatedAt !== "string"
	) {
		throw new Error("Review server returned an invalid snapshot");
	}
	return {
		package: value.package as ReviewPackage,
		revision: value.revision,
		updatedAt: value.updatedAt,
	} satisfies CloudReviewSnapshot;
}

async function responseBody({ response }: { response: Response }) {
	return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function responseError({
	body,
	fallback,
}: {
	body: Record<string, unknown>;
	fallback: string;
}) {
	return typeof body.error === "string" && body.error.trim()
		? body.error
		: fallback;
}

export function extractCloudReviewToken({ value }: { value: string }) {
	const candidate = value.trim();
	if (REVIEW_TOKEN_PATTERN.test(candidate)) return candidate;
	try {
		const url = new URL(candidate);
		const route = `${url.pathname}${url.hash}`;
		const match = route.match(/\/review\/([^/?#]+)/);
		const token = match?.[1] ? decodeURIComponent(match[1]) : "";
		return REVIEW_TOKEN_PATTERN.test(token) ? token : null;
	} catch {
		return null;
	}
}

export async function createCloudReview({
	reviewPackage,
	signal,
}: {
	reviewPackage: ReviewPackage;
	signal?: AbortSignal;
}): Promise<CloudReviewShare> {
	const token = await getSessionToken();
	if (!token) throw new Error("Sign in to create a review link");
	const response = await fetch(`${LICENSE_SERVER_URL}/api/reviews`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ package: reviewPackage }),
		signal,
	});
	const body = await responseBody({ response });
	if (!response.ok) {
		throw new Error(
			responseError({ body, fallback: "Failed to create review link" })
		);
	}
	const snapshot = parseSnapshot({ value: body });
	if (typeof body.token !== "string" || typeof body.url !== "string") {
		throw new Error("Review server returned an invalid share link");
	}
	return { ...snapshot, token: body.token, url: body.url };
}

export async function loadCloudReview({
	token,
	signal,
}: {
	token: string;
	signal?: AbortSignal;
}): Promise<CloudReviewSnapshot> {
	const response = await fetch(
		`${LICENSE_SERVER_URL}/api/reviews/${encodeURIComponent(token)}`,
		{ signal }
	);
	const body = await responseBody({ response });
	if (!response.ok) {
		throw new Error(responseError({ body, fallback: "Review link not found" }));
	}
	return parseSnapshot({ value: body });
}

export async function updateCloudReview({
	token,
	baseRevision,
	reviewPackage,
	signal,
}: {
	token: string;
	baseRevision: number;
	reviewPackage: ReviewPackage;
	signal?: AbortSignal;
}): Promise<UpdateCloudReviewResult> {
	const response = await fetch(
		`${LICENSE_SERVER_URL}/api/reviews/${encodeURIComponent(token)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ baseRevision, package: reviewPackage }),
			signal,
		}
	);
	const body = await responseBody({ response });
	if (response.status === 409) {
		const current = body.current;
		if (!current || typeof current !== "object") {
			return { current: null, status: "conflict" };
		}
		return {
			current: parseSnapshot({ value: current as CloudReviewResponse }),
			status: "conflict",
		};
	}
	if (!response.ok) {
		throw new Error(responseError({ body, fallback: "Failed to sync review" }));
	}
	return { snapshot: parseSnapshot({ value: body }), status: "updated" };
}

export async function syncCloudReview({
	token,
	baseRevision,
	reviewPackage,
	signal,
}: {
	token: string;
	baseRevision: number;
	reviewPackage: ReviewPackage;
	signal?: AbortSignal;
}): Promise<CloudReviewSnapshot> {
	const first = await updateCloudReview({
		token,
		baseRevision,
		reviewPackage,
		signal,
	});
	if (first.status === "updated") return first.snapshot;
	if (!first.current) throw new Error("Review changed and could not be merged");
	const mergedPackage: ReviewPackage = {
		...reviewPackage,
		comments: mergeReviewComments({
			local: reviewPackage.comments,
			remote: first.current.package.comments,
		}),
		createdAt: Math.max(
			reviewPackage.createdAt,
			first.current.package.createdAt
		),
	};
	const retry = await updateCloudReview({
		token,
		baseRevision: first.current.revision,
		reviewPackage: mergedPackage,
		signal,
	});
	if (retry.status === "updated") return retry.snapshot;
	throw new Error("Review changed again while merging; retry sync");
}

export async function revokeCloudReview({
	token,
	signal,
}: {
	token: string;
	signal?: AbortSignal;
}) {
	const sessionToken = await getSessionToken();
	if (!sessionToken) throw new Error("Sign in to revoke a review link");
	const response = await fetch(
		`${LICENSE_SERVER_URL}/api/reviews/${encodeURIComponent(token)}`,
		{
			method: "DELETE",
			headers: { Authorization: `Bearer ${sessionToken}` },
			signal,
		}
	);
	if (response.ok) return;
	const body = await responseBody({ response });
	throw new Error(responseError({ body, fallback: "Failed to revoke review" }));
}
