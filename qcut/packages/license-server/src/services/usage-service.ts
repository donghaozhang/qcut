import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/drizzle";
import { licenses, usageRecords } from "@qcut/db/schema";

const USAGE_LIMITS: Record<string, Record<string, number>> = {
	free: { ai_generation: 5, render: 10, export: Number.POSITIVE_INFINITY },
	pro: {
		ai_generation: Number.POSITIVE_INFINITY,
		render: Number.POSITIVE_INFINITY,
		export: Number.POSITIVE_INFINITY,
	},
	team: {
		ai_generation: Number.POSITIVE_INFINITY,
		render: Number.POSITIVE_INFINITY,
		export: Number.POSITIVE_INFINITY,
	},
};

function getCurrentPeriod(): { periodStart: Date; periodEnd: Date } {
	const now = new Date();
	const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const periodEnd = new Date(
		now.getFullYear(),
		now.getMonth() + 1,
		0,
		23,
		59,
		59
	);
	return { periodStart, periodEnd };
}

export async function getUsage({
	licenseId,
}: {
	licenseId: string;
}): Promise<Record<string, number>> {
	try {
		const { periodStart, periodEnd } = getCurrentPeriod();

		const records = await db
			.select()
			.from(usageRecords)
			.where(
				and(
					eq(usageRecords.licenseId, licenseId),
					gte(usageRecords.periodStart, periodStart),
					lte(usageRecords.periodEnd, periodEnd)
				)
			);

		const usage: Record<string, number> = {
			ai_generation: 0,
			export: 0,
			render: 0,
		};

		for (const record of records) {
			usage[record.type] = (usage[record.type] || 0) + record.count;
		}

		return usage;
	} catch (error) {
		throw new Error(
			`Failed to read usage for license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function trackUsage({
	licenseId,
	type,
}: {
	licenseId: string;
	type: "ai_generation" | "export" | "render";
}): Promise<void> {
	try {
		const { periodStart, periodEnd } = getCurrentPeriod();

		const [existing] = await db
			.select()
			.from(usageRecords)
			.where(
				and(
					eq(usageRecords.licenseId, licenseId),
					eq(usageRecords.type, type),
					gte(usageRecords.periodStart, periodStart),
					lte(usageRecords.periodEnd, periodEnd)
				)
			)
			.limit(1);

		if (existing) {
			await db
				.update(usageRecords)
				.set({ count: existing.count + 1, updatedAt: new Date() })
				.where(eq(usageRecords.id, existing.id));
			return;
		}

		await db.insert(usageRecords).values({
			id: crypto.randomUUID(),
			licenseId,
			type,
			count: 1,
			periodStart,
			periodEnd,
		});
	} catch (error) {
		throw new Error(
			`Failed to track usage for license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function checkUsageLimit({
	licenseId,
	type,
}: {
	licenseId: string;
	type: string;
}): Promise<boolean> {
	try {
		const [license] = await db
			.select()
			.from(licenses)
			.where(eq(licenses.id, licenseId))
			.limit(1);

		if (!license) {
			return false;
		}

		const limits = USAGE_LIMITS[license.plan] || USAGE_LIMITS.free;
		const limit = limits[type];
		if (limit === Number.POSITIVE_INFINITY) {
			return true;
		}

		const usage = await getUsage({ licenseId });
		return (usage[type] || 0) < limit;
	} catch (error) {
		throw new Error(
			`Failed to check usage limit for license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}
