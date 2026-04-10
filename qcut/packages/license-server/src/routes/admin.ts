import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { adminAuthMiddleware } from "../middleware/admin-auth";
import { db } from "../db/drizzle";
import { users, licenses, accounts, sessions } from "@qcut/db/schema";
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
		let payload: Record<string, unknown>;
		try {
			payload = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}
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
		let payload: Record<string, unknown>;
		try {
			payload = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}
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
			.select({
				id: licenses.id,
				plan: licenses.plan,
				maxDevices: licenses.maxDevices,
			})
			.from(licenses)
			.where(eq(licenses.userId, user.id))
			.limit(1);

		if (!license) {
			return c.json({ error: "User has no license record" }, 404);
		}

		if (license.plan === plan) {
			const credits = await getCreditBalanceByUserId({ userId: user.id });
			return c.json({
				success: true,
				user: { email, plan, maxDevices },
				credits,
				note: "Plan unchanged — no credit reset performed",
			});
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
			// Roll back to the original plan if credit reset fails
			await db
				.update(licenses)
				.set({
					plan: license.plan,
					maxDevices: license.maxDevices,
					updatedAt: new Date(),
				})
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

/** Hash a password using the same scrypt params as Better Auth. */
async function hashPassword(password: string): Promise<string> {
	const { scryptAsync } = await import("@noble/hashes/scrypt");
	const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const key = await scryptAsync(password.normalize("NFKC"), salt, {
		N: 16384,
		r: 16,
		p: 1,
		dkLen: 64,
		maxmem: 128 * 16384 * 16 * 2,
	});
	const keyHex = Array.from(new Uint8Array(key))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${salt}:${keyHex}`;
}

/** Generate a random ID for database records. */
function generateId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(16)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Create a test user with email/password. Returns a session token for immediate use. */
adminRoutes.post("/create-user", async (c) => {
	try {
		let payload: Record<string, unknown>;
		try {
			payload = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		const name = typeof payload?.name === "string" ? payload.name.trim() : "";
		const email =
			typeof payload?.email === "string"
				? payload.email.trim().toLowerCase()
				: "";
		const password =
			typeof payload?.password === "string" ? payload.password : "";
		const passwordHash =
			typeof payload?.passwordHash === "string" ? payload.passwordHash : "";

		if (name.length === 0) {
			return c.json({ error: "name is required" }, 400);
		}
		if (email.length === 0) {
			return c.json({ error: "email is required" }, 400);
		}
		if (passwordHash.length === 0 && password.length < 6) {
			return c.json(
				{ error: "password (or passwordHash) must be provided" },
				400
			);
		}

		// Check if user already exists
		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existing) {
			return c.json({ error: `User already exists: ${email}` }, 409);
		}

		const now = new Date();
		const userId = generateId();
		const accountId = generateId();
		const sessionId = generateId();
		const sessionToken = generateId() + generateId();
		const finalHash = passwordHash || (await hashPassword(password));

		// Create user
		await db.insert(users).values({
			id: userId,
			name,
			email,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});

		// Create credential account (email/password)
		await db.insert(accounts).values({
			id: accountId,
			accountId: userId,
			providerId: "credential",
			userId,
			password: finalHash,
			createdAt: now,
			updatedAt: now,
		});

		// Create license
		await db.insert(licenses).values({
			id: generateId(),
			userId,
			plan: "free",
			status: "active",
			maxDevices: 1,
			createdAt: now,
			updatedAt: now,
		});

		// Create session for immediate login
		await db.insert(sessions).values({
			id: sessionId,
			token: sessionToken,
			userId,
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
			createdAt: now,
			updatedAt: now,
		});

		// Initialize credits
		await resetPlanCreditsForUser({
			userId,
			plan: "free",
			description: "Account created via admin API",
		});

		return c.json({
			success: true,
			user: { id: userId, name, email },
			token: sessionToken,
		});
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : "Failed to create user",
			},
			500
		);
	}
});

/** Issue a session token for a user by email. Admin-only, no password check. */
adminRoutes.post("/issue-token", async (c) => {
	try {
		let payload: Record<string, unknown>;
		try {
			payload = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		const email =
			typeof payload?.email === "string"
				? payload.email.trim().toLowerCase()
				: "";
		if (email.length === 0) {
			return c.json({ error: "email is required" }, 400);
		}

		const [user] = await db
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (!user) {
			return c.json({ error: `No user found: ${email}` }, 404);
		}

		const now = new Date();
		const sessionId = generateId();
		const token = generateId() + generateId();

		await db.insert(sessions).values({
			id: sessionId,
			token,
			userId: user.id,
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			createdAt: now,
			updatedAt: now,
		});

		return c.json({ success: true, email, token });
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : "Failed to issue token",
			},
			500
		);
	}
});

export { adminRoutes };
