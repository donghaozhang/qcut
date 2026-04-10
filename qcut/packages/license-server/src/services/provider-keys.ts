/**
 * Maps AI provider names to their environment variable keys, auth header
 * formats, and allowed endpoint prefixes (SSRF whitelist).
 */

export type AiProvider =
	| "fal"
	| "gemini"
	| "openrouter"
	| "elevenlabs"
	| "gmi"
	| "gmi-llm"
	| "runway"
	| "freesound";

interface ProviderConfig {
	envVar: string;
	/** Builds the auth headers for this provider given the resolved key. */
	buildHeaders: (key: string) => Record<string, string>;
	/** URL prefixes that the proxy is allowed to forward requests to. */
	allowedPrefixes: string[];
}

const PROVIDER_CONFIGS: Record<AiProvider, ProviderConfig> = {
	fal: {
		envVar: "FAL_API_KEY",
		buildHeaders: (key) => ({ Authorization: `Key ${key}` }),
		allowedPrefixes: [
			"https://queue.fal.run/",
			"https://fal.run/",
			"https://rest.alpha.fal.ai/",
		],
	},
	gemini: {
		envVar: "GEMINI_API_KEY",
		buildHeaders: (key) => ({ "x-goog-api-key": key }),
		allowedPrefixes: ["https://generativelanguage.googleapis.com/"],
	},
	openrouter: {
		envVar: "OPENROUTER_API_KEY",
		buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
		allowedPrefixes: ["https://openrouter.ai/api/"],
	},
	elevenlabs: {
		envVar: "ELEVENLABS_API_KEY",
		buildHeaders: (key) => ({ "xi-api-key": key }),
		allowedPrefixes: ["https://api.elevenlabs.io/"],
	},
	gmi: {
		envVar: "GMI_API_KEY",
		buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
		allowedPrefixes: ["https://console.gmicloud.ai/api/"],
	},
	"gmi-llm": {
		envVar: "GMI_API_KEY",
		buildHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
		allowedPrefixes: ["https://console.gmicloud.ai/api/"],
	},
	runway: {
		envVar: "RUNWAY_API_KEY",
		buildHeaders: (key) => ({
			Authorization: `Bearer ${key}`,
			"X-Runway-Version": "2024-11-06",
		}),
		allowedPrefixes: ["https://api.runwayml.com/"],
	},
	freesound: {
		envVar: "FREESOUND_API_KEY",
		buildHeaders: (key) => ({ Authorization: `Token ${key}` }),
		allowedPrefixes: ["https://freesound.org/apiv2/"],
	},
};

/** Checks whether a string is a supported provider name. */
export function isValidProvider(provider: string): provider is AiProvider {
	return provider in PROVIDER_CONFIGS;
}

/** Returns the full config for a provider. */
export function getProviderConfig(provider: AiProvider): ProviderConfig {
	return PROVIDER_CONFIGS[provider];
}

/** Resolves the API key for a provider from environment variables. */
export function getProviderKey(provider: AiProvider): string | undefined {
	const config = PROVIDER_CONFIGS[provider];
	const key = process.env[config.envVar]?.trim();
	return key && key.length > 0 ? key : undefined;
}

/** Builds the auth headers for a provider using the key from env. */
export function buildProviderAuthHeaders(
	provider: AiProvider
): Record<string, string> | null {
	const key = getProviderKey(provider);
	if (!key) {
		return null;
	}
	return PROVIDER_CONFIGS[provider].buildHeaders(key);
}

/** Validates that a target URL is within the provider's allowed prefixes. */
export function isEndpointAllowed({
	provider,
	url,
}: {
	provider: AiProvider;
	url: string;
}): boolean {
	const config = PROVIDER_CONFIGS[provider];
	return config.allowedPrefixes.some((prefix) => url.startsWith(prefix));
}
