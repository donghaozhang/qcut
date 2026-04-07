/**
 * Provider Router
 *
 * Central routing layer that selects the correct provider backend (FAL, GMI)
 * for each model. Defaults to FAL; falls back to GMI when FAL is unavailable
 * or the model is GMI-only.
 */

import type {
	ProviderBackend,
	ProviderClient,
	ProviderSubmitResult,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderPollOptions,
} from "./provider-types";
import { falProvider } from "./fal-provider";
import { gmiClient } from "../../ai-clients/gmi-client";

/** Registered provider clients, keyed by backend name. */
const providers = new Map<ProviderBackend, ProviderClient>([
	["fal", falProvider],
	["gmi", gmiClient],
]);

/**
 * Resolve which provider to use for a model.
 *
 * @param preferredBackend - The backend specified in the model's registry entry
 * @returns The provider client to use
 */
async function resolveProvider(
	preferredBackend: ProviderBackend
): Promise<ProviderClient> {
	const preferred = providers.get(preferredBackend);
	if (preferred && (await preferred.isAvailable())) {
		return preferred;
	}

	// Don't silently fall back — GMI and FAL have incompatible payload schemas,
	// so routing a GMI-only model to FAL (or vice versa) causes confusing errors.
	throw new Error(
		`Provider "${preferredBackend}" is not available. ` +
			`Configure the API key: ${preferredBackend === "fal" ? "VITE_FAL_API_KEY" : "GMI_API_KEY"}.`
	);
}

/** Provider router singleton. */
export const providerRouter = {
	/**
	 * Submit a generation request via the appropriate provider.
	 *
	 * @param model - Model ID or endpoint (FAL path or GMI model name)
	 * @param payload - Model-specific request payload
	 * @param backend - Which provider backend to prefer (from ModelDefinition.providerBackend)
	 * @param options - Optional abort signal / timeout
	 */
	async submit(
		model: string,
		payload: Record<string, unknown>,
		backend: ProviderBackend = "fal",
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const provider = await resolveProvider(backend);
		return provider.submit(model, payload, options);
	},

	/**
	 * Poll a previously submitted request.
	 *
	 * @param requestId - The ID returned from submit()
	 * @param provider - Which provider backend issued the request
	 * @param options - Polling options (interval, max attempts, progress callback)
	 */
	async poll(
		requestId: string,
		provider: ProviderBackend,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult> {
		const client = providers.get(provider);
		if (!client) {
			throw new Error(`Unknown provider backend: ${provider}`);
		}
		return client.poll(requestId, options);
	},

	/** Check if a specific provider has a configured API key. */
	async isAvailable(backend: ProviderBackend): Promise<boolean> {
		const client = providers.get(backend);
		return client ? client.isAvailable() : false;
	},

	/** Register an additional provider client (for testing or future providers). */
	register(client: ProviderClient): void {
		providers.set(client.name, client);
	},
};
