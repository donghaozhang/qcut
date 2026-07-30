export const DEFAULT_LICENSE_SERVER_ORIGIN =
	"https://qcut-license-server.zdhpeter.workers.dev";

export function resolveAllowedLicenseServerOrigin({
	configuredUrl,
}: {
	configuredUrl: string;
}): string | null {
	try {
		const parsedUrl = new URL(configuredUrl);
		const isHttps = parsedUrl.protocol === "https:";
		const isLocalHttp =
			parsedUrl.protocol === "http:" &&
			(parsedUrl.hostname === "localhost" ||
				parsedUrl.hostname === "127.0.0.1");

		return isHttps || isLocalHttp ? parsedUrl.origin : null;
	} catch {
		return null;
	}
}

export function resolveLicenseServerCspOrigins({
	configuredUrl,
}: {
	configuredUrl?: string;
}): string[] {
	const origins = new Set([DEFAULT_LICENSE_SERVER_ORIGIN]);
	const configuredOrigin = configuredUrl
		? resolveAllowedLicenseServerOrigin({ configuredUrl })
		: null;

	if (configuredOrigin) {
		origins.add(configuredOrigin);
	}

	return [...origins];
}
