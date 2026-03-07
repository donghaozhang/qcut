/**
 * 3-level JSON repair for LLM outputs (main process copy).
 *
 * Mirrors apps/web/src/lib/moyin/script/json-repair.ts.
 * Kept in electron/ because the electron tsconfig cannot import from apps/web/.
 */

function stripMarkdownCodeFence(text: string): string {
	let cleaned = text.trim();
	cleaned = cleaned
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/, "")
		.replace(/\s*```$/g, "")
		.trim();
	return cleaned;
}

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
				out += '\\"';
			}
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

export function repairAndParseJSON<T>(text: string): T {
	let cleaned = stripMarkdownCodeFence(text);

	const firstBrace = cleaned.indexOf("{");
	const lastBrace = cleaned.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		cleaned = cleaned.slice(firstBrace, lastBrace + 1);
	}

	try {
		return JSON.parse(cleaned) as T;
	} catch {
		/* continue */
	}

	try {
		return JSON.parse(escapeControlCharsInJsonStrings(cleaned)) as T;
	} catch {
		/* continue */
	}

	return JSON.parse(fixUnescapedQuotesInJson(cleaned)) as T;
}

export function repairAndParseJSONArray<T>(text: string): T[] {
	const cleaned = stripMarkdownCodeFence(text);

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

	const obj = repairAndParseJSON<Record<string, unknown>>(cleaned);
	const clips = obj.clips;
	if (Array.isArray(clips)) {
		return clips.filter(
			(item): item is T => !!item && typeof item === "object"
		);
	}

	throw new Error("Invalid JSON array format in LLM output");
}
