import { create } from "zustand";
import { generateUUID } from "@/lib/utils";
import type {
	PortableReviewComment,
	ReviewPackage,
} from "@/lib/review/review-share";
import {
	MAX_REVIEW_COMMENT_LENGTH,
	MAX_REVIEW_COMMENTS,
} from "@qcut/editor-core/collaboration";

export interface ReviewComment extends PortableReviewComment {
	projectId: string;
}

interface ReviewState {
	comments: ReviewComment[];
	currentProjectId: string | null;
	addComment: ({
		author,
		text,
		time,
	}: {
		author: string;
		text: string;
		time: number;
	}) => string | null;
	loadProject: ({ projectId }: { projectId: string }) => void;
	mergePackage: ({ reviewPackage }: { reviewPackage: ReviewPackage }) => number;
	removeComment: ({ commentId }: { commentId: string }) => void;
	toggleResolved: ({ commentId }: { commentId: string }) => void;
}

function storageKey({ projectId }: { projectId: string }) {
	return `qcut-review-comments:${encodeURIComponent(projectId)}`;
}

function readComments({ projectId }: { projectId: string }): ReviewComment[] {
	try {
		const raw = localStorage.getItem(storageKey({ projectId }));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(comment): comment is ReviewComment =>
					Boolean(comment) &&
					typeof comment === "object" &&
					typeof comment.id === "string" &&
					typeof comment.text === "string" &&
					typeof comment.time === "number" &&
					typeof comment.resolved === "boolean"
			)
			.slice(0, MAX_REVIEW_COMMENTS);
	} catch {
		return [];
	}
}

function writeComments({
	comments,
	projectId,
}: {
	comments: ReviewComment[];
	projectId: string;
}) {
	try {
		localStorage.setItem(
			storageKey({ projectId }),
			JSON.stringify(comments.slice(0, MAX_REVIEW_COMMENTS))
		);
	} catch {
		return;
	}
}

export const useReviewStore = create<ReviewState>((set, get) => ({
	comments: [],
	currentProjectId: null,

	loadProject: ({ projectId }) => {
		set({ comments: readComments({ projectId }), currentProjectId: projectId });
	},

	addComment: ({ author, text, time }) => {
		const { comments, currentProjectId } = get();
		const normalizedText = text.trim().slice(0, MAX_REVIEW_COMMENT_LENGTH);
		if (!currentProjectId || !normalizedText || !Number.isFinite(time))
			return null;
		if (comments.length >= MAX_REVIEW_COMMENTS) return null;
		const now = Date.now();
		const id = generateUUID();
		const comment: ReviewComment = {
			author: author.trim() || "Editor",
			createdAt: now,
			id,
			projectId: currentProjectId,
			resolved: false,
			text: normalizedText,
			time: Math.max(0, time),
			updatedAt: now,
		};
		const nextComments = [...comments, comment]
			.sort((left, right) => left.time - right.time)
			.slice(0, MAX_REVIEW_COMMENTS);
		writeComments({ comments: nextComments, projectId: currentProjectId });
		set({ comments: nextComments });
		return id;
	},

	toggleResolved: ({ commentId }) => {
		const { comments, currentProjectId } = get();
		if (!currentProjectId) return;
		const nextComments = comments.map((comment) =>
			comment.id === commentId
				? {
						...comment,
						resolved: !comment.resolved,
						updatedAt: Date.now(),
					}
				: comment
		);
		writeComments({ comments: nextComments, projectId: currentProjectId });
		set({ comments: nextComments });
	},

	removeComment: ({ commentId }) => {
		const { comments, currentProjectId } = get();
		if (!currentProjectId) return;
		const nextComments = comments.filter((comment) => comment.id !== commentId);
		writeComments({ comments: nextComments, projectId: currentProjectId });
		set({ comments: nextComments });
	},

	mergePackage: ({ reviewPackage }) => {
		const { comments, currentProjectId } = get();
		if (!currentProjectId) return 0;
		const commentsById = new Map(
			comments.map((comment) => [comment.id, comment])
		);
		let mergedCount = 0;
		for (const incoming of reviewPackage.comments) {
			const existing = commentsById.get(incoming.id);
			if (existing && existing.updatedAt >= incoming.updatedAt) continue;
			commentsById.set(incoming.id, {
				...incoming,
				projectId: currentProjectId,
				text: incoming.text.trim().slice(0, MAX_REVIEW_COMMENT_LENGTH),
				time: Math.max(0, incoming.time),
			});
			mergedCount += 1;
		}
		const nextComments = [...commentsById.values()]
			.sort((left, right) => left.time - right.time)
			.slice(0, MAX_REVIEW_COMMENTS);
		writeComments({ comments: nextComments, projectId: currentProjectId });
		set({ comments: nextComments });
		return mergedCount;
	},
}));
