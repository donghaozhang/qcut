import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/admin-auth";
import { db } from "../db/drizzle";
import { users, licenses } from "@qcut/db/schema";
import {
	addTopUpCreditsForUser,
	getCreditBalanceByUserId,
	resetPlanCreditsForUser,
} from "../services/credit-service";

const adminRoutes = new Hono();

adminRoutes.use("/*", adminAuthMiddleware);

/** Look up a user by email. Returns user ID, plan, and credit balance. */
adminRoutes.get("/user", async (c) => {
	try {
		const email = c.req.query("email")?.trim().toLowerCase();
		if (!email) {
			return c.json({ error: "email query parameter is required" }, 400);
		}

		const [user] = await db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (!user) {
			return c.json({ error: `No user found with email: ${email}` }, 404);
		}

		const [license] = await db
			.select({ plan: licenses.plan, status: licenses.status })
			.from(licenses)
			.where(eq(licenses.userId, user.id))
			.limit(1);

		const credits = await getCreditBalanceByUserId({ userId: user.id });

		return c.json({
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				plan: license?.plan ?? "free",
				status: license?.status ?? "none",
			},
			credits,
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to look up user",
			},
			500
		);
	}
});

/** Grant top-up credits to one or more users by email. */
adminRoutes.post("/grant-credits", async (c) => {
	try {
		const payload = await c.req.json();
		const emails: string[] = Array.isArray(payload?.emails)
			? payload.emails
			: typeof payload?.email === "string"
				? [payload.email]
				: [];
		const amount = Number(payload?.amount);
		const description =
			typeof payload?.description === "string"
				? payload.description.trim()
				: "Admin credit grant";

		if (emails.length === 0) {
			return c.json(
				{ error: "emails (array) or email (string) is required" },
				400
			);
		}
		if (!Number.isFinite(amount) || amount <= 0) {
			return c.json({ error: "amount must be a positive number" }, 400);
		}

		// Validate and de-duplicate
		const uniqueEmails = [
			...new Set(
				emails
					.filter(
						(e): e is string => typeof e === "string" && e.trim().length > 0
					)
					.map((e) => e.trim().toLowerCase())
			),
		];
		if (uniqueEmails.length === 0) {
			return c.json({ error: "No valid email addresses provided" }, 400);
		}

		const results: Array<{
			email: string;
			success: boolean;
			credits?: { totalCredits: number };
			error?: string;
		}> = [];

		for (const email of uniqueEmails) {
			try {
				const [user] = await db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.email, email))
					.limit(1);

				if (!user) {
					results.push({ email, success: false, error: "User not found" });
					continue;
				}

				const balance = await addTopUpCreditsForUser({
					userId: user.id,
					credits: amount,
					description,
				});

				results.push({
					email,
					success: true,
					credits: { totalCredits: balance.totalCredits },
				});
			} catch (error) {
				results.push({
					email,
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		const succeeded = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		return c.json({
			summary: { succeeded, failed, total: results.length },
			results,
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to grant credits",
			},
			500
		);
	}
});

/** Upgrade a user's plan by email. */
adminRoutes.post("/upgrade-plan", async (c) => {
	try {
		const payload = await c.req.json();
		const email =
			typeof payload?.email === "string"
				? payload.email.trim().toLowerCase()
				: "";
		const plan = payload?.plan;

		if (email.length === 0) {
			return c.json({ error: "email is required" }, 400);
		}
		if (plan !== "free" && plan !== "pro" && plan !== "team") {
			return c.json({ error: 'plan must be "free", "pro", or "team"' }, 400);
		}

		const maxDevices = plan === "team" ? 10 : plan === "pro" ? 3 : 1;

		const [user] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (!user) {
			return c.json({ error: `No user found with email: ${email}` }, 404);
		}

		const [license] = await db
			.select({ id: licenses.id })
			.from(licenses)
			.where(eq(licenses.userId, user.id))
			.limit(1);

		if (!license) {
			return c.json({ error: "User has no license record" }, 404);
		}

		await db
			.update(licenses)
			.set({ plan, maxDevices, updatedAt: new Date() })
			.where(eq(licenses.id, license.id));

		let credits;
		try {
			credits = await resetPlanCreditsForUser({
				userId: user.id,
				plan,
				description: `Admin upgraded plan to ${plan}`,
			});
		} catch (creditError) {
			// Roll back the plan change if credit reset fails
			await db
				.update(licenses)
				.set({ plan: "free", maxDevices: 1, updatedAt: new Date() })
				.where(eq(licenses.id, license.id));
			throw creditError;
		}

		return c.json({
			success: true,
			user: { email, plan, maxDevices },
			credits,
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to upgrade plan",
			},
			500
		);
	}
});

export { adminRoutes };
