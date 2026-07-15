import { Hono } from "hono";
import {
	isReviewPackage,
	type ReviewPackage,
} from "@qcut/editor-core/collaboration";
import { authMiddleware } from "../middleware/auth";
import {
	createReviewShare,
	getReviewShare,
	revokeReviewShare,
	updateReviewShare,
	type ReviewShare,
} from "../services/review-share-service";

const MAX_REVIEW_PACKAGE_BYTES = 1_024 * 1_024;

function serializedBytes({ value }: { value: unknown }): number {
	try {
		return new TextEncoder().encode(JSON.stringify(value)).byteLength;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

function reviewPackageFromShare({
	share,
}: {
	share: ReviewShare;
}): ReviewPackage | null {
	return isReviewPackage({ value: share.package })
		? (share.package as unknown as ReviewPackage)
		: null;
}

function reviewResponse({ share }: { share: ReviewShare }) {
	return {
		package: reviewPackageFromShare({ share }),
		revision: share.revision,
		updatedAt: share.updatedAt.toISOString(),
	};
}

function shareUrl({ token }: { token: string }): string {
	const baseUrl = (
		process.env.REVIEW_WEB_BASE_URL || "https://qcut.app"
	).replace(/\/$/, "");
	return `${baseUrl}/#/review/${encodeURIComponent(token)}`;
}

const reviewRoutes = new Hono();

reviewRoutes.post("/", authMiddleware, async (c) => {
	try {
		const body = (await c.req.json()) as Record<string, unknown>;
		if (
			serializedBytes({ value: body.package }) > MAX_REVIEW_PACKAGE_BYTES ||
			!isReviewPackage({ value: body.package })
		) {
			return c.json({ error: "Invalid review package" }, 400);
		}
		const result = await createReviewShare({
			ownerUserId: c.get("userId") as string,
			reviewPackage: body.package as ReviewPackage,
		});
		return c.json({
			...reviewResponse({ share: result.share }),
			token: result.token,
			url: shareUrl({ token: result.token }),
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to create review share",
			},
			500
		);
	}
});

reviewRoutes.get("/:token", async (c) => {
	try {
		const token = c.req.param("token");
		if (token.length < 16 || token.length > 200) {
			return c.json({ error: "Review share not found" }, 404);
		}
		const share = await getReviewShare({ token });
		if (!share) return c.json({ error: "Review share not found" }, 404);
		const response = reviewResponse({ share });
		if (!response.package) {
			return c.json({ error: "Stored review package is invalid" }, 500);
		}
		return c.json(response);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load review share",
			},
			500
		);
	}
});

reviewRoutes.post("/:token", async (c) => {
	try {
		const body = (await c.req.json()) as Record<string, unknown>;
		if (
			typeof body.baseRevision !== "number" ||
			!Number.isInteger(body.baseRevision) ||
			body.baseRevision < 1
		) {
			return c.json({ error: "baseRevision must be a positive integer" }, 400);
		}
		if (
			serializedBytes({ value: body.package }) > MAX_REVIEW_PACKAGE_BYTES ||
			!isReviewPackage({ value: body.package })
		) {
			return c.json({ error: "Invalid review package" }, 400);
		}
		const result = await updateReviewShare({
			token: c.req.param("token"),
			baseRevision: body.baseRevision,
			reviewPackage: body.package as ReviewPackage,
		});
		if (result.status === "not-found") {
			return c.json({ error: "Review share not found" }, 404);
		}
		if (result.status === "conflict") {
			return c.json(
				{
					conflict: true,
					current: result.current
						? reviewResponse({ share: result.current })
						: null,
				},
				409
			);
		}
		return c.json(reviewResponse({ share: result.share }));
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to update review share",
			},
			500
		);
	}
});

reviewRoutes.delete("/:token", authMiddleware, async (c) => {
	try {
		const revoked = await revokeReviewShare({
			token: c.req.param("token"),
			ownerUserId: c.get("userId") as string,
		});
		if (!revoked) return c.json({ error: "Review share not found" }, 404);
		return c.json({ success: true });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to revoke review share",
			},
			500
		);
	}
});

export { reviewRoutes };
