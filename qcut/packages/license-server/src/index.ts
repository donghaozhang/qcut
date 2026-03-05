import { Hono } from "hono";
import { cors } from "hono/cors";
import { licenseRoutes } from "./routes/license";
import { usageRoutes } from "./routes/usage";
import { stripeRoutes } from "./routes/stripe";
import { creditsRoutes } from "./routes/credits";
import { getMockResponse, isMockMode } from "./middleware/mock";
import { getAllowedCorsOrigins } from "./services/payment-config";

const app = new Hono();

app.use(
	"/*",
	cors({
		origin: getAllowedCorsOrigins(),
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

export default app;
