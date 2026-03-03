import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
	deductCreditsForUser,
	getCreditBalanceByUserId,
	isTopUpPack,
	listCreditHistoryByUserId,
} from "../services/credit-service";
import { createTopUpCheckoutSession } from "../services/stripe-service";

const creditsRoutes = new Hono();

creditsRoutes.use("/*", authMiddleware);

creditsRoutes.get("/", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const credits = await getCreditBalanceByUserId({ userId });
		return c.json({ credits });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load credit balance",
			},
			500
		);
	}
});

creditsRoutes.post("/deduct", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const payload = await c.req.json();
		const amount = Number(payload?.amount);
		const modelKey =
			typeof payload?.modelKey === "string" ? payload.modelKey.trim() : "";
		const description =
			typeof payload?.description === "string"
				? payload.description.trim()
				: "";

		if (!Number.isFinite(amount) || amount <= 0) {
			return c.json({ error: "amount must be a positive number" }, 400);
		}
		if (modelKey.length === 0) {
			return c.json({ error: "modelKey is required" }, 400);
		}
		if (description.length === 0) {
			return c.json({ error: "description is required" }, 400);
		}

		const result = await deductCreditsForUser({
			userId,
			amount,
			modelKey,
			description,
		});

		if (!result.success) {
			return c.json(
				{
					error: "Insufficient credits",
					credits: result.balance,
				},
				402
			);
		}

		return c.json({ success: true, credits: result.balance });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to deduct credits",
			},
			500
		);
	}
});

creditsRoutes.get("/balance", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const credits = await getCreditBalanceByUserId({ userId });
		return c.json({ credits });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load credit balance",
			},
			500
		);
	}
});

creditsRoutes.post("/use", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const payload = await c.req.json();
		const amount = Number(payload?.amount);
		const modelKey =
			typeof payload?.modelKey === "string" ? payload.modelKey.trim() : "";
		const description =
			typeof payload?.description === "string"
				? payload.description.trim()
				: "";

		if (!Number.isFinite(amount) || amount <= 0) {
			return c.json({ error: "amount must be a positive number" }, 400);
		}
		if (modelKey.length === 0) {
			return c.json({ error: "modelKey is required" }, 400);
		}

		const result = await deductCreditsForUser({
			userId,
			amount,
			modelKey,
			description: description.length > 0 ? description : `${modelKey} usage`,
		});

		if (!result.success) {
			return c.json(
				{ error: "Insufficient credits", credits: result.balance },
				402
			);
		}

		return c.json({ success: true, credits: result.balance });
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : "Failed to use credits",
			},
			500
		);
	}
});

creditsRoutes.get("/history", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const limitParam = c.req.query("limit");
		const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
		const history = await listCreditHistoryByUserId({ userId, limit });
		return c.json({ history });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load credit history",
			},
			500
		);
	}
});

creditsRoutes.post("/topup", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const payload = await c.req.json();
		const pack = typeof payload?.pack === "string" ? payload.pack.trim() : "";

		if (!isTopUpPack(pack)) {
			return c.json({ error: "Invalid top-up pack" }, 400);
		}

		const session = await createTopUpCheckoutSession({ userId, pack });
		return c.json({ url: session.url });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to create top-up checkout session",
			},
			500
		);
	}
});

export { creditsRoutes };
