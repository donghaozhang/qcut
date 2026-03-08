import type { Framing, Lighting, Movement, ShotMood } from "./types";

export const DEFAULT_STYLE = "cinematic";
export const MIN_SHOTS = 4;
export const MAX_SHOTS = 24;
export const VALID_FRAMINGS = ["wide", "medium", "close", "macro", "overhead"] as const;
export const VALID_MOVEMENTS = ["locked-off", "handheld", "dolly", "slider", "crane", "dynamic"] as const;
export const VALID_LIGHTINGS = ["natural", "bright", "dramatic", "low-key", "neon", "soft"] as const;
export const VALID_MOODS = ["grounded", "warm", "tense", "moody", "polished", "heightened"] as const;

export const PRESETS: Record<
	string,
	{
		framing: Framing;
		movement: Movement;
		lighting: Lighting;
		mood: ShotMood;
	}
> = {
	cinematic: { framing: "wide", movement: "dolly", lighting: "dramatic", mood: "moody" },
	documentary: { framing: "medium", movement: "handheld", lighting: "natural", mood: "grounded" },
	commercial: { framing: "close", movement: "slider", lighting: "bright", mood: "polished" },
	"anime-storyboard": { framing: "wide", movement: "dynamic", lighting: "dramatic", mood: "heightened" },
	noir: { framing: "close", movement: "locked-off", lighting: "low-key", mood: "tense" },
	product: { framing: "macro", movement: "slider", lighting: "bright", mood: "polished" },
};

export const STYLE_SIGNAL_MAP: Array<{ preset: string; keywords: string[] }> = [
	{ preset: "documentary", keywords: ["real", "interview", "documentary", "truth", "observation"] },
	{ preset: "commercial", keywords: ["brand", "product", "launch", "premium", "marketing"] },
	{ preset: "anime-storyboard", keywords: ["anime", "fantasy", "hero", "battle", "magic"] },
	{ preset: "noir", keywords: ["crime", "noir", "shadow", "mystery", "detective"] },
	{ preset: "product", keywords: ["device", "product", "feature", "unboxing", "detail"] },
	{ preset: "cinematic", keywords: ["story", "scene", "cinematic", "film", "character"] },
];
