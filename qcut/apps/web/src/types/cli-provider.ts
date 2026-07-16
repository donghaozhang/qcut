/**
 * CLI Provider Types for QCut Multi-Provider CLI Support
 *
 * Supports multiple AI coding agents:
 * - Gemini CLI: Free with Google account, uses OAuth
 * - OpenRouter Agent: 300+ models, pay-per-use with API key
 * - OpenAI Codex CLI: Official OpenAI coding agent, uses ChatGPT login
 * - Claude Code: Direct Anthropic access, requires claude CLI installed
 */

/**
 * Supported CLI providers for AI coding agents.
 */
export type CliProvider =
	| "gemini"
	| "openrouter"
	| "codex"
	| "claude"
	| "shell";

/**
 * Configuration for each CLI provider.
 */
export interface CliProviderConfig {
	/** Provider identifier */
	id: CliProvider;
	/** Human-readable provider name */
	name: string;
	/** Description of the provider */
	description: string;
	/** Command to spawn the CLI */
	command: string;
	/** Whether the provider requires an API key */
	requiresApiKey: boolean;
	/** Environment variable name for API key (if applicable) */
	apiKeyEnvVar?: string;
	/** Whether the provider supports skill injection via command flag */
	supportsSkillFlag: boolean;
	/** Format for skill flag (e.g., "--system-prompt" or "--full-context") */
	skillFlagFormat?: string;
}

/**
 * Provider configurations.
 */
export const CLI_PROVIDERS: Record<CliProvider, CliProviderConfig> = {
	gemini: {
		id: "gemini",
		name: "Gemini CLI",
		description: "Google's Gemini AI assistant",
		command: "npx @google/gemini-cli@latest",
		requiresApiKey: false, // Uses OAuth
		supportsSkillFlag: false, // Uses prompt injection
	},
	openrouter: {
		id: "openrouter",
		name: "OpenRouter Agent",
		description: "Multi-model AI via OpenRouter (300+ models)",
		command: "npx open-codex",
		requiresApiKey: true,
		apiKeyEnvVar: "OPENROUTER_API_KEY",
		supportsSkillFlag: true,
		skillFlagFormat: "--project-doc", // Pass skill markdown file as context
	},
	codex: {
		id: "codex",
		name: "OpenAI Codex CLI",
		description: "Official OpenAI coding agent (uses ChatGPT login)",
		command: "codex",
		requiresApiKey: false,
		supportsSkillFlag: false, // Uses prompt injection
	},
	claude: {
		id: "claude",
		name: "Claude Code",
		description: "Anthropic's Claude AI (uses login, API key optional)",
		command: "claude",
		requiresApiKey: false, // Uses Claude Pro/Max subscription by default, API key optional
		apiKeyEnvVar: "ANTHROPIC_API_KEY",
		supportsSkillFlag: true,
		skillFlagFormat: "--append-system-prompt", // Append skill content to system prompt
	},
	shell: {
		id: "shell",
		name: "Shell",
		description: "Standard terminal shell",
		command: "", // Uses default shell
		requiresApiKey: false,
		supportsSkillFlag: false,
	},
};

/**
 * Available models for OpenRouter Agent.
 */
export interface OpenRouterModel {
	/** Model ID in OpenRouter format (e.g., "anthropic/claude-sonnet-4") */
	id: string;
	/** Human-readable model name */
	name: string;
	/** Model provider (e.g., "Anthropic", "OpenAI") */
	provider: string;
	/** Maximum context length in tokens */
	contextLength: number;
	/** Pricing per 1K tokens (USD) */
	pricing: {
		prompt: number;
		completion: number;
	};
}

/**
 * Default models to show in selector.
 * These are popular, high-quality models with good code generation capabilities.
 */
export const DEFAULT_OPENROUTER_MODELS: OpenRouterModel[] = [
	{
		id: "minimax/minimax-m2.1",
		name: "MiniMax M2.1",
		provider: "MiniMax",
		contextLength: 1_000_000,
		pricing: { prompt: 0.0006, completion: 0.0022 },
	},
	{
		id: "anthropic/claude-sonnet-4",
		name: "Claude Sonnet 4",
		provider: "Anthropic",
		contextLength: 200_000,
		pricing: { prompt: 0.003, completion: 0.015 },
	},
	{
		id: "anthropic/claude-opus-4",
		name: "Claude Opus 4",
		provider: "Anthropic",
		contextLength: 200_000,
		pricing: { prompt: 0.015, completion: 0.075 },
	},
	{
		id: "openai/gpt-4o",
		name: "GPT-4o",
		provider: "OpenAI",
		contextLength: 128_000,
		pricing: { prompt: 0.005, completion: 0.015 },
	},
	{
		id: "google/gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		provider: "Google",
		contextLength: 1_000_000,
		pricing: { prompt: 0.001_25, completion: 0.005 },
	},
	{
		id: "deepseek/deepseek-chat",
		name: "DeepSeek Chat",
		provider: "DeepSeek",
		contextLength: 64_000,
		pricing: { prompt: 0.000_14, completion: 0.000_28 },
	},
];

/**
 * Available models for Claude Code CLI.
 */
export interface ClaudeModel {
	/** Model alias (e.g., "sonnet", "opus", "haiku") */
	id: string;
	/** Human-readable model name */
	name: string;
	/** Description of the model's strengths */
	description: string;
	/** Maximum context length in tokens */
	contextLength: number;
}

/**
 * Default models for Claude Code CLI.
 * These use Anthropic's simple aliases rather than full model names.
 */
export const CLAUDE_MODELS: ClaudeModel[] = [
	{
		id: "sonnet",
		name: "Claude Sonnet 4",
		description: "Balanced quality and speed",
		contextLength: 200_000,
	},
	{
		id: "opus",
		name: "Claude Opus 4.6",
		description: "Maximum quality",
		contextLength: 200_000,
	},
	{
		id: "haiku",
		name: "Claude Haiku 4",
		description: "Fast and efficient",
		contextLength: 200_000,
	},
];

/**
 * Get provider configuration by ID.
 */
export function getProviderConfig(provider: CliProvider): CliProviderConfig {
	return CLI_PROVIDERS[provider];
}

/**
 * Check if a provider requires API key configuration.
 */
export function providerRequiresApiKey(provider: CliProvider): boolean {
	return CLI_PROVIDERS[provider].requiresApiKey;
}

/** Default OpenRouter model ID (explicit to avoid array order dependency) */
const DEFAULT_OPENROUTER_MODEL_ID = "anthropic/claude-sonnet-4";

/**
 * Get default model for OpenRouter Agent.
 */
export function getDefaultOpenRouterModel(): string {
	return DEFAULT_OPENROUTER_MODEL_ID;
}

/** Default model ID for Claude (explicit to avoid array order dependency) */
const DEFAULT_CLAUDE_MODEL_ID = "opus";

/**
 * Get default model for Claude provider.
 */
export function getDefaultClaudeModel(): string {
	return DEFAULT_CLAUDE_MODEL_ID;
}
