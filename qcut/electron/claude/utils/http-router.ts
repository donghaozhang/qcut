/**
 * Lightweight HTTP Router for Claude API
 * Matches METHOD /path/:param patterns, parses JSON bodies, extracts query params.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";
import { generateId } from "./helpers.js";
import type {
	CommandLifecycle,
	CorrelationId,
} from "../../types/claude-api.js";

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}

/** Sentinel value: handler already wrote the response (e.g. streaming). */
export const RESPONSE_HANDLED = Symbol("RESPONSE_HANDLED");

export interface ParsedRequest {
	params: Record<string, string>;
	query: Record<string, string>;
	body: any;
	responseMeta?: RouteResponseMeta;
	/** Raw Node ServerResponse — use for streaming responses. */
	rawRes: ServerResponse;
}

export interface RouteResponseMeta {
	correlationId?: CorrelationId;
	lifecycle?: CommandLifecycle;
}

interface Route {
	method: string;
	pattern: RegExp;
	paramNames: string[];
	handler: (req: ParsedRequest) => Promise<unknown>;
}

/** Convert a route path with :param placeholders into a RegExp and extract param names. */
function pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
	const paramNames: string[] = [];
	const regexStr = path.replace(
		/:([a-zA-Z_][a-zA-Z0-9_]*)/g,
		(_match, name) => {
			paramNames.push(name);
			return "([^/]+)";
		}
	);
	return { pattern: new RegExp(`^${regexStr}$`), paramNames };
}

/** Parse the request body as JSON, enforcing a 1MB size limit. */
function parseBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let body = "";
		let size = 0;
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_SIZE) {
				req.destroy();
				reject(new HttpError(413, "Payload too large"));
				return;
			}
			body += chunk;
		});
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : undefined);
			} catch {
				reject(new HttpError(400, "Invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

export interface Router {
	get(path: string, handler: (req: ParsedRequest) => Promise<unknown>): void;
	post(path: string, handler: (req: ParsedRequest) => Promise<unknown>): void;
	patch(path: string, handler: (req: ParsedRequest) => Promise<unknown>): void;
	delete(path: string, handler: (req: ParsedRequest) => Promise<unknown>): void;
	handle(req: IncomingMessage, res: ServerResponse): void;
}

/** Create a lightweight HTTP router that matches METHOD /path/:param patterns. */
export function createRouter(): Router {
	const routes: Route[] = [];

	function addRoute(
		method: string,
		path: string,
		handler: (req: ParsedRequest) => Promise<unknown>
	) {
		const { pattern, paramNames } = pathToRegex(path);
		routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
	}

	function sendJson({
		res,
		status,
		data,
		meta,
	}: {
		res: ServerResponse;
		status: number;
		data: Record<string, unknown>;
		meta?: RouteResponseMeta;
	}) {
		let correlationId = meta?.correlationId;
		try {
			correlationId = correlationId ?? (generateId("corr") as CorrelationId);
		} catch {
			correlationId =
				`corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as CorrelationId;
		}

		const responseBody: Record<string, unknown> = {
			...data,
			correlationId,
		};
		if (meta?.lifecycle) {
			responseBody.lifecycle = meta.lifecycle;
		}

		res.writeHead(status, {
			"Content-Type": "application/json",
			"X-Correlation-Id": correlationId,
		});
		res.end(JSON.stringify(responseBody));
	}

	async function handle(req: IncomingMessage, res: ServerResponse) {
		const method = (req.method || "GET").toUpperCase();
		const parsed = parse(req.url || "/", true);
		const pathname = parsed.pathname || "/";
		const query: Record<string, string> = {};
		for (const [key, val] of Object.entries(parsed.query)) {
			if (typeof val === "string") query[key] = val;
		}

		for (const route of routes) {
			if (route.method !== method) continue;
			const match = pathname.match(route.pattern);
			if (!match) continue;

			const responseMeta: RouteResponseMeta = {};
			try {
				const params: Record<string, string> = {};
				for (let i = 0; i < route.paramNames.length; i++) {
					params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
				}

				let body: unknown;
				if (
					method === "POST" ||
					method === "PATCH" ||
					method === "PUT" ||
					method === "DELETE"
				) {
					body = await parseBody(req);
				}
				const result = await route.handler({
					params,
					query,
					body,
					responseMeta,
					rawRes: res,
				});
				if (result === RESPONSE_HANDLED) return;
				sendJson({
					res,
					status: 200,
					data: {
						success: true,
						data: result,
						timestamp: Date.now(),
					},
					meta: responseMeta,
				});
			} catch (error: unknown) {
				if (error instanceof URIError) {
					sendJson({
						res,
						status: 400,
						data: {
							success: false,
							error: "Invalid URL encoding",
							timestamp: Date.now(),
						},
						meta: responseMeta,
					});
				} else if (error instanceof HttpError) {
					sendJson({
						res,
						status: error.status,
						data: {
							success: false,
							error: error.message,
							timestamp: Date.now(),
						},
						meta: responseMeta,
					});
				} else {
					const message =
						error instanceof Error ? error.message : "Internal server error";
					sendJson({
						res,
						status: 500,
						data: {
							success: false,
							error: message,
							timestamp: Date.now(),
						},
						meta: responseMeta,
					});
				}
			}
			return;
		}

		// No route matched
		sendJson({
			res,
			status: 404,
			data: {
				success: false,
				error: `Not found: ${method} ${pathname}`,
				timestamp: Date.now(),
			},
		});
	}

	return {
		get: (path, handler) => addRoute("GET", path, handler),
		post: (path, handler) => addRoute("POST", path, handler),
		patch: (path, handler) => addRoute("PATCH", path, handler),
		delete: (path, handler) => addRoute("DELETE", path, handler),
		handle,
	};
}

// CommonJS export for compatibility
module.exports = { createRouter, HttpError };
