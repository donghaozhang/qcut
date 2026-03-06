import { Hono } from "hono";
import { cors } from "hono/cors";
import { licenseRoutes } from "./routes/license";
import { usageRoutes } from "./routes/usage";
import { stripeRoutes } from "./routes/stripe";
import { creditsRoutes } from "./routes/credits";
import { authRoutes } from "./routes/auth";
import { getMockResponse, isMockMode } from "./middleware/mock";
import { getAllowedCorsOrigins } from "./services/payment-config";

const app = new Hono();

// CF Workers passes secrets/vars via the env object, not process.env.
// This middleware syncs them so all existing process.env usage works.
app.use("/*", async (c, next) => {
	const env = c.env as Record<string, unknown>;
	if (env && typeof env === "object") {
		for (const [key, value] of Object.entries(env)) {
			if (typeof value === "string") {
				process.env[key] = value;
			}
		}
		// Hyperdrive provides a local connection string that postgres.js can use
		// via standard TCP (Cloudflare's network handles the actual DB connection).
		const hyperdrive = env.HYPERDRIVE as
			| { connectionString?: string }
			| undefined;
		if (hyperdrive?.connectionString) {
			process.env.DATABASE_URL = hyperdrive.connectionString;
		}
	}
	await next();
});

app.use(
	"/*",
	cors({
		origin: (origin) => {
			const allowed = getAllowedCorsOrigins();
			return allowed.includes(origin) ? origin : null;
		},
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
	})
);

// Mock mode interceptor: returns canned responses without hitting DB/Stripe
app.use("/api/*", async (c, next) => {
	const mock = getMockResponse(c.req.path, c.req.method);
	if (mock) {
		return c.json(mock);
	}
	await next();
});

app.get("/", (c) =>
	c.json({
		status: "ok",
		service: "qcut-license-server",
		mock: isMockMode(),
	})
);
app.get("/health", (c) =>
	c.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		mock: isMockMode(),
	})
);

app.route("/api/license", licenseRoutes);
app.route("/api/usage", usageRoutes);
app.route("/api/credits", creditsRoutes);
app.route("/api/stripe", stripeRoutes);
app.route("/api/auth", authRoutes);

export default app;
