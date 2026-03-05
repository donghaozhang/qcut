import { and, eq } from "drizzle-orm";
import { db } from "@qcut/db";
import { deviceActivations, licenses } from "@qcut/db/schema";

export type LicensePlan = "free" | "pro" | "team";

function parsePlan({ plan }: { plan: string }): LicensePlan {
	if (plan === "pro" || plan === "team") {
		return plan;
	}
	return "free";
}

function getMaxDevicesForPlan({ plan }: { plan: LicensePlan }): number {
	if (plan === "team") {
		return 10;
	}
	if (plan === "pro") {
		return 3;
	}
	return 1;
}

export async function getLicenseByUserId({
	userId,
}: {
	userId: string;
}): Promise<typeof licenses.$inferSelect> {
	try {
		const [license] = await db
			.select()
			.from(licenses)
			.where(eq(licenses.userId, userId))
			.limit(1);

		if (license) {
			return license;
		}

		return await createLicense({ userId, plan: "free" });
	} catch (error) {
		throw new Error(
			`Failed to load license for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function createLicense({
	userId,
	plan,
}: {
	userId: string;
	plan: string;
}): Promise<typeof licenses.$inferSelect> {
	try {
		const parsedPlan = parsePlan({ plan });
		const [inserted] = await db
			.insert(licenses)
			.values({
				id: crypto.randomUUID(),
				userId,
				plan: parsedPlan,
				status: "active",
				maxDevices: getMaxDevicesForPlan({ plan: parsedPlan }),
			})
			.onConflictDoNothing({ target: licenses.userId })
			.returning();

		if (inserted) {
			return inserted;
		}

		const [existing] = await db
			.select()
			.from(licenses)
			.where(eq(licenses.userId, userId))
			.limit(1);
		if (!existing) {
			throw new Error("License upsert fallback returned no row");
		}
		return existing;
	} catch (error) {
		throw new Error(
			`Failed to create license for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function updateLicense({
	licenseId,
	updates,
}: {
	licenseId: string;
	updates: Partial<typeof licenses.$inferInsert>;
}): Promise<typeof licenses.$inferSelect> {
	try {
		const [updated] = await db
			.update(licenses)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(licenses.id, licenseId))
			.returning();

		if (!updated) {
			throw new Error(`License ${licenseId} not found`);
		}

		return updated;
	} catch (error) {
		throw new Error(
			`Failed to update license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function activateDevice({
	licenseId,
	fingerprint,
	name,
}: {
	licenseId: string;
	fingerprint: string;
	name: string;
}): Promise<typeof deviceActivations.$inferSelect> {
	try {
		const canActivate = await checkDeviceLimit({ licenseId });
		if (!canActivate) {
			throw new Error("Device limit reached");
		}

		const [existing] = await db
			.select()
			.from(deviceActivations)
			.where(
				and(
					eq(deviceActivations.licenseId, licenseId),
					eq(deviceActivations.deviceFingerprint, fingerprint)
				)
			)
			.limit(1);

		if (existing) {
			const [updated] = await db
				.update(deviceActivations)
				.set({ isActive: true, lastSeenAt: new Date(), deviceName: name })
				.where(eq(deviceActivations.id, existing.id))
				.returning();

			if (!updated) {
				throw new Error("Failed to reactivate device");
			}

			return updated;
		}

		const [activation] = await db
			.insert(deviceActivations)
			.values({
				id: crypto.randomUUID(),
				licenseId,
				deviceFingerprint: fingerprint,
				deviceName: name,
			})
			.returning();

		if (!activation) {
			throw new Error("Failed to activate device");
		}

		return activation;
	} catch (error) {
		throw new Error(
			`Failed to activate device for license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function deactivateDevice({
	activationId,
	licenseId,
}: {
	activationId: string;
	licenseId: string;
}): Promise<typeof deviceActivations.$inferSelect> {
	try {
		const [updated] = await db
			.update(deviceActivations)
			.set({ isActive: false })
			.where(
				and(
					eq(deviceActivations.id, activationId),
					eq(deviceActivations.licenseId, licenseId)
				)
			)
			.returning();

		if (!updated) {
			throw new Error("Device activation not found");
		}

		return updated;
	} catch (error) {
		throw new Error(
			`Failed to deactivate device ${activationId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function getActiveDevices({
	licenseId,
}: {
	licenseId: string;
}): Promise<Array<typeof deviceActivations.$inferSelect>> {
	try {
		return await db
			.select()
			.from(deviceActivations)
			.where(
				and(
					eq(deviceActivations.licenseId, licenseId),
					eq(deviceActivations.isActive, true)
				)
			);
	} catch (error) {
		throw new Error(
			`Failed to load active devices for license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function checkDeviceLimit({
	licenseId,
}: {
	licenseId: string;
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

		const activeDevices = await getActiveDevices({ licenseId });
		return activeDevices.length < license.maxDevices;
	} catch (error) {
		throw new Error(
			`Failed to check device limit for license ${licenseId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}
