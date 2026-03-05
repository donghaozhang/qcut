import { describe, expect, it } from "vitest";
import { createAuthRoutes } from "./auth";

function buildHeaders({ cookie }: { cookie?: string }): Headers {
	try {
		const headers = new Headers();
		if (typeof cookie === "string" && cookie.length > 0) {
			headers.set("cookie", cookie);
		}
		return headers;
	} catch {
		return new Headers();
	}
}

describe("auth routes", () => {
	it("starts google oauth and forwards callback bridge URLs", async () => {
		let capturedRequestBody: Record<string, unknown> | null = null;
		let capturedRequestCookie = "";

		const authRoutes = createAuthRoutes({
			dependencies: {
				handleAuthRequest: async ({ request }) => {
					capturedRequestBody = (await request.json()) as Record<string, unknown>;
					capturedRequestCookie = request.headers.get("cookie") ?? "";
					return new Response(null, {
						status: 302,
						headers: {
							location: "https://accounts.google.com/o/oauth2/v2/auth?example=1",
						},
					});
				},
				getSessionFromHeaders: async () => null,
				getAllowedOrigins: () => [
					"https://quriosity.com.au",
					"https://www.quriosity.com.au",
				],
				getWebBaseUrl: () => "https://quriosity.com.au",
			},
		});

		const response = await authRoutes.request(
			"https://qcut-license-server.workers.dev/google/start?redirect_url=https%3A%2F%2Fquriosity.com.au%2Faccount%2Fdashboard.html",
			{
				method: "GET",
				headers: buildHeaders({ cookie: "state-cookie=abc" }),
			}
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain(
			"https://accounts.google.com/o/oauth2/v2/auth"
		);
		expect(capturedRequestCookie).toBe("state-cookie=abc");
		expect(capturedRequestBody?.provider).toBe("google");
		expect(typeof capturedRequestBody?.callbackURL).toBe("string");
		expect(String(capturedRequestBody?.callbackURL)).toContain(
			"/api/auth/oauth/token-bridge"
		);
		expect(String(capturedRequestBody?.callbackURL)).toContain(
			"redirect_url=https%3A%2F%2Fquriosity.com.au%2Faccount%2Fdashboard.html"
		);
	});

	it("falls back to default dashboard when redirect origin is not allowed", async () => {
		let capturedRequestBody: Record<string, unknown> | null = null;

		const authRoutes = createAuthRoutes({
			dependencies: {
				handleAuthRequest: async ({ request }) => {
					capturedRequestBody = (await request.json()) as Record<string, unknown>;
					return new Response(null, {
						status: 302,
						headers: {
							location: "https://accounts.google.com/o/oauth2/v2/auth?example=1",
						},
					});
				},
				getSessionFromHeaders: async () => null,
				getAllowedOrigins: () => ["https://quriosity.com.au"],
				getWebBaseUrl: () => "https://quriosity.com.au",
			},
		});

		await authRoutes.request(
			"https://qcut-license-server.workers.dev/google/start?redirect_url=https%3A%2F%2Fevil.example.com%2Fpwn",
			{ method: "GET" }
		);

		expect(String(capturedRequestBody?.callbackURL)).toContain(
			"redirect_url=https%3A%2F%2Fquriosity.com.au%2Faccount%2Fdashboard.html"
		);
	});

	it("bridges session token to redirect URL", async () => {
		const authRoutes = createAuthRoutes({
			dependencies: {
				handleAuthRequest: async () => new Response("unreachable", { status: 500 }),
				getSessionFromHeaders: async () => ({
					session: {
						token: "session-token-123",
					},
				}),
				getAllowedOrigins: () => ["https://quriosity.com.au"],
				getWebBaseUrl: () => "https://quriosity.com.au",
			},
		});

		const response = await authRoutes.request(
			"https://qcut-license-server.workers.dev/oauth/token-bridge?redirect_url=https%3A%2F%2Fquriosity.com.au%2Faccount%2Fdashboard.html%3Ffrom%3Dlogin",
			{ method: "GET" }
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location") ?? "";
		expect(location).toContain("https://quriosity.com.au/account/dashboard.html");
		expect(location).toContain("from=login");
		expect(location).toContain("auth_token=session-token-123");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
	});

	it("redirects to login with auth_error when no active session exists", async () => {
		const authRoutes = createAuthRoutes({
			dependencies: {
				handleAuthRequest: async () => new Response("unreachable", { status: 500 }),
				getSessionFromHeaders: async () => null,
				getAllowedOrigins: () => ["https://quriosity.com.au"],
				getWebBaseUrl: () => "https://quriosity.com.au",
			},
		});

		const response = await authRoutes.request(
			"https://qcut-license-server.workers.dev/oauth/token-bridge?redirect_url=https%3A%2F%2Fquriosity.com.au%2Faccount%2Fpricing.html",
			{ method: "GET" }
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location") ?? "";
		expect(location).toContain("/account/login.html");
		expect(location).toContain("auth_error=no_session");
		expect(location).toContain("redirect=%2Faccount%2Fpricing.html");
		expect(response.headers.get("cache-control")).toBe("no-store");
	});
});
