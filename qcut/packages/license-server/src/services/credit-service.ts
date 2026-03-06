import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@qcut/db";
import { creditBalances, creditTransactions, licenses } from "@qcut/db/schema";

const PLAN_CREDITS: Record<"free" | "pro" | "team", number> = {
	free: 50,
	pro: 500,
	team: 2000,
};

const TOP_UP_PACK_CREDITS: Record<
	"starter" | "standard" | "pro" | "mega",
	number
> = {
	starter: 50,
	standard: 120,
	pro: 350,
	mega: 800,
};

type Plan = keyof typeof PLAN_CREDITS;
type TopUpPack = keyof typeof TOP_UP_PACK_CREDITS;

type CreditBalanceRow = typeof creditBalances.$inferSelect;

type CreditTransactionType =
	| "plan_grant"
	| "top_up"
	| "deduction"
	| "refund"
	| "expiry";

export interface CreditBalanceInfo {
	planCredits: number;
	topUpCredits: number;
	totalCredits: number;
	planCreditsResetAt: string;
}

export interface CreditHistoryItem {
	id: string;
	type: CreditTransactionType;
	amount: number;
	balanceAfter: number;
	description: string | null;
	modelKey: string | null;
	stripePaymentId: string | null;
	createdAt: string;
}

/** Shapes a balance row for API responses. */
function buildCreditBalanceInfo({
	balance,
}: {
	balance: Pick<
		CreditBalanceRow,
		"planCredits" | "topUpCredits" | "planCreditsResetAt"
	>;
}): CreditBalanceInfo {
	const planCredits = balance.planCredits;
	const topUpCredits = balance.topUpCredits;
	return {
		planCredits,
		topUpCredits,
		totalCredits: planCredits + topUpCredits,
		planCreditsResetAt: balance.planCreditsResetAt.toISOString(),
	};
}

/** Schedules the next monthly plan-credit reset. */
function getNextResetAt({ now }: { now: Date }): Date {
	const nextResetAt = new Date(now);
	nextResetAt.setMonth(nextResetAt.getMonth() + 1);
	return nextResetAt;
}

/** Constrains nullable plan strings to supported credit plans. */
function parsePlan({ plan }: { plan: string | null | undefined }): Plan {
	if (plan === "pro" || plan === "team") {
		return plan;
	}
	return "free";
}

