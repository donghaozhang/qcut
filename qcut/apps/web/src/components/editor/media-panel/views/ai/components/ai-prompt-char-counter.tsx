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
	softWarnChars: rawSoftWarnChars = UI_CONSTANTS.SOFT_PROMPT_WARN_CHARS,
	strongWarnChars: rawStrongWarnChars = UI_CONSTANTS.STRONG_PROMPT_WARN_CHARS,
	note,
}: AIPromptCharCounterProps) {
	// Thresholds must never exceed the model-specific `maxChars` — a Sora 2
	// textarea at 5000 max shouldn't show a "strong limit 8000" message that
	// never triggers while the API already rejects at 5000. Clamp both
	// thresholds and ensure soft ≤ strong.
	const strongWarnChars = Math.min(rawStrongWarnChars, maxChars);
	const softWarnChars = Math.min(rawSoftWarnChars, strongWarnChars);

	const remaining = maxChars - length;
	const overSoft = length > softWarnChars;
	const overStrong = length > strongWarnChars;

	// Only mention Kling by name when the soft threshold is actually the
	// Kling cap. For other models the "over soft limit" hint stays generic.
	const softHint =
		softWarnChars === UI_CONSTANTS.SOFT_PROMPT_WARN_CHARS
			? " — may be too long for some models (e.g. Kling caps at 2500)"
			: "";

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
					⚠ {length - softWarnChars} chars over soft limit ({softWarnChars})
					{softHint}
				</span>
			) : (
				<span>{remaining} characters remaining</span>
			)}
			{note && <span className="ml-2 text-primary">({note})</span>}
		</div>
	);
}
