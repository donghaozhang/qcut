import { eq } from "drizzle-orm";
import { db } from "@qcut/db";
import { users } from "@qcut/db/schema";
import { isCanaryModeEnabled, isEmailAllowedForCanary } from "./payment-config";

async function getUserEmailById({
	userId,
}: {
	userId: string;
}): Promise<string | null> {
	try {
		const [user] = await db
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user?.email) {
			return null;
		}
		return user.email.trim().toLowerCase();
	} catch (error) {
		throw new Error(
			`Failed to load user email for canary guard: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function ensureCanaryUserAllowed({
	userId,
}: {
	userId: string;
}): Promise<
	{ allowed: true } | { allowed: false; status: number; error: string }
> {
	try {
		if (!isCanaryModeEnabled()) {
			return { allowed: true };
		}

		const email = await getUserEmailById({ userId });
		if (!isEmailAllowedForCanary({ email })) {
			return {
				allowed: false,
				status: 403,
				error: "Payments are currently restricted to internal tester accounts",
			};
		}
		return { allowed: true };
	} catch (error) {
		return {
			allowed: false,
			status: 500,
			error:
				error instanceof Error
					? error.message
					: "Failed to validate canary allowlist",
		};
	}
}
