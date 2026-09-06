import type { ComposeProvider } from "../compose-protocol.js";
import { createFalComposeProvider } from "./fal-compose-provider.js";
import { createQCutComposeProvider } from "./qcut-compose-provider.js";
import { type ComposeProviderAdapter } from "./compose-provider.js";
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
	fal,
	qcut,
}: {
	provider: ComposeProvider;
	openRouter?: OpenRouterComposeProviderDependencies;
	fal?: Parameters<typeof createFalComposeProvider>[0];
	qcut?: Parameters<typeof createQCutComposeProvider>[0];
}): ComposeProviderAdapter {
	switch (provider) {
		case "local":
			return createLocalComposeProvider();
		case "openrouter":
			return createOpenRouterComposeProvider(openRouter);
		case "qcut":
			return createQCutComposeProvider(qcut);
		case "fal":
			return createFalComposeProvider(fal);
	}
}