/** Reads the current license plan that drives monthly credits. */
async function getPlanByUserId({ userId }: { userId: string }): Promise<Plan> {
	try {
		const [license] = await db
			.select({ plan: licenses.plan })
			.from(licenses)
			.where(eq(licenses.userId, userId))
			.limit(1);
		return parsePlan({ plan: license?.plan });
	} catch (error) {
		throw new Error(
			`Failed to get plan for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Creates the first credit balance and seed grant for a user. */
async function createInitialBalance({
	userId,
	plan,
}: {
	userId: string;
	plan: Plan;
}): Promise<CreditBalanceRow> {
	try {
		const now = new Date();
		const [balance] = await db
			.insert(creditBalances)
			.values({
				id: crypto.randomUUID(),
				userId,
				planCredits: PLAN_CREDITS[plan],
				topUpCredits: 0,
				planCreditsResetAt: getNextResetAt({ now }),
				updatedAt: now,
			})
			.returning();

		if (!balance) {
			throw new Error("Insert returned no balance row");
		}

		await db.insert(creditTransactions).values({
			id: crypto.randomUUID(),
			userId,
			type: "plan_grant",
			amount: PLAN_CREDITS[plan],
			balanceAfter: PLAN_CREDITS[plan],
			description: `Initial ${plan} plan credits`,
		});

		return balance;
	} catch (error) {
		throw new Error(
			`Failed to create initial balance for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Returns the user's balance, creating it on first use. */
async function ensureCreditBalance({
	userId,
}: {
	userId: string;
}): Promise<CreditBalanceRow> {
	try {
		const [existing] = await db
			.select()
			.from(creditBalances)
			.where(eq(creditBalances.userId, userId))
			.limit(1);

		if (existing) {
			return existing;
		}

		const plan = await getPlanByUserId({ userId });
		return await createInitialBalance({ userId, plan });
	} catch (error) {
		throw new Error(
			`Failed to ensure credit balance for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Refreshes monthly plan credits once the reset timestamp passes. */
async function resetPlanCreditsIfDue({
	userId,
	balance,
}: {
	userId: string;
	balance: CreditBalanceRow;
}): Promise<CreditBalanceRow> {
	try {
		const now = new Date();
		if (balance.planCreditsResetAt > now) {
			return balance;
		}

		const plan = await getPlanByUserId({ userId });
		const refreshedPlanCredits = PLAN_CREDITS[plan];
		const [updated] = await db
			.update(creditBalances)
			.set({
				planCredits: refreshedPlanCredits,
				planCreditsResetAt: getNextResetAt({ now }),
				updatedAt: now,
			})
			.where(eq(creditBalances.id, balance.id))
			.returning();

		if (!updated) {
			throw new Error("Plan credit reset update returned no row");
		}

		await db.insert(creditTransactions).values({
			id: crypto.randomUUID(),
			userId,
			type: "plan_grant",
			amount: refreshedPlanCredits,
			balanceAfter: updated.planCredits + updated.topUpCredits,
			description: `${plan} monthly credit reset`,
		});

		return updated;
	} catch (error) {
		throw new Error(
			`Failed to reset plan credits for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Rejects non-finite or non-positive credit deltas. */
function validatePositiveAmount({ amount }: { amount: number }): void {
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error("Credit amount must be a positive number");
	}
}

/** Rounds credit amounts to the persisted precision. */
function roundCredits({ amount }: { amount: number }): number {
	return Number(amount.toFixed(3));
}

/** Translates a Stripe refund amount into the credit amount to claw back. */
function resolveRefundTargetCredits({
	totalGrantedCredits,
	chargeAmount,
	chargeRefundedAmount,
}: {
	totalGrantedCredits: number;
	chargeAmount?: number | null;
	chargeRefundedAmount?: number | null;
}): number {
	if (
		typeof chargeAmount !== "number" ||
		!Number.isFinite(chargeAmount) ||
		chargeAmount <= 0 ||
		typeof chargeRefundedAmount !== "number" ||
		!Number.isFinite(chargeRefundedAmount) ||
		chargeRefundedAmount < 0
	) {
		return totalGrantedCredits;
	}

	const refundRatio = Math.min(chargeRefundedAmount / chargeAmount, 1);
	return roundCredits({ amount: totalGrantedCredits * refundRatio });
}

/** Bounds credit history queries to a sane page size. */
function sanitizeHistoryLimit({ limit }: { limit?: number }): number {
	if (!limit || !Number.isInteger(limit)) {
		return 50;
	}
	if (limit < 1) {
		return 1;
	}
	if (limit > 200) {
		return 200;
	}
	return limit;
}

/** Returns the current balance after applying any due reset. */
export async function getCreditBalanceByUserId({
	userId,
}: {
	userId: string;
}): Promise<CreditBalanceInfo> {
	try {
		const balance = await ensureCreditBalance({ userId });
		const refreshed = await resetPlanCreditsIfDue({ userId, balance });
		return buildCreditBalanceInfo({ balance: refreshed });
	} catch (error) {
		throw new Error(
			`Failed to get credit balance for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Atomically spends credits from plan balance before top-ups. */
export async function deductCreditsForUser({
	userId,
	amount,
	modelKey,
	description,
}: {
	userId: string;
	amount: number;
	modelKey: string;
	description: string;
}): Promise<{ success: boolean; balance: CreditBalanceInfo }> {
	try {
		validatePositiveAmount({ amount });
		const normalizedAmount = roundCredits({ amount });
		validatePositiveAmount({ amount: normalizedAmount });
		const balance = await ensureCreditBalance({ userId });
		const refreshed = await resetPlanCreditsIfDue({ userId, balance });

		const totalAvailable = refreshed.planCredits + refreshed.topUpCredits;
		if (totalAvailable < normalizedAmount) {
			return {
				success: false,
				balance: buildCreditBalanceInfo({ balance: refreshed }),
			};
		}
		const updated = await db.transaction(async (tx) => {
			const now = new Date();
			const [nextBalance] = await tx
				.update(creditBalances)
				.set({
					planCredits: sql`GREATEST(${creditBalances.planCredits} - ${normalizedAmount}, 0)`,
					topUpCredits: sql`CASE
						WHEN ${creditBalances.planCredits} >= ${normalizedAmount}
						THEN ${creditBalances.topUpCredits}
						ELSE ${creditBalances.topUpCredits} - (${normalizedAmount} - ${creditBalances.planCredits})
					END`,
					updatedAt: now,
				})
				.where(
					and(
						eq(creditBalances.id, refreshed.id),
						sql`${creditBalances.planCredits} + ${creditBalances.topUpCredits} >= ${normalizedAmount}`
					)
				)
				.returning();

			if (!nextBalance) {
				return null;
			}

			await tx.insert(creditTransactions).values({
				id: crypto.randomUUID(),
				userId,
				type: "deduction",
				amount: -normalizedAmount,
				balanceAfter: nextBalance.planCredits + nextBalance.topUpCredits,
				description,
				modelKey,
			});

			return nextBalance;
		});

		if (!updated) {
			const latestBalance = await getCreditBalanceByUserId({ userId });
			return { success: false, balance: latestBalance };
		}

		return {
			success: true,
			balance: buildCreditBalanceInfo({ balance: updated }),
		};
	} catch (error) {
		throw new Error(
			`Failed to deduct credits for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Returns recent credit transactions in reverse chronological order. */
export async function listCreditHistoryByUserId({
	userId,
	limit,
}: {
	userId: string;
	limit?: number;
}): Promise<CreditHistoryItem[]> {
	try {
		const cappedLimit = sanitizeHistoryLimit({ limit });
		const rows = await db
			.select()
			.from(creditTransactions)
			.where(eq(creditTransactions.userId, userId))
			.orderBy(desc(creditTransactions.createdAt))
			.limit(cappedLimit);

		return rows.map((row) => ({
			id: row.id,
			type: row.type,
			amount: row.amount,
			balanceAfter: row.balanceAfter,
			description: row.description,
			modelKey: row.modelKey,
			stripePaymentId: row.stripePaymentId,
			createdAt: row.createdAt.toISOString(),
		}));
	} catch (error) {
		throw new Error(
			`Failed to list credit history for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Adds purchased credits and records the top-up transaction. */
export async function addTopUpCreditsForUser({
	userId,
	credits,
	stripePaymentId,
	description,
}: {
	userId: string;
	credits: number;
	stripePaymentId?: string;
	description?: string;
}): Promise<CreditBalanceInfo> {
	try {
		validatePositiveAmount({ amount: credits });
		const balance = await ensureCreditBalance({ userId });
		const refreshed = await resetPlanCreditsIfDue({ userId, balance });

		const updated = await db.transaction(async (tx) => {
			const now = new Date();
			const [nextBalance] = await tx
				.update(creditBalances)
				.set({
					topUpCredits: refreshed.topUpCredits + credits,
					updatedAt: now,
				})
				.where(eq(creditBalances.id, refreshed.id))
				.returning();

			if (!nextBalance) {
				throw new Error("Top-up update returned no row");
			}

			await tx.insert(creditTransactions).values({
				id: crypto.randomUUID(),
				userId,
				type: "top_up",
				amount: credits,
				balanceAfter: nextBalance.planCredits + nextBalance.topUpCredits,
				description: description ?? "Credit top-up",
				stripePaymentId,
			});

			return nextBalance;
		});

		return buildCreditBalanceInfo({ balance: updated });
	} catch (error) {
		throw new Error(
			`Failed to top up credits for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Credits a predefined pack by its configured amount. */
export async function addTopUpPackCreditsForUser({
	userId,
	pack,
	stripePaymentId,
}: {
	userId: string;
	pack: TopUpPack;
	stripePaymentId?: string;
}): Promise<CreditBalanceInfo> {
	try {
		const credits = TOP_UP_PACK_CREDITS[pack];
		if (!credits) {
			throw new Error(`Invalid top-up pack: ${pack}`);
		}

		return await addTopUpCreditsForUser({
			userId,
			credits,
			stripePaymentId,
			description: `${pack} credit pack`,
		});
	} catch (error) {
		throw new Error(
			`Failed to apply top-up pack for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Grants the monthly plan allocation immediately. */
export async function resetPlanCreditsForUser({
	userId,
	plan,
	stripePaymentId,
	description,
}: {
	userId: string;
	plan?: Plan;
	stripePaymentId?: string;
	description?: string;
}): Promise<CreditBalanceInfo> {
	try {
		const resolvedPlan = plan ?? (await getPlanByUserId({ userId }));
		const refreshedPlanCredits = PLAN_CREDITS[resolvedPlan];
		const balance = await ensureCreditBalance({ userId });

		const updated = await db.transaction(async (tx) => {
			const now = new Date();
			const [nextBalance] = await tx
				.update(creditBalances)
				.set({
					planCredits: refreshedPlanCredits,
					planCreditsResetAt: getNextResetAt({ now }),
					updatedAt: now,
				})
				.where(eq(creditBalances.id, balance.id))
				.returning();

			if (!nextBalance) {
				throw new Error("Plan credit refresh update returned no row");
			}

			await tx.insert(creditTransactions).values({
				id: crypto.randomUUID(),
				userId,
				type: "plan_grant",
				amount: refreshedPlanCredits,
				balanceAfter: nextBalance.planCredits + nextBalance.topUpCredits,
				description:
					description ?? `${resolvedPlan} plan credits granted for new period`,
				stripePaymentId,
			});

			return nextBalance;
		});

		return buildCreditBalanceInfo({ balance: updated });
	} catch (error) {
		throw new Error(
			`Failed to reset plan credits for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Downgrades a user back to the free-plan balance. */
export async function downgradeToFreeCreditsForUser({
	userId,
	description,
}: {
	userId: string;
	description?: string;
}): Promise<CreditBalanceInfo> {
	try {
		const freeCredits = PLAN_CREDITS.free;
		const balance = await ensureCreditBalance({ userId });

		const updated = await db.transaction(async (tx) => {
			const now = new Date();
			const [nextBalance] = await tx
				.update(creditBalances)
				.set({
					planCredits: freeCredits,
					planCreditsResetAt: getNextResetAt({ now }),
					updatedAt: now,
				})
				.where(eq(creditBalances.id, balance.id))
				.returning();

			if (!nextBalance) {
				throw new Error("Free-plan downgrade update returned no row");
			}

			await tx.insert(creditTransactions).values({
				id: crypto.randomUUID(),
				userId,
				type: "expiry",
				amount: 0,
				balanceAfter: nextBalance.planCredits + nextBalance.topUpCredits,
				description: description ?? "Downgraded to free plan credits",
			});

			return nextBalance;
		});

		return buildCreditBalanceInfo({ balance: updated });
	} catch (error) {
		throw new Error(
			`Failed to downgrade credits for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Claws back purchased credits when Stripe refunds a top-up payment. */
export async function reconcileTopUpRefundByStripePaymentId({
	stripePaymentId,
	chargeAmount,
	chargeRefundedAmount,
}: {
	stripePaymentId: string;
	chargeAmount?: number | null;
	chargeRefundedAmount?: number | null;
}): Promise<{
	applied: boolean;
	userId: string | null;
	refundedCredits: number;
	shortfallCredits: number;
}> {
	try {
		const normalizedPaymentId = stripePaymentId.trim();
		if (normalizedPaymentId.length === 0) {
			return {
				applied: false,
				userId: null,
				refundedCredits: 0,
				shortfallCredits: 0,
			};
		}

		const grantedRows = await db
			.select({
				userId: creditTransactions.userId,
				amount: creditTransactions.amount,
			})
			.from(creditTransactions)
			.where(
				and(
					eq(creditTransactions.type, "top_up"),
					eq(creditTransactions.stripePaymentId, normalizedPaymentId)
				)
			);

		if (grantedRows.length === 0) {
			return {
				applied: false,
				userId: null,
				refundedCredits: 0,
				shortfallCredits: 0,
			};
		}

		const resolvedUserId = grantedRows[0]?.userId ?? null;
		if (!resolvedUserId) {
			return {
				applied: false,
				userId: null,
				refundedCredits: 0,
				shortfallCredits: 0,
			};
		}

		const hasMultipleUsers = grantedRows.some(
			(row) => row.userId !== resolvedUserId
		);
		if (hasMultipleUsers) {
			throw new Error(
				`Top-up transactions for ${normalizedPaymentId} span multiple users`
			);
		}

		const totalGrantedCredits = roundCredits({
			amount: grantedRows.reduce((sum, row) => sum + row.amount, 0),
		});
		const refundRows = await db
			.select({ amount: creditTransactions.amount })
			.from(creditTransactions)
			.where(
				and(
					eq(creditTransactions.userId, resolvedUserId),
					eq(creditTransactions.type, "refund"),
					eq(creditTransactions.stripePaymentId, normalizedPaymentId)
				)
			);
		const alreadyRefundedCredits = roundCredits({
			amount: refundRows.reduce((sum, row) => sum + Math.abs(row.amount), 0),
		});

		const targetRefundCredits = resolveRefundTargetCredits({
			totalGrantedCredits,
			chargeAmount,
			chargeRefundedAmount,
		});
		const requiredRefundCredits = roundCredits({
			amount: targetRefundCredits - alreadyRefundedCredits,
		});

		if (requiredRefundCredits <= 0) {
			return {
				applied: false,
				userId: resolvedUserId,
				refundedCredits: 0,
				shortfallCredits: 0,
			};
		}

		const balance = await ensureCreditBalance({ userId: resolvedUserId });
		const refreshed = await resetPlanCreditsIfDue({
			userId: resolvedUserId,
			balance,
		});
		const availableCredits = roundCredits({
			amount: refreshed.planCredits + refreshed.topUpCredits,
		});
		const creditsToApply = roundCredits({
			amount: Math.min(requiredRefundCredits, availableCredits),
		});
		const shortfallCredits = roundCredits({
			amount: requiredRefundCredits - creditsToApply,
		});

		if (creditsToApply <= 0) {
			return {
				applied: false,
				userId: resolvedUserId,
				refundedCredits: 0,
				shortfallCredits,
			};
		}

		await db.transaction(async (tx) => {
			const now = new Date();
			const [nextBalance] = await tx
				.update(creditBalances)
				.set({
					planCredits: sql`GREATEST(${creditBalances.planCredits} - ${creditsToApply}, 0)`,
					topUpCredits: sql`GREATEST(CASE
						WHEN ${creditBalances.planCredits} >= ${creditsToApply}
						THEN ${creditBalances.topUpCredits}
						ELSE ${creditBalances.topUpCredits} - (${creditsToApply} - ${creditBalances.planCredits})
					END, 0)`,
					updatedAt: now,
				})
				.where(
					and(
						eq(creditBalances.id, refreshed.id),
						sql`${creditBalances.planCredits} + ${creditBalances.topUpCredits} >= 0`
					)
				)
				.returning();

			if (!nextBalance) {
				throw new Error("Refund balance update returned no row");
			}

			const shortfallMessage =
				shortfallCredits > 0
					? `; unreconciled_shortfall_credits=${shortfallCredits}`
					: "";
			await tx.insert(creditTransactions).values({
				id: crypto.randomUUID(),
				userId: resolvedUserId,
				type: "refund",
				amount: -creditsToApply,
				balanceAfter: nextBalance.planCredits + nextBalance.topUpCredits,
				description: `Stripe refund reconciliation for ${normalizedPaymentId}${shortfallMessage}`,
				stripePaymentId: normalizedPaymentId,
			});
		});

		return {
			applied: true,
			userId: resolvedUserId,
			refundedCredits: creditsToApply,
			shortfallCredits,
		};
	} catch (error) {
		throw new Error(
			`Failed to reconcile refund for payment ${stripePaymentId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/** Returns the configured credit amount for a named top-up pack. */
export function getTopUpPackCredits({ pack }: { pack: TopUpPack }): number {
	return TOP_UP_PACK_CREDITS[pack];
}

/** Narrows arbitrary strings to supported top-up pack names. */
export function isTopUpPack(pack: string): pack is TopUpPack {
	return pack in TOP_UP_PACK_CREDITS;
}
