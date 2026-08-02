import {
	getSessionToken,
	LICENSE_SERVER_URL,
} from "@/lib/ai-video/core/license-relay";

export type SessionTokenReader = () => Promise<string>;

function requestUrl({ input }: { input: RequestInfo | URL }): URL {
	const rawUrl = input instanceof Request ? input.url : input.toString();
	const baseUrl =
		typeof globalThis.location === "undefined"
			? "http://localhost/"
			: globalThis.location.href;
	return new URL(rawUrl, baseUrl);
}

function mergedRequestHeaders({
	init,
	input,
}: {
	init?: RequestInit;
	input: RequestInfo | URL;
}): Headers {
	const headers = new Headers(
		input instanceof Request ? input.headers : undefined
	);
	const additionalHeaders = new Headers(init?.headers);
	for (const [name, value] of additionalHeaders.entries()) {
		headers.set(name, value);
	}
	return headers;
}

export function createLicenseServerAuthenticatedFetch({
	authErrorMessage,
	fetchImpl = fetch,
	getToken = getSessionToken,
	licenseServerUrl = LICENSE_SERVER_URL,
}: {
	authErrorMessage: string;
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	licenseServerUrl?: string;
}): typeof fetch {
	const licenseServerOrigin = new URL(licenseServerUrl).origin;

	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (requestUrl({ input }).origin !== licenseServerOrigin) {
			return fetchImpl(input, init);
		}

		const token = await getToken();
		if (!token) throw new Error(authErrorMessage);
		const headers = mergedRequestHeaders({ init, input });
		headers.set("Authorization", `Bearer ${token}`);
		return fetchImpl(input, { ...init, headers });
	}) as typeof fetch;
}
