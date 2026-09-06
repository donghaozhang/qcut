export function createComposeQueueHttp({
	baseUrl,
	authorization,
	fetchImpl = fetch,
}: {
	baseUrl: string;
	authorization: () => string;
	fetchImpl?: typeof fetch;
}) {
	const url = new URL(baseUrl);
	if (
		url.username ||
		url.password ||
		(url.protocol !== "https:" &&
			!(
				url.protocol === "http:" &&
				["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
			))
	)
		throw new Error(
			"Compose endpoint requires HTTPS (or local development HTTP)."
		);
	return async ({
		path,
		method = "GET",
		body,
		signal,
	}: {
		path: string;
		method?: string;
		body?: unknown;
		signal?: AbortSignal;
	}): Promise<Record<string, unknown>> => {
		const auth = authorization();
		if (!auth)
			throw new Error("Compose provider credentials are not configured.");
		const timeout = AbortSignal.timeout(120_000);
		const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, {
			method,
			redirect: "error",
			headers: { Authorization: auth, "Content-Type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		});
		if (!response.ok)
			throw new Error(
				`Compose provider HTTP ${response.status}. Retry by resuming the same job; do not submit a duplicate.`
			);
		const value: unknown = await response.json();
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new Error("Invalid Compose provider response.");
		return value as Record<string, unknown>;
	};
}
