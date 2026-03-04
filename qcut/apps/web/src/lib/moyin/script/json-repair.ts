/**
 * 3-level JSON repair for LLM outputs.
 *
 * Level 1: Direct JSON.parse
 * Level 2: Escape control characters (\n, \t, \r inside strings)
 * Level 3: Fix unescaped Chinese quotes ("" → replaced) +
 *          control char escaping
 *
 * Extracted from waoowaoo story-to-script/orchestrator.ts.
 */

// ─── Markdown Fence Stripping ───────────────────────────────────────

/** Remove surrounding markdown code fences from LLM output text. */
function stripMarkdownCodeFence(text: string): string {
	let cleaned = text.trim();
	cleaned = cleaned
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/, "")
		.replace(/\s*```$/g, "")
		.trim();
	return cleaned;
}

// ─── Level 2: Escape Control Chars ──────────────────────────────────

/** Escape control characters found inside JSON string literals. */
function escapeControlCharsInJsonStrings(input: string): string {
	let out = "";
	let inString = false;
	let escaped = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (!inString) {
			if (ch === '"') inString = true;
			out += ch;
			continue;
		}
		if (escaped) {
			out += ch;
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			out += ch;
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = false;
			out += ch;
			continue;
		}
		if (ch === "\n") {
			out += "\\n";
			continue;
		}
		if (ch === "\r") {
			out += "\\r";
			continue;
		}
		if (ch === "\t") {
			out += "\\t";
			continue;
		}
		const code = ch.charCodeAt(0);
		if (code < 0x20) {
			out += `\\u${code.toString(16).padStart(4, "0")}`;
			continue;
		}
		out += ch;
	}

	return out;
}

// ─── Level 3: Fix Unescaped Interior Quotes ─────────────────────────

/**
 * Fix unescaped double quotes inside JSON string values.
 *
 * LLMs sometimes convert Chinese curly quotes ("") to straight ASCII
 * double quotes inside a JSON string value without escaping them.
 * Strategy: walk char-by-char tracking JSON string boundaries. When we
 * encounter a `"` that would close the current string but the next char
 * is NOT a valid JSON structural char, replace it with a Chinese quote.
 */
function fixUnescapedQuotesInJson(input: string): string {
	const structuralAfterString = new Set([
		",",
		"}",
		"]",
		":",
		" ",
		"\t",
		"\n",
		"\r",
	]);
	let out = "";
	let inString = false;
	let escaped = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];

		if (!inString) {
			if (ch === '"') inString = true;
			out += ch;
			continue;
		}

		if (escaped) {
			out += ch;
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			out += ch;
			escaped = true;
			continue;
		}

		if (ch === '"') {
			const next = input[i + 1];
			if (next === undefined || structuralAfterString.has(next)) {
				inString = false;
				out += ch;
			} else {
				// Stray interior quote — replace with Chinese left double quote
				out += "\u201C";
			}
			continue;
		}

		// Control character escaping
		if (ch === "\n") {
			out += "\\n";
			continue;
		}
		if (ch === "\r") {
			out += "\\r";
			continue;
		}
		if (ch === "\t") {
			out += "\\t";
			continue;
		}
		const code = ch.charCodeAt(0);
		if (code < 0x20) {
			out += `\\u${code.toString(16).padStart(4, "0")}`;
			continue;
		}

		out += ch;
	}

	return out;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Parse a JSON object from LLM text with 3-level repair.
 * Strips markdown fences, extracts outermost `{…}`, then attempts
 * progressively aggressive repairs.
 */
export function repairAndParseJSON<T>(text: string): T {
	let cleaned = stripMarkdownCodeFence(text);

	const firstBrace = cleaned.indexOf("{");
	const lastBrace = cleaned.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		cleaned = cleaned.slice(firstBrace, lastBrace + 1);
	}

	// Level 1: direct parse
	try {
		return JSON.parse(cleaned) as T;
	} catch {
		/* continue */
	}

	// Level 2: escape control characters
	try {
		return JSON.parse(escapeControlCharsInJsonStrings(cleaned)) as T;
	} catch {
		/* continue */
	}

	// Level 3: fix unescaped interior double quotes + control chars
	return JSON.parse(fixUnescapedQuotesInJson(cleaned)) as T;
}

/**
 * Parse a JSON array from LLM text with 3-level repair.
 * Strips markdown fences, extracts outermost `[…]`, then attempts
 * progressively aggressive repairs. Falls back to extracting `.clips`
 * from a wrapping object.
 */
export function repairAndParseJSONArray<T>(text: string): T[] {
	const cleaned = stripMarkdownCodeFence(text);

	// Try parsing as array with progressive repair
	const firstBracket = cleaned.indexOf("[");
	const lastBracket = cleaned.lastIndexOf("]");
	if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
		const arrayStr = cleaned.slice(firstBracket, lastBracket + 1);
		const repairs = [
			(v: string) => v,
			escapeControlCharsInJsonStrings,
			fixUnescapedQuotesInJson,
		];
		for (const repair of repairs) {
			try {
				const parsed = JSON.parse(repair(arrayStr));
				if (Array.isArray(parsed)) {
					return parsed.filter(
						(item): item is T => !!item && typeof item === "object"
					);
				}
			} catch {
				/* try next repair */
			}
		}
	}

	// Fallback: try as object with .clips array
	const obj = repairAndParseJSON<Record<string, unknown>>(cleaned);
	const clips = obj.clips;
	if (Array.isArray(clips)) {
		return clips.filter(
			(item): item is T => !!item && typeof item === "object"
		);
	}

	throw new Error("Invalid JSON array format in LLM output");
}
