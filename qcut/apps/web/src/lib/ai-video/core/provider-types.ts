/**
 * Provider Abstraction Types
 *
 * Defines the interface for video generation providers (FAL, GMI, etc.).
 * Handlers use these types to remain provider-agnostic — the ProviderRouter
 * selects the correct backend at runtime based on model config and key availability.
 */

/** Supported provider backends. */
export type ProviderBackend = "fal" | "gmi" | "runway" | "imarouter";

/** Result of submitting a generation request to a provider. */
export interface ProviderSubmitResult {
	requestId: string;
	provider: ProviderBackend;
}

/** Normalized poll result across all providers. */
export interface ProviderPollResult {
	status: "queued" | "processing" | "completed" | "failed";
	progress?: number;
	videoUrl?: string;
	thumbnailUrl?: string;
	error?: string;
}

/** Options for submitting a request via the provider router. */
export interface ProviderSubmitOptions {
	signal?: AbortSignal;
	timeout?: number;
}

/** Options for polling a request via the provider router. */
export interface ProviderPollOptions {
	maxAttempts?: number;
	pollIntervalMs?: number;
	onProgress?: (result: ProviderPollResult) => void;
	signal?: AbortSignal;
}

/** Interface that every provider client must implement. */
export interface ProviderClient {
	readonly name: ProviderBackend;
	/** Check whether this provider has a configured API key. */
	isAvailable(): Promise<boolean>;
	/** Submit a generation request. Returns a request ID for polling. */
	submit(
		model: string,
		payload: Record<string, unknown>,
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult>;
	/** Poll a previously submitted request for completion. */
	poll(
		requestId: string,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult>;
}
