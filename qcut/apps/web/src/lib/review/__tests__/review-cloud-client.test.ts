import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewPackage } from "@qcut/editor-core/collaboration";

vi.mock("@/lib/ai-video/core/license-relay", () => ({
	LICENSE_SERVER_URL: "https://license.example.com",
	getSessionToken: vi.fn().mockResolvedValue("session-token"),
}));

const { createCloudReview, extractCloudReviewToken, syncCloudReview } =
	await import("../review-cloud-client");

function reviewPackage({
	comments = [],
}: {
	comments?: ReviewPackage["comments"];
} = {}): ReviewPackage {
	return {
		comments,
		createdAt: 100,
		project: { duration: 10, id: "project-1", name: "Review project" },
		version: 1,
	};
}

function response({ body, status = 200 }: { body: unknown; status?: number }) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("cloud review client", () => {
	it("extracts tokens from raw values and hash-routed links", () => {
		expect(extractCloudReviewToken({ value: "public_review-token-1234" })).toBe(
			"public_review-token-1234"
		);
		expect(
			extractCloudReviewToken({
				value: "https://qcut.app/#/review/public_review-token-1234",
			})
		).toBe("public_review-token-1234");
		expect(extractCloudReviewToken({ value: "not a link" })).toBeNull();
	});

	it("creates an authenticated review link", async () => {
		const review = reviewPackage();
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			response({
				body: {
					package: review,
					revision: 1,
					token: "public_review-token-1234",
					updatedAt: "2026-07-13T00:00:00.000Z",
					url: "https://qcut.app/#/review/public_review-token-1234",
				},
			})
		);
		const share = await createCloudReview({ reviewPackage: review });
		expect(share.revision).toBe(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://license.example.com/api/reviews",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer session-token",
				}),
			})
		);
	});

	it("merges a conflict and retries against the authoritative revision", async () => {
		const localComment = {
			author: "Local",
			createdAt: 100,
			id: "local",
			resolved: false,
			text: "Local note",
			time: 2,
			updatedAt: 200,
		};
		const remoteComment = {
			author: "Remote",
			createdAt: 110,
			id: "remote",
			resolved: false,
			text: "Remote note",
			time: 3,
			updatedAt: 210,
		};
		const local = reviewPackage({ comments: [localComment] });
		const remote = reviewPackage({ comments: [remoteComment] });
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				response({
					status: 409,
					body: {
						conflict: true,
						current: {
							package: remote,
							revision: 4,
							updatedAt: "2026-07-13T00:01:00.000Z",
						},
					},
				})
			)
			.mockResolvedValueOnce(
				response({
					body: {
						package: reviewPackage({ comments: [localComment, remoteComment] }),
						revision: 5,
						updatedAt: "2026-07-13T00:02:00.000Z",
					},
				})
			);
		const snapshot = await syncCloudReview({
			token: "public_review-token-1234",
			baseRevision: 3,
			reviewPackage: local,
		});
		expect(snapshot.revision).toBe(5);
		expect(snapshot.package.comments.map((comment) => comment.id)).toEqual([
			"local",
			"remote",
		]);
		const retryRequest = fetchMock.mock.calls[1]?.[1];
		const retryBody = JSON.parse(String(retryRequest?.body));
		expect(retryBody.baseRevision).toBe(4);
		expect(retryBody.package.comments).toHaveLength(2);
	});
});
