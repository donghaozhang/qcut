/**
 * Shared test helpers for Claude HTTP server integration tests.
 * Provides the fetch helper and mock window factory used by all test files.
 */

import * as http from "node:http";
import { vi } from "vitest";

/** Make an HTTP request to the test server and parse the JSON response. */
export function createFetch(getPort: () => number) {
	return function fetchJson(
		path: string,
		options: {
			method?: string;
			body?: string;
			headers?: Record<string, string>;
		} = {},
	): Promise<{
		status: number;
		body: any;
		headers: http.IncomingHttpHeaders;
	}> {
		return new Promise((resolve, reject) => {
			const req = http.request(
				{
					hostname: "127.0.0.1",
					port: getPort(),
					path,
					method: options.method || "GET",
					headers: {
						"Content-Type": "application/json",
						...(options.body
							? { "Content-Length": Buffer.byteLength(options.body) }
							: {}),
						...options.headers,
					},
				},
				(res) => {
					let data = "";
					res.on("data", (chunk) => {
						data += chunk;
					});
					res.on("end", () => {
						try {
							resolve({
								status: res.statusCode || 0,
								body: JSON.parse(data),
								headers: res.headers,
							});
						} catch {
							resolve({
								status: res.statusCode || 0,
								body: data,
								headers: res.headers,
							});
						}
					});
				},
			);
			req.on("error", reject);
			if (options.body) req.write(options.body);
			req.end();
		});
	};
}

/** Create a minimal mock BrowserWindow with a send spy. */
export function createMockWindow(send = vi.fn()) {
	return { webContents: { send } } as unknown as Electron.BrowserWindow;
}
