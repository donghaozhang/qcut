export const REVIEW_PACKAGE_VERSION = 1 as const;
export const MAX_REVIEW_COMMENTS = 500;
export const MAX_REVIEW_COMMENT_LENGTH = 2_000;

export interface PortableReviewComment {
	author: string;
	createdAt: number;
	id: string;
	resolved: boolean;
	text: string;
	time: number;
	updatedAt: number;
}

export interface ReviewPackage {
	comments: PortableReviewComment[];
	createdAt: number;
	project: {
		duration: number;
		id: string;
		mediaUrl?: string;
		name: string;
	};
	version: typeof REVIEW_PACKAGE_VERSION;
}

function isFiniteNonNegativeNumber({ value }: { value: unknown }): boolean {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isPortableReviewComment({
	value,
}: {
	value: unknown;
}): boolean {
	if (!value || typeof value !== "object") return false;
	const comment = value as Record<string, unknown>;
	return (
		typeof comment.id === "string" &&
		comment.id.length > 0 &&
		typeof comment.text === "string" &&
		comment.text.trim().length > 0 &&
		comment.text.length <= MAX_REVIEW_COMMENT_LENGTH &&
		typeof comment.author === "string" &&
		comment.author.length <= 160 &&
		isFiniteNonNegativeNumber({ value: comment.time }) &&
		isFiniteNonNegativeNumber({ value: comment.createdAt }) &&
		isFiniteNonNegativeNumber({ value: comment.updatedAt }) &&
		typeof comment.resolved === "boolean"
	);
}

export function isReviewPackage({ value }: { value: unknown }): boolean {
	if (!value || typeof value !== "object") return false;
	const reviewPackage = value as Record<string, unknown>;
	if (!reviewPackage.project || typeof reviewPackage.project !== "object") {
		return false;
	}
	const project = reviewPackage.project as Record<string, unknown>;
	const mediaUrlValid =
		project.mediaUrl === undefined ||
		(typeof project.mediaUrl === "string" &&
			project.mediaUrl.length <= 8_000 &&
			/^https:\/\//i.test(project.mediaUrl));
	return (
		reviewPackage.version === REVIEW_PACKAGE_VERSION &&
		isFiniteNonNegativeNumber({ value: reviewPackage.createdAt }) &&
		typeof project.id === "string" &&
		project.id.length > 0 &&
		project.id.length <= 200 &&
		typeof project.name === "string" &&
		project.name.trim().length > 0 &&
		project.name.length <= 300 &&
		isFiniteNonNegativeNumber({ value: project.duration }) &&
		mediaUrlValid &&
		Array.isArray(reviewPackage.comments) &&
		reviewPackage.comments.length <= MAX_REVIEW_COMMENTS &&
		reviewPackage.comments.every((comment) =>
			isPortableReviewComment({ value: comment })
		)
	);
}

export function mergeReviewComments({
	local,
	remote,
}: {
	local: PortableReviewComment[];
	remote: PortableReviewComment[];
}): PortableReviewComment[] {
	const byId = new Map<string, PortableReviewComment>();
	for (const comment of [...remote, ...local]) {
		const existing = byId.get(comment.id);
		if (existing && existing.updatedAt > comment.updatedAt) continue;
		byId.set(comment.id, comment);
	}
	return [...byId.values()]
		.sort((left, right) => left.time - right.time)
		.slice(0, MAX_REVIEW_COMMENTS);
}
