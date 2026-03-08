import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
	activateDevice,
	deactivateDevice,
	getActiveDevices,
	getLicenseByUserId,
} from "../services/license-service";
import { getCreditBalanceByUserId } from "../services/credit-service";
import { db } from "../db/drizzle";
import { users } from "@qcut/db/schema";
import { eq } from "drizzle-orm";

const licenseRoutes = new Hono();

licenseRoutes.use("/*", authMiddleware);

licenseRoutes.get("/", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const license = await getLicenseByUserId({ userId });
		const devices = await getActiveDevices({ licenseId: license.id });
		const credits = await getCreditBalanceByUserId({ userId });
		const [user] = await db
			.select({ name: users.name, email: users.email, image: users.image })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		return c.json({
			license: {
				plan: license.plan,
				status: license.status,
				currentPeriodEnd: license.currentPeriodEnd?.toISOString(),
				credits,
			},
			user: user
				? { name: user.name, email: user.email, image: user.image }
				: null,
			devices,
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to load license",
			},
			500
		);
	}
});

licenseRoutes.post("/activate", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const payload = await c.req.json();
		const deviceFingerprint =
			typeof payload?.deviceFingerprint === "string"
				? payload.deviceFingerprint.trim()
				: "";
		const deviceName =
			typeof payload?.deviceName === "string" ? payload.deviceName.trim() : "";

		if (deviceFingerprint.length === 0 || deviceName.length === 0) {
			return c.json(
				{ error: "deviceFingerprint and deviceName required" },
				400
			);
		}

		const license = await getLicenseByUserId({ userId });
		const activation = await activateDevice({
			licenseId: license.id,
			fingerprint: deviceFingerprint,
			name: deviceName,
		});
		const credits = await getCreditBalanceByUserId({ userId });

		return c.json({
			activation,
			license: {
				plan: license.plan,
				status: license.status,
				currentPeriodEnd: license.currentPeriodEnd?.toISOString(),
				credits,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Activation failed";
		if (message.includes("Device limit reached")) {
			return c.json({ error: message }, 403);
		}
		return c.json({ error: message }, 500);
	}
});

licenseRoutes.post("/validate", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const license = await getLicenseByUserId({ userId });
		const credits = await getCreditBalanceByUserId({ userId });
		const isValid =
			license.status === "active" || license.status === "past_due";
		return c.json({
			valid: isValid,
			license: {
				plan: license.plan,
				status: license.status,
				currentPeriodEnd: license.currentPeriodEnd?.toISOString(),
				credits,
			},
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to validate license",
			},
			500
		);
	}
});

licenseRoutes.get("/status", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const license = await getLicenseByUserId({ userId });
		const devices = await getActiveDevices({ licenseId: license.id });
		const credits = await getCreditBalanceByUserId({ userId });
		return c.json({
			plan: license.plan,
			status: license.status,
			currentPeriodEnd: license.currentPeriodEnd?.toISOString(),
			maxDevices: license.maxDevices,
			activeDevices: devices.length,
			credits,
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to get license status",
			},
			500
		);
	}
});

licenseRoutes.delete("/deactivate", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const payload = await c.req.json();
		const deviceId =
			typeof payload?.deviceId === "string" ? payload.deviceId : "";
		if (deviceId.length === 0) {
			return c.json({ error: "deviceId required" }, 400);
		}

		const license = await getLicenseByUserId({ userId });
		const device = await deactivateDevice({
			activationId: deviceId,
			licenseId: license.id,
		});
		return c.json({ device });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to deactivate device",
			},
			500
		);
	}
});

export { licenseRoutes };
