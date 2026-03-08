import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db/drizzle";
import { accounts } from "@qcut/db/schema";

const youtubeRoutes = new Hono();

youtubeRoutes.use("/*", authMiddleware);

/** Refresh an expired Google access token using the stored refresh token. */
async function refreshGoogleToken({
	refreshToken,
}: {
	refreshToken: string;
}): Promise<{
	accessToken: string;
	expiresIn: number;
} | null> {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		return null;
	}

	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});

	if (!response.ok) {
		return null;
	}

	const body = (await response.json()) as {
		access_token?: string;
		expires_in?: number;
	};
	if (!body.access_token) {
		return null;
	}

	return {
		accessToken: body.access_token,
		expiresIn: body.expires_in ?? 3600,
	};
}

/**
 * GET /api/youtube/token
 * Returns the user's Google access token for YouTube API calls.
 * Refreshes automatically if expired.
 */
youtubeRoutes.get("/token", async (c) => {
	try {
		const userId = c.get("userId") as string;

		const [account] = await db
			.select({
				accessToken: accounts.accessToken,
				refreshToken: accounts.refreshToken,
				accessTokenExpiresAt: accounts.accessTokenExpiresAt,
			})
			.from(accounts)
			.where(
				and(eq(accounts.userId, userId), eq(accounts.providerId, "google")),
			)
			.limit(1);

		if (!account) {
			return c.json(
				{ error: "No Google account linked. Please sign in with Google." },
				403,
			);
		}

		// Check if token is still valid (with 5min buffer)
		const isExpired =
			!account.accessToken ||
			!account.accessTokenExpiresAt ||
			account.accessTokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

		if (!isExpired && account.accessToken) {
			return c.json({ accessToken: account.accessToken });
		}

		// Refresh the token
		if (!account.refreshToken) {
			return c.json(
				{
					error:
						"Google refresh token not available. Please re-authenticate with Google.",
				},
				403,
			);
		}

		const refreshed = await refreshGoogleToken({
			refreshToken: account.refreshToken,
		});
		if (!refreshed) {
			return c.json(
				{
					error:
						"Failed to refresh Google token. Please re-authenticate with Google.",
				},
				403,
			);
		}

		// Update the stored token
		await db
			.update(accounts)
			.set({
				accessToken: refreshed.accessToken,
				accessTokenExpiresAt: new Date(
					Date.now() + refreshed.expiresIn * 1000,
				),
			})
			.where(
				and(eq(accounts.userId, userId), eq(accounts.providerId, "google")),
			);

		return c.json({ accessToken: refreshed.accessToken });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to get YouTube token: ${error.message}`
						: "Failed to get YouTube token",
			},
			500,
		);
	}
});

export { youtubeRoutes };
