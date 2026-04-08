import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

// Mock the DB module before importing the routes
vi.mock("../db/drizzle", () => ({
	db: {
		select: vi.fn(),
		update: vi.fn(),
		insert: vi.fn(),
	},
}));

vi.mock("../services/credit-service", () => ({
	addTopUpCreditsForUser: vi.fn(),
	getCreditBalanceByUserId: vi.fn(),
	resetPlanCreditsForUser: vi.fn(),
}));

// Must import after mocks are set up
const { db } = await import("../db/drizzle");
const {
	addTopUpCreditsForUser,
	getCreditBalanceByUserId,
	resetPlanCreditsForUser,
} = await import("../services/credit-service");
const { adminRoutes } = await import("./admin");

const ADMIN_KEY = "test-admin-key";
const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value;
	}
}

function buildApp(): Hono {
	const app = new Hono();
	app.route("/api/admin", adminRoutes);
	return app;
}

function adminHeaders(): Record<string, string> {
	return { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json" };
}

/** Helper to make a chainable select mock that resolves to rows. */
function mockSelectChain(rows: Record<string, unknown>[]): void {
	const chain = {
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(rows),
	};
	vi.mocked(db.select).mockReturnValue(chain as never);
}

/** Helper for update chain. */
function mockUpdateChain(): {
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
} {
	const chain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(undefined),
	};
	vi.mocked(db.update).mockReturnValue(chain as never);
	return chain;
}

beforeEach(() => {
	process.env.ADMIN_API_KEY = ADMIN_KEY;
	vi.clearAllMocks();
});

afterEach(() => {
	resetEnv();
});

describe("GET /api/admin/user", () => {
	it("returns 400 when email is missing", async () => {
		const res = await buildApp().request("/api/admin/user", {
			headers: adminHeaders(),
		});
		expect(res.status).toBe(400);
	});

	it("returns 404 when user not found", async () => {
		mockSelectChain([]);
		const res = await buildApp().request(
			"/api/admin/user?email=nobody@test.com",
			{ headers: adminHeaders() }
		);
		expect(res.status).toBe(404);
	});

	it("returns user info with credits", async () => {
		// First select: user lookup
		const userChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi
				.fn()
				.mockResolvedValue([
					{ id: "u1", name: "Test", email: "test@test.com" },
				]),
		};
		// Second select: license lookup
		const licenseChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([{ plan: "pro", status: "active" }]),
		};

		vi.mocked(db.select)
			.mockReturnValueOnce(userChain as never)
			.mockReturnValueOnce(licenseChain as never);

		vi.mocked(getCreditBalanceByUserId).mockResolvedValue({
			planCredits: 500,
			topUpCredits: 100,
			totalCredits: 600,
			planCreditsResetAt: "2026-05-01T00:00:00.000Z",
		});

		const res = await buildApp().request(
			"/api/admin/user?email=test@test.com",
			{ headers: adminHeaders() }
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.user.email).toBe("test@test.com");
		expect(body.user.plan).toBe("pro");
		expect(body.credits.totalCredits).toBe(600);
	});
});

describe("POST /api/admin/grant-credits", () => {
	it("returns 400 when no emails provided", async () => {
		const res = await buildApp().request("/api/admin/grant-credits", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ amount: 100 }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when amount is invalid", async () => {
		const res = await buildApp().request("/api/admin/grant-credits", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ email: "a@b.com", amount: -5 }),
		});
		expect(res.status).toBe(400);
	});

	it("grants credits to found users and reports missing ones", async () => {
		// First call: found user
		const foundChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([{ id: "u1" }]),
		};
		// Second call: not found
		const notFoundChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([]),
		};

		vi.mocked(db.select)
			.mockReturnValueOnce(foundChain as never)
			.mockReturnValueOnce(notFoundChain as never);

		vi.mocked(addTopUpCreditsForUser).mockResolvedValue({
			planCredits: 50,
			topUpCredits: 200,
			totalCredits: 250,
			planCreditsResetAt: "2026-05-01T00:00:00.000Z",
		});

		const res = await buildApp().request("/api/admin/grant-credits", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({
				emails: ["found@test.com", "missing@test.com"],
				amount: 200,
			}),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.summary.succeeded).toBe(1);
		expect(body.summary.failed).toBe(1);
		expect(body.results[0].success).toBe(true);
		expect(body.results[1].success).toBe(false);
		expect(body.results[1].error).toBe("User not found");
	});

	it("accepts single email string", async () => {
		const chain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([{ id: "u1" }]),
		};
		vi.mocked(db.select).mockReturnValue(chain as never);
		vi.mocked(addTopUpCreditsForUser).mockResolvedValue({
			planCredits: 50,
			topUpCredits: 100,
			totalCredits: 150,
			planCreditsResetAt: "2026-05-01T00:00:00.000Z",
		});

		const res = await buildApp().request("/api/admin/grant-credits", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ email: "solo@test.com", amount: 100 }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.summary.succeeded).toBe(1);
	});
});

describe("POST /api/admin/upgrade-plan", () => {
	it("returns 400 when email is missing", async () => {
		const res = await buildApp().request("/api/admin/upgrade-plan", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ plan: "pro" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 for invalid plan", async () => {
		const res = await buildApp().request("/api/admin/upgrade-plan", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ email: "a@b.com", plan: "enterprise" }),
		});
		expect(res.status).toBe(400);
	});

	it("upgrades plan and resets credits", async () => {
		// User lookup
		const userChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([{ id: "u1" }]),
		};
		// License lookup
		const licenseChain = {
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([{ id: "lic1" }]),
		};

		vi.mocked(db.select)
			.mockReturnValueOnce(userChain as never)
			.mockReturnValueOnce(licenseChain as never);

		mockUpdateChain();

		vi.mocked(resetPlanCreditsForUser).mockResolvedValue({
			planCredits: 2000,
			topUpCredits: 0,
			totalCredits: 2000,
			planCreditsResetAt: "2026-05-01T00:00:00.000Z",
		});

		const res = await buildApp().request("/api/admin/upgrade-plan", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ email: "tester@test.com", plan: "team" }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.user.plan).toBe("team");
		expect(body.user.maxDevices).toBe(10);
		expect(body.credits.totalCredits).toBe(2000);
	});

	it("returns 404 when user not found", async () => {
		mockSelectChain([]);
		const res = await buildApp().request("/api/admin/upgrade-plan", {
			method: "POST",
			headers: adminHeaders(),
			body: JSON.stringify({ email: "nobody@test.com", plan: "pro" }),
		});
		expect(res.status).toBe(404);
	});
});
