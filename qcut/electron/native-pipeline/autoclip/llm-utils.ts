/**
 * LLM response parsing utilities for AutoClip pipeline.
 *
 * Multi-layer JSON extraction from potentially malformed LLM outputs:
 * 1. Markdown code block extraction
 * 2. Direct JSON parse
 * 3. Regex-based JSON extraction
 * 4. Auto-fix common errors (missing commas, Chinese quotes, unmatched brackets)
 *
 * Ported from AutoClip's llm_client.py parse_json_response().
 *
 * @module electron/native-pipeline/autoclip/llm-utils
 */

/** Strip markdown code fences, BOM, and control characters. */
function sanitize(s: string): string {
	return s
		.replace(/^\uFEFF/, "")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
		.trim();
}

/** Fix common JSON formatting errors from LLMs. */
function fixCommonJsonErrors(json: string): string {
	let s = json;
	// Fix missing commas between objects/arrays
	s = s.replace(/}\s*\n\s*{/g, "},\n{");
	s = s.replace(/}\s*{/g, "},{");
	s = s.replace(/]\s*\[/g, "],[");
	// Fix trailing commas
	s = s.replace(/,\s*}/g, "}");
	s = s.replace(/,\s*]/g, "]");
	// Fix Chinese quotes
	s = s.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
	// Fix unmatched brackets
	const openBraces = (s.match(/{/g) || []).length;
	const closeBraces = (s.match(/}/g) || []).length;
	const openBrackets = (s.match(/\[/g) || []).length;
	const closeBrackets = (s.match(/]/g) || []).length;
	if (openBraces > closeBraces) s += "}".repeat(openBraces - closeBraces);
	if (openBrackets > closeBrackets)
		s += "]".repeat(openBrackets - closeBrackets);
	return s;
}

/**
 * Extract and parse JSON from an LLM response string.
 *
 * Handles markdown code blocks, raw JSON, and malformed responses
 * through multiple fallback strategies.
 */
export function parseJsonResponse(response: string): unknown {
	const cleaned = sanitize(response);

	// 1. Try extracting from markdown code blocks
	const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (mdMatch) {
		const inner = sanitize(mdMatch[1]);
		try {
			return JSON.parse(inner);
		} catch {
			try {
				return JSON.parse(fixCommonJsonErrors(inner));
			} catch {
				// Fall through
			}
		}
	}

	// 2. Strip any leading non-JSON text (find first [ or {)
	let jsonStart = cleaned.length;
	const bracketIdx = cleaned.indexOf("[");
	const braceIdx = cleaned.indexOf("{");
	if (bracketIdx !== -1) jsonStart = Math.min(jsonStart, bracketIdx);
	if (braceIdx !== -1) jsonStart = Math.min(jsonStart, braceIdx);
	const stripped = jsonStart < cleaned.length ? cleaned.substring(jsonStart) : cleaned;

	// 3. Try direct parse
	try {
		return JSON.parse(stripped);
	} catch {
		// Fall through
	}

	// 4. Regex extraction: find largest JSON structure
	const jsonMatch = stripped.match(/(\[[\s\S]*]|\{[\s\S]*})/);
	if (jsonMatch) {
		const candidate = sanitize(jsonMatch[1]);
		try {
			return JSON.parse(candidate);
		} catch {
			try {
				return JSON.parse(fixCommonJsonErrors(candidate));
			} catch {
				// Fall through
			}
		}
	}

	// 5. Last resort: fix and parse the whole stripped text
	try {
		return JSON.parse(fixCommonJsonErrors(stripped));
	} catch {
		throw new Error(
			`Failed to parse JSON from LLM response: ${cleaned.substring(0, 200)}...`
		);
	}
}

/**
 * Extract the text content from an OpenRouter chat completion response.
 */
export function extractChatContent(data: unknown): string {
	if (!data || typeof data !== "object") {
		throw new Error("Invalid API response: not an object");
	}
	const obj = data as Record<string, unknown>;
	if (Array.isArray(obj.choices) && obj.choices.length > 0) {
		const choice = obj.choices[0] as Record<string, unknown>;
		if (choice.message && typeof choice.message === "object") {
			const msg = choice.message as Record<string, unknown>;
			if (typeof msg.content === "string") return msg.content;
		}
	}
	throw new Error(
		`Unexpected API response shape: ${JSON.stringify(data).substring(0, 200)}`
	);
}
