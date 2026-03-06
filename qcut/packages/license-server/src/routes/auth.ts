import { Hono } from "hono";
import {
	getAllowedCorsOrigins,
	getPaymentWebBaseUrl,
} from "../services/payment-config";

const DEFAULT_LOGIN_PATH = "/account/login.html";
const DEFAULT_DASHBOARD_PATH = "/account/dashboard.html";

interface SessionPayload {
	session: {
		token: string;
	};
}

interface AuthRouteDependencies {
	handleAuthRequest: ({ request }: { request: Request }) => Promise<Response>;
	getSessionFromHeaders: ({
		headers,
	}: {
		headers: Headers;
	}) => Promise<SessionPayload | null>;
	getAllowedOrigins: () => string[];
	getWebBaseUrl: () => string;
}

interface BetterAuthInstance {
	handler: (request: Request) => Promise<Response>;
	api: {
		getSession: ({
			headers,
			asResponse,
		}: {
			headers: Headers;
			asResponse?: boolean;
		}) => Promise<SessionPayload | null>;
	};
}

interface ResolvedAuthUrls {
	loginUrl: string;
	dashboardUrl: string;
}

/** Parses a URL string without throwing. */
function toUrlOrNull({ value }: { value: string }): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

/** Extracts the origin portion of a URL string. */
function normalizeOrigin({ value }: { value: string }): string {
	try {
		const url = new URL(value);
		return url.origin;
	} catch {
		return "";
	}
}

/** Canonicalizes a URL while trimming a trailing slash from its path. */
function normalizeUrlWithoutTrailingSlash({
	value,
}: {
	value: string;
}): string {
	try {
		const url = new URL(value);
		const pathname = url.pathname.endsWith("/")
			? url.pathname.slice(0, -1)
			: url.pathname;
		return `${url.origin}${pathname}${url.search}${url.hash}`;
	} catch {
		return value;
	}
}

/** Builds the OAuth redirect allowlist from config and the web base URL. */
function resolveAllowedOrigins({
	allowedOrigins,
	webBaseUrl,
}: {
	allowedOrigins: string[];
	webBaseUrl: string;
}): Set<string> {
	try {
		const origins = new Set<string>();
		for (const origin of allowedOrigins) {
			const normalized = normalizeOrigin({ value: origin });
			if (normalized.length === 0) {
				continue;
			}
			origins.add(normalized);
		}

		const normalizedWebOrigin = normalizeOrigin({ value: webBaseUrl });
		if (normalizedWebOrigin.length > 0) {
			origins.add(normalizedWebOrigin);
		}

		return origins;
	} catch {
		return new Set<string>();
	}
}

/** Computes default login and dashboard redirects for auth flows. */
function resolveDefaultAuthUrls({
	webBaseUrl,
}: {
	webBaseUrl: string;
}): ResolvedAuthUrls {
	try {
		const normalizedWebBaseUrl = normalizeUrlWithoutTrailingSlash({
			value: webBaseUrl,
		});
		return {
			loginUrl: `${normalizedWebBaseUrl}${DEFAULT_LOGIN_PATH}`,
			dashboardUrl: `${normalizedWebBaseUrl}${DEFAULT_DASHBOARD_PATH}`,
		};
	} catch {
		return {
			loginUrl: `https://quriosity.com.au${DEFAULT_LOGIN_PATH}`,
			dashboardUrl: `https://quriosity.com.au${DEFAULT_DASHBOARD_PATH}`,
		};
	}
}

/** Accepts only allowlisted HTTP(S) redirect targets. */
function resolveRedirectUrl({
	candidate,
	fallback,
	allowedOrigins,
}: {
	candidate: string | null;
	fallback: string;
	allowedOrigins: Set<string>;
}): URL {
	try {
		if (typeof candidate !== "string" || candidate.trim().length === 0) {
			return new URL(fallback);
		}

		const parsedCandidate = toUrlOrNull({ value: candidate.trim() });
		if (!parsedCandidate) {
			return new URL(fallback);
		}

		if (
			parsedCandidate.protocol !== "https:" &&
			parsedCandidate.protocol !== "http:"
		) {
			return new URL(fallback);
		}

		if (!allowedOrigins.has(parsedCandidate.origin)) {
			return new URL(fallback);
		}

		return parsedCandidate;
	} catch {
		return new URL(fallback);
	}
}

