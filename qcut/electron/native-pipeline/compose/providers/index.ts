import type { ComposeProvider } from "../compose-protocol.js";
import {
	unsupportedComposeProvider,
	type ComposeProviderAdapter,
} from "./compose-provider.js";
import { createLocalComposeProvider } from "./local-compose-provider.js";
import {
	createOpenRouterComposeProvider,
	type OpenRouterComposeProviderDependencies,
} from "./openrouter-compose-provider.js";

export {
	createComposeJobRecord,
	transitionComposeJob,
	unsupportedComposeProvider,
	type ComposeProviderAdapter,
} from "./compose-provider.js";
export { createLocalComposeProvider } from "./local-compose-provider.js";
export {
	createOpenRouterComposeProvider,
	type OpenRouterComposeProviderDependencies,
} from "./openrouter-compose-provider.js";

export function createComposeProviderAdapter({
	provider,
	openRouter,
}: {
	provider: ComposeProvider;
	openRouter?: OpenRouterComposeProviderDependencies;
}): ComposeProviderAdapter {
	switch (provider) {
		case "local":
			return createLocalComposeProvider();
		case "openrouter":
			return createOpenRouterComposeProvider(openRouter);
		case "qcut":
			return unsupportedComposeProvider({
				provider: "qcut",
				detail:
					"The QCut cloud compose endpoint is not available yet; use --provider local or openrouter.",
			});
		case "fal":
			return unsupportedComposeProvider({
				provider: "fal",
				detail:
					"The FAL compose provider is not available yet; use --provider local or openrouter.",
			});
	}
}
