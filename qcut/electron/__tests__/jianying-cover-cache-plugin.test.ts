// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Connect, ViteDevServer } from "vite";
import { jianyingCoverCachePlugin } from "../../apps/web/jianying-cover-cache-plugin";

const services = vi.hoisted(() => ({
	list: vi.fn(),
	prepare: vi.fn(),
	font: vi.fn(),
}));
vi.mock("../jianying-cover-private-cache", () => ({
	listPrivateCovers: services.list,
}));
vi.mock("../jianying-cover-prepare-layout", () => ({
	preparePrivateCoverTextLayout: services.prepare,
}));
vi.mock("../jianying-cover-font", () => ({
	readPrivateCoverFont: services.font,
}));

let server: Server;
let port: number;
async function invoke({
	url = "/",
	method = "GET",
	headers = {},
	body = "",
}: {
	url?: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
} = {}) {
	return new Promise<{ status: number; body: string }>((resolve, reject) => {
		const req = httpRequest(
			{ hostname: "127.0.0.1", port, path: url, method, headers },
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk) => chunks.push(chunk));
				response.on("end", () =>
					resolve({
						status: response.statusCode ?? 0,
						body: Buffer.concat(chunks).toString("utf8"),
					})
				);
			}
		);
		req.on("error", reject);
		req.end(body);
	});
}

describe("private cover development routes", () => {
	beforeEach(async () => {
		vi.resetAllMocks();
		services.list.mockResolvedValue({ entries: [] });
		services.prepare.mockResolvedValue({ texts: [] });
		services.font.mockResolvedValue({ covered: true });
		const use = vi.fn();
		const configure = jianyingCoverCachePlugin().configureServer;
		if (typeof configure !== "function")
			throw new Error("Missing cover middleware");
		configure.call(
			{} as never,
			{ middlewares: { use } } as unknown as ViteDevServer
		);
		expect(use.mock.calls[0][0]).toBe("/__qcut/private-covers");
		const middleware = use.mock.calls[0][1] as Connect.NextHandleFunction;
		server = createServer((req, res) =>
			middleware(req, res, () => res.writeHead(404).end())
		);
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve)
		);
		port = (server.address() as AddressInfo).port;
	});
	afterEach(async () => {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	});
	it.each([
		{ host: "evil.example" },
		{ origin: "https://evil.example" },
		{ "sec-fetch-site": "cross-site" },
	])("rejects untrusted request context before accessing private assets", async (headers) => {
		expect(
			(
				await invoke({
					url: `/layout/${"a".repeat(32)}`,
					method: "POST",
					headers,
				})
			).status
		).toBe(403);
		expect(services.prepare).not.toHaveBeenCalled();
		expect(services.list).not.toHaveBeenCalled();
	});
	it("accepts same-origin layout preparation and font inspection", async () => {
		const headers = { origin: `http://127.0.0.1:${port}` };
		expect(
			(
				await invoke({
					url: `/layout/${"a".repeat(32)}`,
					method: "POST",
					headers,
				})
			).status
		).toBe(200);
		expect(services.prepare).toHaveBeenCalledExactlyOnceWith({
			request: { packageHash: "a".repeat(32) },
		});
		expect(
			(
				await invoke({
					url: "/font",
					method: "POST",
					headers,
					body: JSON.stringify({ fontId: "fixture", text: "Hi" }),
				})
			).status
		).toBe(200);
		expect(services.font).toHaveBeenCalledExactlyOnceWith({
			request: { fontId: "fixture", text: "Hi" },
		});
	});
	it("rejects wrong methods and malformed or oversized bodies", async () => {
		expect((await invoke({ url: "/font" })).status).toBe(405);
		expect(
			(await invoke({ url: "/font", method: "POST", body: "not-json" })).status
		).toBe(500);
		expect(
			(
				await invoke({
					url: "/font",
					method: "POST",
					body: JSON.stringify({ text: "a".repeat(33000) }),
				})
			).status
		).toBe(500);
		expect(services.font).not.toHaveBeenCalled();
	});
	it("does not expose paths in integrity errors", async () => {
		services.prepare.mockRejectedValue(new Error("/private/user/font-file"));
		const result = await invoke({
			url: `/layout/${"a".repeat(32)}`,
			method: "POST",
		});
		expect(result.status).toBe(500);
		expect(result.body).not.toContain("/private/user");
	});
});