/** Appends or replaces a single query parameter on a URL. */
function addQueryParam({
	target,
	key,
	value,
}: {
	target: URL;
	key: string;
	value: string;
}): URL {
	try {
		target.searchParams.set(key, value);
		return target;
	} catch {
		return target;
	}
}

/** Constrains bridge redirects to same-origin absolute paths. */
function buildRedirectTargetFromPath({
	path,
	defaultTarget,
}: {
	path: string;
	defaultTarget: URL;
}): string {
	try {
		if (path.length === 0) {
			return defaultTarget.toString();
		}

		const startsWithSlash = path.startsWith("/");
		if (!startsWithSlash) {
			return defaultTarget.toString();
		}

		if (path.startsWith("//")) {
			return defaultTarget.toString();
		}

		return `${defaultTarget.origin}${path}`;
	} catch {
		return defaultTarget.toString();
	}
}

/** Lazily loads and caches the shared Better Auth instance. */
async function getAuthInstance(): Promise<BetterAuthInstance> {
	try {
		const { getAuth } = await import("../auth/better-auth");
		return getAuth() as BetterAuthInstance;
	} catch (error) {
		throw new Error(
			error instanceof Error
				? `Failed to load auth module: ${error.message}`
				: "Failed to load auth module"
		);
	}
}

