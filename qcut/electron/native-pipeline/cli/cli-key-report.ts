import type { KeyStatus } from "../infra/key-manager.js";

export const KEY_CATEGORIES = [
	"auth",
	"image",
	"video",
	"audio",
	"llm",
	"search",
	"avatar",
] as const;

export type KeyCategory = (typeof KEY_CATEGORIES)[number];
export type KeyFilter = "all" | "configured" | "missing";

export interface KeyReportEntry {
	name: string;
	configured: boolean;
	source: KeyStatus["source"];
	masked: string | null;
	requiredFor: KeyCategory[];
}

export interface KeyReport {
	summary: {
		configured: number;
		missing: number;
		total: number;
	};
	keys: KeyReportEntry[];
	recommendedNext: string[];
}

const KEY_REQUIRED_FOR: Record<string, KeyCategory[]> = {
	FAL_KEY: ["image", "video", "audio"],
	FREESOUND_API_KEY: ["audio", "search"],
	GEMINI_API_KEY: ["llm"],
	GOOGLE_AI_API_KEY: ["llm"],
	OPENROUTER_API_KEY: ["llm"],
	ANTHROPIC_API_KEY: ["llm"],
	ELEVENLABS_API_KEY: ["audio"],
	OPENAI_API_KEY: ["image", "audio", "llm"],
	RUNWAY_API_KEY: ["video"],
	HEYGEN_API_KEY: ["avatar", "video"],
	DID_API_KEY: ["avatar", "video"],
	SYNTHESIA_API_KEY: ["avatar", "video"],
	ARK_API_KEY: ["llm"],
	GMI_API_KEY: ["image", "video"],
	IMAROUTER_API_KEY: ["llm"],
	QCUT_AUTH_TOKEN: ["auth"],
};

const KEY_RECOMMENDATIONS: Record<string, string> = {
	QCUT_AUTH_TOKEN:
		"Set QCUT_AUTH_TOKEN to enable account-authenticated QCut commands.",
	FAL_KEY: "Set FAL_KEY to enable common image, video, and audio commands.",
	OPENAI_API_KEY:
		"Set OPENAI_API_KEY to enable OpenAI image, audio, and LLM commands.",
	RUNWAY_API_KEY: "Set RUNWAY_API_KEY to enable Runway video commands.",
	ELEVENLABS_API_KEY:
		"Set ELEVENLABS_API_KEY to enable ElevenLabs speech commands.",
};

function isKeyCategory({ value }: { value: string }): boolean {
	return (KEY_CATEGORIES as readonly string[]).includes(value);
}

function requiredForKey({ name }: { name: string }): KeyCategory[] {
	return KEY_REQUIRED_FOR[name] ?? [];
}

function matchesFilter({
	key,
	filter,
	category,
}: {
	key: KeyReportEntry;
	filter: KeyFilter;
	category?: KeyCategory;
}): boolean {
	if (filter === "configured" && !key.configured) return false;
	if (filter === "missing" && key.configured) return false;
	if (category && !key.requiredFor.includes(category)) return false;
	return true;
}

function recommendedNextFor({ keys }: { keys: KeyReportEntry[] }): string[] {
	const missingKeys = keys.filter((key) => !key.configured);
	const recommendations: string[] = [];

	for (const key of missingKeys) {
		const recommendation = KEY_RECOMMENDATIONS[key.name];
		if (recommendation) recommendations.push(recommendation);
	}

	if (recommendations.length > 0) return recommendations;
	if (missingKeys.length === 0) return [];
	return [`Set ${missingKeys[0]?.name} to enable related QCut commands.`];
}

export function normalizeKeyFilter({
	configured,
	missing,
}: {
	configured?: boolean;
	missing?: boolean;
}): KeyFilter {
	if (configured && missing) {
		throw new Error("Use only one of --configured or --missing");
	}
	if (configured) return "configured";
	if (missing) return "missing";
	return "all";
}

export function normalizeKeyCategory({
	category,
}: {
	category?: string;
}): KeyCategory | undefined {
	if (!category) return undefined;
	if (isKeyCategory({ value: category })) return category as KeyCategory;
	throw new Error(
		`Unknown key category '${category}'. Expected one of: ${KEY_CATEGORIES.join(", ")}`
	);
}

export function buildKeyReport({
	statuses,
	filter = "all",
	category,
}: {
	statuses: KeyStatus[];
	filter?: KeyFilter;
	category?: KeyCategory;
}): KeyReport {
	const decorated = statuses.map(
		(status): KeyReportEntry => ({
			name: status.name,
			configured: status.configured,
			source: status.source,
			masked: status.masked ?? null,
			requiredFor: requiredForKey({ name: status.name }),
		})
	);
	const keys = decorated.filter((key) =>
		matchesFilter({ key, filter, category })
	);
	const configured = keys.filter((key) => key.configured).length;
	const missing = keys.length - configured;

	return {
		summary: {
			configured,
			missing,
			total: keys.length,
		},
		keys,
		recommendedNext: recommendedNextFor({ keys }),
	};
}
