import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetAuthToken = vi.fn();
vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		license: {
			getAuthToken: mockGetAuthToken,
		},
		apiKeys: undefined,
	}),
}));

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", mockFetch);
	mockFetch.mockReset();
	mockGetAuthToken.mockReset();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const { proxySubmit, proxyStatus, refundCredits, getSessionToken } =
	await import("../license-relay");

describe("license-relay", () => {
	describe("getSessionToken", () => {
		it("returns token from platform().license", async () => {
			mockGetAuthToken.mockResolvedValue("tok-abc");
			expect(await getSessionToken()).toBe("tok-abc");
		});

		it("returns empty string when the license API throws", async () => {
			mockGetAuthToken.mockRejectedValue(new Error("not signed in"));
			expect(await getSessionToken()).toBe("");
		});

		it("returns empty string when the token is null/undefined", async () => {
			mockGetAuthToken.mockResolvedValue(undefined);
			expect(await getSessionToken()).toBe("");
		});
	});

	describe("proxySubmit", () => {
		it("posts to /api/ai/proxy with provider + endpoint + body", async () => {
			mockGetAuthToken.mockResolvedValue("session-xyz");
			mockFetch.mockResolvedValue(
				new Response('{"id":"req-1"}', { status: 200 })
			);

			await proxySubmit({
				provider: "gmi",
				endpoint: "https://console.gmicloud.ai/api/v1/x/requests",
				body: { model: "seedance", payload: { prompt: "a" } },
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, init] = mockFetch.mock.calls[0];
			expect(url).toMatch(/\/api\/ai\/proxy$/);
			expect(init.method).toBe("POST");
			expect(init.headers["Content-Type"]).toBe("application/json");
			expect(init.headers.Authorization).toBe("Bearer session-xyz");
			expect(JSON.parse(init.body)).toEqual({
				provider: "gmi",
				endpoint: "https://console.gmicloud.ai/api/v1/x/requests",
				method: "POST",
				body: { model: "seedance", payload: { prompt: "a" } },
			});
		});

		it("uses an explicit sessionToken when provided", async () => {
			mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

			await proxySubmit({
				provider: "fal",
				endpoint: "https://fal.run/test",
				body: {},
				sessionToken: "explicit-token",
			});

			expect(mockGetAuthToken).not.toHaveBeenCalled();
			const [, init] = mockFetch.mock.calls[0];
			expect(init.headers.Authorization).toBe("Bearer explicit-token");
		});

		it("throws when no session token is available", async () => {
			mockGetAuthToken.mockResolvedValue("");

			await expect(
				proxySubmit({
					provider: "gmi",
					endpoint: "https://x/y",
					body: {},
				})
			).rejects.toThrow(/No QCut session token/);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("forwards AbortSignal", async () => {
			mockGetAuthToken.mockResolvedValue("tok");
			mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
			const controller = new AbortController();

			await proxySubmit({
				provider: "gmi",
				endpoint: "https://x",
				body: {},
				signal: controller.signal,
			});

			const [, init] = mockFetch.mock.calls[0];
			expect(init.signal).toBe(controller.signal);
		});

		it("attaches credits to the proxy body when provided", async () => {
			mockGetAuthToken.mockResolvedValue("tok");
			mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

			await proxySubmit({
				provider: "gmi",
				endpoint: "https://x/y",
				body: { model: "m" },
				credits: {
					amount: 2.08,
					modelKey: "gmi_seedance_2_0_260128_t2v",
					description: "GMI — Seedance",
				},
			});

			const [, init] = mockFetch.mock.calls[0];
			const parsed = JSON.parse(init.body);
			expect(parsed.credits).toEqual({
				amount: 2.08,
				modelKey: "gmi_seedance_2_0_260128_t2v",
				description: "GMI — Seedance",
			});
		});

		it("omits credits from body when amount is zero or undefined", async () => {
			mockGetAuthToken.mockResolvedValue("tok");
			mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

			await proxySubmit({
				provider: "gmi",
				endpoint: "https://x/y",
				body: {},
			});
			let [, init] = mockFetch.mock.calls[0];
			expect(JSON.parse(init.body).credits).toBeUndefined();

			await proxySubmit({
				provider: "gmi",
				endpoint: "https://x/y",
				body: {},
				credits: { amount: 0, modelKey: "m", description: "d" },
			});
			[, init] = mockFetch.mock.calls[1];
			expect(JSON.parse(init.body).credits).toBeUndefined();
		});
	});

	describe("refundCredits", () => {
		it("posts to /api/ai/refund with amount, modelKey, description", async () => {
			mockGetAuthToken.mockResolvedValue("session-xyz");
			mockFetch.mockResolvedValue(
				new Response('{"credits":{"totalCredits":50}}', { status: 200 })
			);

			await refundCredits({
				amount: 2.08,
				modelKey: "gmi_seedance_2_0_260128_t2v",
				description: "GMI — refund",
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, init] = mockFetch.mock.calls[0];
			expect(url).toMatch(/\/api\/ai\/refund$/);
			expect(init.method).toBe("POST");
			expect(init.headers.Authorization).toBe("Bearer session-xyz");
			expect(JSON.parse(init.body)).toEqual({
				amount: 2.08,
				modelKey: "gmi_seedance_2_0_260128_t2v",
				description: "GMI — refund",
			});
		});

		it("throws when no session token is available", async () => {
			mockGetAuthToken.mockResolvedValue("");
			await expect(
				refundCredits({ amount: 1, modelKey: "m", description: "d" })
			).rejects.toThrow(/No QCut session token/);
		});
	});

	describe("proxyStatus", () => {
		it("gets /api/ai/status with provider and requestId", async () => {
			mockGetAuthToken.mockResolvedValue("session-xyz");
			mockFetch.mockResolvedValue(
				new Response('{"status":"processing"}', { status: 200 })
			);

			await proxyStatus({ provider: "gmi", requestId: "req-456" });

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, init] = mockFetch.mock.calls[0];
			expect(url).toMatch(/\/api\/ai\/status\?/);
			expect(url).toContain("provider=gmi");
			expect(url).toContain("requestId=req-456");
			expect(init.method).toBe("GET");
			expect(init.headers.Authorization).toBe("Bearer session-xyz");
		});

		it("includes endpoint and statusUrl query params for FAL", async () => {
			mockGetAuthToken.mockResolvedValue("tok");
			mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

			await proxyStatus({
				provider: "fal",
				requestId: "abc",
				endpoint: "fal-ai/topaz",
				statusUrl: "https://queue.fal.run/fal-ai/topaz/requests/abc/status",
			});

			const [url] = mockFetch.mock.calls[0];
			expect(url).toContain("endpoint=fal-ai%2Ftopaz");
			expect(url).toContain("statusUrl=");
		});

		it("throws when no session token is available", async () => {
			mockGetAuthToken.mockResolvedValue("");

			await expect(
				proxyStatus({ provider: "gmi", requestId: "req-1" })
			).rejects.toThrow(/No QCut session token/);
			expect(mockFetch).not.toHaveBeenCalled();
		});
	});
});
