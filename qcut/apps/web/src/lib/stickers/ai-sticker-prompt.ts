const MIN_PROMPT_LENGTH = 2;
const MAX_PROMPT_LENGTH = 500;

export interface AIStickerPromptOptions {
	prompt: string;
	transparentBackground: boolean;
}

export function validateAIStickerPrompt({
	prompt,
}: {
	prompt: string;
}): string | null {
	const normalized = prompt.trim();
	if (normalized.length < MIN_PROMPT_LENGTH) return "请输入至少 2 个字符";
	if (normalized.length > MAX_PROMPT_LENGTH) return "提示词不能超过 500 个字符";
	return null;
}

export function buildAIStickerPrompt({
	prompt,
	transparentBackground,
}: AIStickerPromptOptions): string {
	const backgroundInstruction = transparentBackground
		? "Render on a fully transparent alpha background with no shadow outside the sticker border."
		: "Render on a clean solid background with strong contrast.";
	return [
		prompt.trim(),
		"Create one original production-ready video sticker, centered, readable at thumbnail size, with a clean die-cut outline and polished vector-like detail.",
		"Do not include logos, watermarks, copyrighted characters, UI chrome, or a mockup scene.",
		backgroundInstruction,
	].join(" ");
}
