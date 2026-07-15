import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewPackage } from "@/lib/review/review-share";
import { useReviewStore } from "../review-store";

describe("review store", () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		vi.mocked(localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
		useReviewStore.setState({ comments: [], currentProjectId: null });
		vi.spyOn(Date, "now").mockReturnValue(1_000);
	});

	afterEach(() => vi.restoreAllMocks());

	it("persists sorted timecode comments per project", () => {
		const store = useReviewStore.getState();
		store.loadProject({ projectId: "project-1" });
		store.addComment({ author: "Peter", text: "Later", time: 8 });
		store.addComment({ author: "Peter", text: "Earlier", time: 2 });

		expect(
			useReviewStore.getState().comments.map((comment) => comment.text)
		).toEqual(["Earlier", "Later"]);
		useReviewStore.setState({ comments: [] });
		useReviewStore.getState().loadProject({ projectId: "project-1" });
		expect(useReviewStore.getState().comments).toHaveLength(2);
	});

	it("resolves, reopens, and removes comments", () => {
		const store = useReviewStore.getState();
		store.loadProject({ projectId: "project-1" });
		const commentId = store.addComment({
			author: "Editor",
			text: "Fix",
			time: 3,
		});
		expect(commentId).toBeTruthy();

		useReviewStore.getState().toggleResolved({ commentId: commentId! });
		expect(useReviewStore.getState().comments[0].resolved).toBe(true);
		useReviewStore.getState().toggleResolved({ commentId: commentId! });
		expect(useReviewStore.getState().comments[0].resolved).toBe(false);
		useReviewStore.getState().removeComment({ commentId: commentId! });
		expect(useReviewStore.getState().comments).toEqual([]);
	});

	it("merges only new or newer portable comments into the active project", () => {
		useReviewStore.getState().loadProject({ projectId: "target-project" });
		const reviewPackage: ReviewPackage = {
			comments: [
				{
					author: "Reviewer",
					createdAt: 100,
					id: "remote-1",
					resolved: false,
					text: "Tighten this cut",
					time: 5,
					updatedAt: 200,
				},
			],
			createdAt: 200,
			project: { duration: 10, id: "source-project", name: "Source" },
			version: 1,
		};

		expect(useReviewStore.getState().mergePackage({ reviewPackage })).toBe(1);
		expect(useReviewStore.getState().comments[0]).toEqual(
			expect.objectContaining({
				id: "remote-1",
				projectId: "target-project",
			})
		);
		expect(useReviewStore.getState().mergePackage({ reviewPackage })).toBe(0);
	});

	it("rejects blank comments and invalid times without writing history", () => {
		const store = useReviewStore.getState();
		store.loadProject({ projectId: "project-1" });
		expect(
			store.addComment({ author: "Editor", text: "   ", time: 1 })
		).toBeNull();
		expect(
			store.addComment({ author: "Editor", text: "Comment", time: Number.NaN })
		).toBeNull();
		expect(useReviewStore.getState().comments).toEqual([]);
	});
});
