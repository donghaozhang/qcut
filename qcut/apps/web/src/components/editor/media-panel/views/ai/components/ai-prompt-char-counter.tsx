import { UI_CONSTANTS } from "../constants/ai-constants";

interface AIPromptCharCounterProps {
	/** Current prompt length in characters. */
	length: number;
	/**
	 * Reference cap used for the "X chars remaining" countdown. Defaults to
	 * `UI_CONSTANTS.STRONG_PROMPT_WARN_CHARS` (8000). Sora 2 passes 5000.
	 */
	maxChars?: number;
	/**
	 * Soft warning threshold. Above this, show a yellow "may be too long for
	 * some models (e.g. Kling caps at 2500)" hint. Defaults to 2500.
	 */
	softWarnChars?: number;
	/**
	 * Strong warning threshold. Above this, show a red "likely to be rejected
	 * by API" hint. Defaults to 8000.
	 */
	strongWarnChars?: number;
	/** Optional inline note (e.g. "Sora 2: 5000 max"). */
	note?: string;
}

/**
 * Tiered character counter for the AI prompt textarea.
 *
 * Behavior:
 *   - length ≤ softWarn  → muted "X characters remaining"
 *   - softWarn < length ≤ strongWarn → orange soft warning + remaining
 *   - length > strongWarn → red strong warning + over-limit count
 *
 * Never blocks input; the parent textarea should NOT set `maxLength` so users
 * can paste long content and decide for themselves.
 */
export function AIPromptCharCounter({
	length,
	maxChars = UI_CONSTANTS.STRONG_PROMPT_WARN_CHARS,
	softWarnChars = UI_CONSTANTS.SOFT_PROMPT_WARN_CHARS,
	strongWarnChars = UI_CONSTANTS.STRONG_PROMPT_WARN_CHARS,
	note,
}: AIPromptCharCounterProps) {
	const remaining = maxChars - length;
	const overSoft = length > softWarnChars;
	const overStrong = length > strongWarnChars;

	let toneClass = "text-muted-foreground";
	if (overStrong) toneClass = "text-red-500";
	else if (overSoft) toneClass = "text-orange-500";
	else if (remaining < 50) toneClass = "text-orange-500";

	return (
		<div className={`text-xs ${toneClass} text-right`}>
			{overStrong ? (
				<span>
					⚠ {length - strongWarnChars} chars over strong limit (
					{strongWarnChars}) — may be rejected by the API
				</span>
			) : overSoft ? (
				<span>
					⚠ {length - softWarnChars} chars over soft limit ({softWarnChars}) —
					may be too long for some models (e.g. Kling caps at 2500)
				</span>
			) : (
				<span>{remaining} characters remaining</span>
			)}
			{note && <span className="ml-2 text-primary">({note})</span>}
		</div>
	);
}
