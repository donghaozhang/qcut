import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { ReviewPackage } from "@qcut/editor-core/collaboration";

vi.mock("../services/review-share-service", () => ({
	createReviewShare: vi.fn(),
	getReviewShare: vi.fn(),
	revokeReviewShare: vi.fn(),
	updateReviewShare: vi.fn(),
}));

const reviewService = await import("../services/review-share-service");
const { reviewRoutes } = await import("./reviews");

const reviewPackage: ReviewPackage = {
	comments: [
		{
			author: "Reviewer",
			createdAt: 100,
			id: "comment-1",
			resolved: false,
			text: "Trim this beat",
			time: 2.5,
			updatedAt: 100,
		},
	],
	createdAt: 100,
	project: {
		duration: 12,
		id: "project-1",
		name: "Launch cut",
	},
	version: 1,
};

function reviewShare({ revision = 1 }: { revision?: number } = {}) {
	return {
		id: "share-1",
		ownerUserId: "mock-user-001",
		tokenHash: "hashed-token",
		projectId: reviewPackage.project.id,
		projectName: reviewPackage.project.name,
		durationMs: 12_000,
		package: reviewPackage as unknown as Record<string, unknown>,
		revision,
		status: "active" as const,
		expiresAt: null,
		createdAt: new Date("2026-07-13T00:00:00.000Z"),
		updatedAt: new Date("2026-07-13T00:01:00.000Z"),
	};
}

function buildApp() {
	const app = new Hono();
	app.route("/api/reviews", reviewRoutes);
	return app;
}

function jsonRequest({
	path,
	method,
	body,
}: {
	path: string;
	method: "POST" | "DELETE";
	body?: unknown;
}) {
	return buildApp().request(path, {
		method,
		headers: {
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

beforeEach(() => {
	process.env.MOCK_MODE = "true";
	process.env.REVIEW_WEB_BASE_URL = "https://review.example.com";
	vi.clearAllMocks();
});

describe("review collaboration routes", () => {
	it("creates an authenticated share with a public URL", async () => {
		vi.mocked(reviewService.createReviewShare).mockResolvedValue({
			share: reviewShare(),
			token: "public-review-token-1234",
		});
		const response = await jsonRequest({
			path: "/api/reviews",
			method: "POST",
			body: { package: reviewPackage },
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.url).toBe(
			"https://review.example.com/#/review/public-review-token-1234"
		);
		expect(body.revision).toBe(1);
		expect(reviewService.createReviewShare).toHaveBeenCalledWith({
			ownerUserId: "mock-user-001",
			reviewPackage,
		});
	});

	it("rejects malformed or oversized review data", async () => {
		const malformed = await jsonRequest({
			path: "/api/reviews",
			method: "POST",
			body: { package: { version: 1 } },
		});
		const oversized = await jsonRequest({
			path: "/api/reviews",
			method: "POST",
			body: {
				package: {
					...reviewPackage,
					project: { ...reviewPackage.project, name: "x".repeat(1_100_000) },
				},
			},
		});
		expect(malformed.status).toBe(400);
		expect(oversized.status).toBe(400);
		expect(reviewService.createReviewShare).not.toHaveBeenCalled();
	});

	it("loads a share without authentication", async () => {
		vi.mocked(reviewService.getReviewShare).mockResolvedValue(reviewShare());
		const response = await buildApp().request(
			"/api/reviews/public-review-token-1234"
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.package.project.name).toBe("Launch cut");
		expect(body.revision).toBe(1);
	});

	it("returns the authoritative package on a revision conflict", async () => {
		vi.mocked(reviewService.updateReviewShare).mockResolvedValue({
			current: reviewShare({ revision: 3 }),
			status: "conflict",
		});
		const response = await jsonRequest({
			path: "/api/reviews/public-review-token-1234",
			method: "POST",
			body: { baseRevision: 2, package: reviewPackage },
		});
		expect(response.status).toBe(409);
		const body = await response.json();
		expect(body.conflict).toBe(true);
		expect(body.current.revision).toBe(3);
	});

	it("revokes only an owned active share", async () => {
		vi.mocked(reviewService.revokeReviewShare).mockResolvedValue(true);
		const response = await jsonRequest({
			path: "/api/reviews/public-review-token-1234",
			method: "DELETE",
		});
		expect(response.status).toBe(200);
		expect(reviewService.revokeReviewShare).toHaveBeenCalledWith({
			ownerUserId: "mock-user-001",
			token: "public-review-token-1234",
		});
	});
});