/** Creates the auth bridge routes used by web and desktop clients. */
export function createAuthRoutes({
	dependencies,
}: {
	dependencies?: Partial<AuthRouteDependencies>;
} = {}) {
	const authRoutes = new Hono();
	const resolvedDependencies: AuthRouteDependencies = {
		/** Proxies incoming auth requests to the shared Better Auth handler. */
		handleAuthRequest: async ({ request }) => {
			try {
				const auth = await getAuthInstance();
				return await auth.handler(request);
			} catch (error) {
				return new Response(
					JSON.stringify({
						error:
							error instanceof Error
								? `Auth handler failed: ${error.message}`
								: "Auth handler failed",
					}),
					{
						status: 500,
						headers: {
							"content-type": "application/json",
						},
					}
				);
			}
		},
		/** Resolves session data from request headers when auth is available. */
		getSessionFromHeaders: async ({ headers }) => {
			try {
				const auth = await getAuthInstance();
				const session = await auth.api.getSession({
					headers,
					asResponse: false,
				});
				if (!session) {
					return null;
				}
				return session;
			} catch {
				return null;
			}
		},
		/** Returns the allowlisted origins used for auth redirects. */
		getAllowedOrigins: () => {
			try {
				return getAllowedCorsOrigins();
			} catch {
				return [];
			}
		},
		/** Returns the canonical web base URL used in auth redirects. */
		getWebBaseUrl: () => {
			try {
				return getPaymentWebBaseUrl();
			} catch {
				return "https://quriosity.com.au";
			}
		},
		...dependencies,
	};

	authRoutes.get("/google/start", async (c) => {
		try {
			const webBaseUrl = resolvedDependencies.getWebBaseUrl();
			const defaultUrls = resolveDefaultAuthUrls({ webBaseUrl });
			const allowedOrigins = resolveAllowedOrigins({
				allowedOrigins: resolvedDependencies.getAllowedOrigins(),
				webBaseUrl,
			});

			const dashboardRedirect = resolveRedirectUrl({
				candidate: c.req.query("redirect_url") ?? null,
				fallback: defaultUrls.dashboardUrl,
				allowedOrigins,
			});

			const loginRedirect = resolveRedirectUrl({
				candidate: c.req.query("error_redirect_url") ?? null,
				fallback: defaultUrls.loginUrl,
				allowedOrigins,
			});

			const requestUrl = new URL(c.req.url);
			const callbackBridge = new URL(
				"/api/auth/oauth/token-bridge",
				requestUrl.origin
			);
			callbackBridge.searchParams.set(
				"redirect_url",
				dashboardRedirect.toString()
			);

			const errorRedirect = addQueryParam({
				target: loginRedirect,
				key: "redirect",
				value: dashboardRedirect.pathname + dashboardRedirect.search,
			});

			const authRequest = new Request(
				new URL("/api/auth/sign-in/social", requestUrl.origin),
				{
					method: "POST",
					headers: new Headers({
						"content-type": "application/json",
						accept: "application/json",
						cookie: c.req.header("cookie") ?? "",
					}),
					body: JSON.stringify({
						provider: "google",
						callbackURL: callbackBridge.toString(),
						errorCallbackURL: errorRedirect.toString(),
					}),
				}
			);

			return await resolvedDependencies.handleAuthRequest({
				request: authRequest,
			});
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? `Failed to start Google OAuth: ${error.message}`
							: "Failed to start Google OAuth",
				},
				500
			);
		}
	});

	authRoutes.get("/oauth/token-bridge", async (c) => {
		try {
			const webBaseUrl = resolvedDependencies.getWebBaseUrl();
			const defaultUrls = resolveDefaultAuthUrls({ webBaseUrl });
			const allowedOrigins = resolveAllowedOrigins({
				allowedOrigins: resolvedDependencies.getAllowedOrigins(),
				webBaseUrl,
			});

			const dashboardRedirect = resolveRedirectUrl({
				candidate: c.req.query("redirect_url") ?? null,
				fallback: defaultUrls.dashboardUrl,
				allowedOrigins,
			});

			const session = await resolvedDependencies.getSessionFromHeaders({
				headers: c.req.raw.headers,
			});
			if (!session?.session?.token) {
				const loginRedirect = new URL(defaultUrls.loginUrl);
				const redirectPath =
					dashboardRedirect.pathname + dashboardRedirect.search;
				addQueryParam({
					target: loginRedirect,
					key: "redirect",
					value: redirectPath,
				});
				addQueryParam({
					target: loginRedirect,
					key: "auth_error",
					value: "no_session",
				});
				const response = c.redirect(loginRedirect.toString(), 302);
				response.headers.set("Cache-Control", "no-store");
				response.headers.set("Pragma", "no-cache");
				return response;
			}

			// Token bridge supports static web clients that cannot access the auth cookie domain.
			// Keep this query param flow, but reduce leakage via no-store/no-referrer headers.
			addQueryParam({
				target: dashboardRedirect,
				key: "auth_token",
				value: session.session.token,
			});
			const response = c.redirect(dashboardRedirect.toString(), 302);
			response.headers.set("Cache-Control", "no-store");
			response.headers.set("Pragma", "no-cache");
			response.headers.set("Referrer-Policy", "no-referrer");
			return response;
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? `Failed to bridge auth token: ${error.message}`
							: "Failed to bridge auth token",
				},
				500
			);
		}
	});

	authRoutes.get("/oauth/error-bridge", async (c) => {
		try {
			const webBaseUrl = resolvedDependencies.getWebBaseUrl();
			const defaultUrls = resolveDefaultAuthUrls({ webBaseUrl });
			const allowedOrigins = resolveAllowedOrigins({
				allowedOrigins: resolvedDependencies.getAllowedOrigins(),
				webBaseUrl,
			});

			const loginRedirect = resolveRedirectUrl({
				candidate: c.req.query("redirect_url") ?? null,
				fallback: defaultUrls.loginUrl,
				allowedOrigins,
			});

			const redirectPath = buildRedirectTargetFromPath({
				path: c.req.query("next") ?? "",
				defaultTarget: new URL(defaultUrls.dashboardUrl),
			});

			const authError = c.req.query("error") ?? "oauth_failed";
			addQueryParam({
				target: loginRedirect,
				key: "redirect",
				value: redirectPath,
			});
			addQueryParam({
				target: loginRedirect,
				key: "auth_error",
				value: authError,
			});
			return c.redirect(loginRedirect.toString(), 302);
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? `Failed to bridge OAuth error: ${error.message}`
							: "Failed to bridge OAuth error",
				},
				500
			);
		}
	});

	authRoutes.all("/*", async (c) => {
		try {
			return await resolvedDependencies.handleAuthRequest({
				request: c.req.raw,
			});
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? `Auth route failed: ${error.message}`
							: "Auth route failed",
				},
				500
			);
		}
	});

	return authRoutes;
}

export const authRoutes = createAuthRoutes();
