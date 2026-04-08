import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { resetRateLimitState } from "../middleware/rate-limit";

// Mock DB and credit service
vi.mock("../db/drizzle", () => ({
	db: {
		select: vi.fn(),
		update: vi.fn(),
		insert: vi.fn(),
	},
}));

vi.mock("../services/credit-service", () => ({
	deductCreditsForUser: vi.fn(),
}));

// Mock auth middleware to inject userId
vi.mock("../middleware/auth", () => ({
	authMiddleware: vi.fn().mockImplementation(async (c: any, next: any) => {
		c.set("userId", "test-user-1");
		await next();
	}),
}));

// Mock global fetch for provider calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { deductCreditsForUser } = await import("../services/credit-service");
const { aiProxyRoutes } = await import("./ai-proxy");

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
	app.route("/api/ai", aiProxyRoutes);
	return app;
}

function jsonHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

function mockProviderResponse(body: object, status = 200): void {
	mockFetch.mockResolvedValueOnce(
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetRateLimitState();
	// Set all provider keys for tests
	process.env.FAL_API_KEY = "test-fal-key";
	process.env.GEMINI_API_KEY = "test-gemini-key";
	process.env.OPENROUTER_API_KEY = "test-openrouter-key";
	process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
	process.env.GMI_API_KEY = "test-gmi-key";
	process.env.RUNWAY_API_KEY = "test-runway-key";
	process.env.AI_PROXY_RATE_LIMIT = "1000"; // high limit for tests
});

afterEach(() => {
	resetEnv();
});

// ── POST /api/ai/proxy ─────────────────────────────────────────────────────

describe("POST /api/ai/proxy", () => {
	it("returns 400 for invalid provider", async () => {
		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "openai",
				endpoint: "https://api.openai.com/v1/chat",
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("Invalid provider");
	});

	it("returns 400 when endpoint is missing", async () => {
		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ provider: "fal" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 403 for disallowed endpoint", async () => {
		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				endpoint: "https://evil.com/steal",
			}),
		});
		expect(res.status).toBe(403);
	});

	it("returns 503 when provider key is not configured", async () => {
		delete process.env.FAL_API_KEY;
		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				endpoint: "https://queue.fal.run/fal-ai/test",
				body: { prompt: "test" },
			}),
		});
		expect(res.status).toBe(503);
	});

	it("forwards request to provider with correct auth headers (FAL)", async () => {
		mockProviderResponse({ request_id: "req-123" });

		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				endpoint: "https://queue.fal.run/fal-ai/test",
				body: { prompt: "a cat" },
			}),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.request_id).toBe("req-123");

		// Verify fetch was called with correct auth
		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toBe("https://queue.fal.run/fal-ai/test");
		expect(opts.headers.Authorization).toBe("Key test-fal-key");
	});

	it("forwards request with Gemini auth format", async () => {
		mockProviderResponse({ candidates: [] });

		await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "gemini",
				endpoint:
					"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
				body: { contents: [] },
			}),
		});

		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.headers["x-goog-api-key"]).toBe("test-gemini-key");
	});

	it("deducts credits when credits field is provided", async () => {
		vi.mocked(deductCreditsForUser).mockResolvedValue({
			success: true,
			balance: {
				planCredits: 40,
				topUpCredits: 0,
				totalCredits: 40,
				planCreditsResetAt: "2026-05-01T00:00:00.000Z",
			},
		});
		mockProviderResponse({ ok: true });

		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				endpoint: "https://queue.fal.run/fal-ai/test",
				body: { prompt: "test" },
				credits: {
					amount: 10,
					modelKey: "fal-test",
					description: "Test gen",
				},
			}),
		});

		expect(res.status).toBe(200);
		expect(deductCreditsForUser).toHaveBeenCalledWith({
			userId: "test-user-1",
			amount: 10,
			modelKey: "fal-test",
			description: "Test gen",
		});
	});

	it("returns 402 when credits are insufficient", async () => {
		vi.mocked(deductCreditsForUser).mockResolvedValue({
			success: false,
			balance: {
				planCredits: 0,
				topUpCredits: 0,
				totalCredits: 0,
				planCreditsResetAt: "2026-05-01T00:00:00.000Z",
			},
		});

		const res = await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				endpoint: "https://queue.fal.run/fal-ai/test",
				body: {},
				credits: { amount: 100, modelKey: "fal-test", description: "" },
			}),
		});

		expect(res.status).toBe(402);
		// Should NOT have called the provider
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("skips credit deduction when credits field is absent", async () => {
		mockProviderResponse({ ok: true });

		await buildApp().request("/api/ai/proxy", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				endpoint: "https://queue.fal.run/fal-ai/test",
				body: {},
			}),
		});

		expect(deductCreditsForUser).not.toHaveBeenCalled();
	});
});

