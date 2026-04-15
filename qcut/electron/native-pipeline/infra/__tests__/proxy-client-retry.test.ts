import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	proxyBackoffMs,
	proxyRequest,
	setSessionTokenProvider,
} from "../proxy-client.js";

describe("proxyBackoffMs", () => {
	it("uses exponential backoff for 429 starting at 5s", () => {
		expect(proxyBackoffMs(429, 0)).toBe(5000);
		expect(proxyBackoffMs(429, 1)).toBe(10_000);
		expect(proxyBackoffMs(429, 2)).toBe(20_000);
		expect(proxyBackoffMs(429, 3)).toBe(40_000);
	});

	it("uses linear backoff for 5xx starting at 1s", () => {
		expect(proxyBackoffMs(500, 0)).toBe(1000);
		expect(proxyBackoffMs(502, 1)).toBe(2000);
		expect(proxyBackoffMs(503, 2)).toBe(3000);
	});
});

describe("proxyRequest retry behavior", () => {
	const originalFetch = globalThis.fetch;
	let fetchCalls: number;

	beforeEach(() => {
		fetchCalls = 0;
		setSessionTokenProvider(async () => "test-token");
		vi.useFakeTimers();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	/** Mock `fetch` to return one response per call (in order). */
	function installFetchSequence(
		responses: Array<{ status: number; body?: unknown }>
	) {
		globalThis.fetch = vi.fn(async () => {
			const spec = responses[fetchCalls] ?? responses[responses.length - 1];
			fetchCalls++;
			const bodyText =
				spec.body == null
					? ""
					: typeof spec.body === "string"
						? spec.body
						: JSON.stringify(spec.body);
			return new Response(bodyText, {
				status: spec.status,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;
	}

	it("returns the first 2xx response without retries", async () => {
		installFetchSequence([{ status: 200, body: { hello: "world" } }]);
		const promise = proxyRequest({
			provider: "fal",
			endpoint: "https://queue.fal.run/x",
		});
		// No timers to advance — first attempt succeeds immediately.
		const res = await promise;
		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);
		expect(res.data).toEqual({ hello: "world" });
		expect(fetchCalls).toBe(1);
	});

	it("retries on 429 and succeeds on a later attempt", async () => {
		installFetchSequence([
			{ status: 429, body: { error: "rate limit" } },
			{ status: 429, body: { error: "rate limit" } },
			{ status: 200, body: { ok: true } },
		]);
		const promise = proxyRequest({
			provider: "gmi-llm",
			endpoint: "chat/completions",
		});
		// Advance past the backoff windows: 5s, then 10s.
		await vi.advanceTimersByTimeAsync(5000);
		await vi.advanceTimersByTimeAsync(10_000);
		const res = await promise;
		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);
		expect(fetchCalls).toBe(3);
	});

	it("retries on 5xx and succeeds on a later attempt", async () => {
		installFetchSequence([
			{ status: 503, body: "unavailable" },
			{ status: 200, body: { ok: true } },
		]);
		const promise = proxyRequest({
			provider: "fal",
			endpoint: "https://queue.fal.run/x",
		});
		await vi.advanceTimersByTimeAsync(1000); // 5xx linear backoff
		const res = await promise;
		expect(res.ok).toBe(true);
		expect(fetchCalls).toBe(2);
	});

	it("does not retry on 4xx other than 429", async () => {
		installFetchSequence([
			{ status: 401, body: { error: "unauthorized" } },
		]);
		const res = await proxyRequest({
			provider: "fal",
			endpoint: "https://queue.fal.run/x",
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(401);
		expect(fetchCalls).toBe(1);
	});

	it("exhausts retries and returns the last failing response", async () => {
		installFetchSequence([
			{ status: 429 },
			{ status: 429 },
			{ status: 429 },
			{ status: 429 }, // 4 total attempts = initial + 3 retries
		]);
		const promise = proxyRequest({
			provider: "gmi-llm",
			endpoint: "chat/completions",
		});
		// Advance through all backoff windows: 5s, 10s, 20s.
		await vi.advanceTimersByTimeAsync(5000);
		await vi.advanceTimersByTimeAsync(10_000);
		await vi.advanceTimersByTimeAsync(20_000);
		const res = await promise;
		expect(res.ok).toBe(false);
		expect(res.status).toBe(429);
		expect(fetchCalls).toBe(4);
	});
});