// ── POST /api/ai/upload-url ─────────────────────────────────────────────────

describe("POST /api/ai/upload-url", () => {
	it("returns 400 for non-fal provider", async () => {
		const res = await buildApp().request("/api/ai/upload-url", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ provider: "gemini", fileName: "test.mp4" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when fileName is missing", async () => {
		const res = await buildApp().request("/api/ai/upload-url", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({ provider: "fal" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns signed upload URL from FAL", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					upload_url: "https://storage.fal.ai/signed/abc",
					file_url: "https://cdn.fal.ai/files/abc.mp4",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		);

		const res = await buildApp().request("/api/ai/upload-url", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				fileName: "video.mp4",
				contentType: "video/mp4",
			}),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.uploadUrl).toBe("https://storage.fal.ai/signed/abc");
		expect(body.fileUrl).toBe("https://cdn.fal.ai/files/abc.mp4");

		// Verify the FAL key was used
		const [, opts] = mockFetch.mock.calls[0];
		expect(opts.headers.Authorization).toBe("Key test-fal-key");
	});

	it("returns 503 when FAL key is not configured", async () => {
		delete process.env.FAL_API_KEY;
		const res = await buildApp().request("/api/ai/upload-url", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				provider: "fal",
				fileName: "test.mp4",
			}),
		});
		expect(res.status).toBe(503);
	});
});

// ── GET /api/ai/status ──────────────────────────────────────────────────────

describe("GET /api/ai/status", () => {
	it("returns 400 for invalid provider", async () => {
		const res = await buildApp().request(
			"/api/ai/status?provider=openai&requestId=abc"
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when requestId is missing", async () => {
		const res = await buildApp().request(
			"/api/ai/status?provider=fal&endpoint=test"
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 for requestId with invalid characters", async () => {
		const res = await buildApp().request(
			"/api/ai/status?provider=fal&endpoint=test&requestId=../../../etc"
		);
		expect(res.status).toBe(400);
	});

	it("polls FAL status and returns result", async () => {
		mockProviderResponse({
			status: "COMPLETED",
			response_url: "https://queue.fal.run/result",
		});

		const res = await buildApp().request(
			"/api/ai/status?provider=fal&endpoint=fal-ai/test&requestId=req-123"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("COMPLETED");

		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toBe(
			"https://queue.fal.run/fal-ai/test/requests/req-123/status"
		);
		expect(opts.headers.Authorization).toBe("Key test-fal-key");
	});

	it("polls GMI status with correct URL", async () => {
		mockProviderResponse({ status: "processing" });

		await buildApp().request(
			"/api/ai/status?provider=gmi&requestId=gmi-req-456"
		);

		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe(
			"https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/gmi-req-456"
		);
	});

	it("returns 400 for providers that don't support polling", async () => {
		const res = await buildApp().request(
			"/api/ai/status?provider=gemini&requestId=abc"
		);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain("not supported");
	});
});

// ── GET /api/ai/result ──────────────────────────────────────────────────────

describe("GET /api/ai/result", () => {
	it("returns 400 for non-fal provider", async () => {
		const res = await buildApp().request(
			"/api/ai/result?provider=gmi&endpoint=test&requestId=abc"
		);
		expect(res.status).toBe(400);
	});

	it("fetches FAL result with correct URL", async () => {
		mockProviderResponse({ video: { url: "https://cdn.fal.ai/v.mp4" } });

		const res = await buildApp().request(
			"/api/ai/result?provider=fal&endpoint=fal-ai/test&requestId=req-789"
		);

		expect(res.status).toBe(200);
		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe("https://queue.fal.run/fal-ai/test/requests/req-789");
	});
});
