import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
	DEFAULT_STYLE,
	FORMAT_SIGNAL_MAP,
	MAX_SHOTS,
	MEDIUM_SIGNAL_MAP,
	MIN_SHOTS,
	PRESETS,
	STYLE_SIGNAL_MAP,
} from "./constants";
import type {
	AnalysisResult,
	Beat,
	CLIOptions,
	ContentFormat,
	Framing,
	Lighting,
	Medium,
	Movement,
	ShotMood,
	VisualAnchors,
} from "./types";
import { slugify } from "./utils";

function stripFrontmatter({ content }: { content: string }): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/u, "");
}

function detectLanguage({ content, explicit }: { content: string; explicit?: string }): string {
	if (explicit?.trim()) {
		return explicit.trim();
	}
	const cjkMatches = content.match(/[\u3040-\u30ff\u3400-\u9fff]/gu)?.length ?? 0;
	const latinMatches = content.match(/[A-Za-z]/g)?.length ?? 0;
	return cjkMatches > latinMatches / 5 ? "zh" : "en";
}

function extractTitle({ content, sourcePath }: { content: string; sourcePath: string }): string {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	if (heading) return heading;
	const first = stripFrontmatter({ content })
		.split(/\n+/)
		.map((line) => line.trim())
		.find(Boolean);
	return first?.slice(0, 80) || basename(sourcePath, extname(sourcePath));
}

function recommendShots({ wordCount }: { wordCount: number }): number {
	if (wordCount < 1000) return 6;
	if (wordCount < 3000) return 10;
	if (wordCount < 5000) return 14;
	return 18;
}

function resolveShotCount({ explicit, recommended }: { explicit?: number; recommended: number }): number {
	if (!explicit) return recommended;
	return Math.max(MIN_SHOTS, Math.min(MAX_SHOTS, explicit));
}

function collectKeywords({ text }: { text: string }): string[] {
	const words = text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.split(/\s+/)
		.filter((word) => word.length >= 5);
	const counts = new Map<string, number>();
	for (const word of words) {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((left, right) => right[1] - left[1])
		.slice(0, 5)
		.map(([word]) => word);
}

function collectFrequentTerms({ text }: { text: string }): string[] {
	const words = text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.split(/\s+/)
		.filter((word) => word.length >= 4);
	const stopWords = new Set([
		"that",
		"this",
		"with",
		"from",
		"into",
		"their",
		"there",
		"about",
		"while",
		"should",
		"could",
		"would",
		"other",
		"first",
		"final",
		"through",
		"where",
		"being",
		"every",
		"scene",
		"camera",
		"frame",
		"image",
		"story",
		"visual",
		"shots",
		"render",
	]);
	const counts = new Map<string, number>();
	for (const word of words) {
		if (stopWords.has(word)) continue;
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((left, right) => right[1] - left[1])
		.slice(0, 12)
		.map(([word]) => word);
}

function extractBeats({ content }: { content: string }): Beat[] {
	const normalized = stripFrontmatter({ content });
	const headingMatches = [...normalized.matchAll(/^#{2,3}\s+(.+)$/gm)];
	if (headingMatches.length > 0) {
		return headingMatches.map((heading, index) => {
			const start = heading.index ?? 0;
			const end = headingMatches[index + 1]?.index ?? normalized.length;
			const body = normalized
				.slice(start, end)
				.split("\n")
				.slice(1)
				.join("\n")
				.replace(/\s+/g, " ")
				.trim();
			return {
				title: heading[1].trim(),
				body,
				keywords: collectKeywords({ text: `${heading[1]} ${body}` }),
			};
		});
	}

	return normalized
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.slice(0, 12)
		.map((paragraph, index) => ({
			title: `Beat ${index + 1}`,
			body: paragraph,
			keywords: collectKeywords({ text: paragraph }),
		}));
}

function detectPreset({
	content,
	explicit,
	medium,
	format,
}: {
	content: string;
	explicit?: string;
	medium: Medium;
	format: ContentFormat;
}): { preset: string; reason: string } {
	if (explicit?.trim() && explicit.trim() !== "custom") {
		return { preset: explicit.trim(), reason: "explicit --style flag" };
	}
	if (format === "documentary") {
		return { preset: "documentary", reason: "documentary format default" };
	}
	if (medium === "animation" && PRESETS["anime-storyboard"]) {
		return { preset: "anime-storyboard", reason: "animation medium default" };
	}
	const lower = content.toLowerCase();
	for (const entry of STYLE_SIGNAL_MAP) {
		if (entry.keywords.some((keyword) => lower.includes(keyword))) {
			return { preset: entry.preset, reason: `matched content signal: ${entry.keywords.join(", ")}` };
		}
	}
	return { preset: DEFAULT_STYLE, reason: "default fallback" };
}

function detectMedium({
	content,
	explicit,
}: {
	content: string;
	explicit?: Medium;
}): { medium: Medium; reason: string } {
	if (explicit) {
		return { medium: explicit, reason: "explicit --medium flag" };
	}
	const lower = content.toLowerCase();
	for (const entry of MEDIUM_SIGNAL_MAP) {
		if (entry.keywords.some((keyword) => lower.includes(keyword))) {
			return { medium: entry.medium, reason: `matched content signal: ${entry.keywords.join(", ")}` };
		}
	}
	return { medium: "live-action", reason: "default medium fallback" };
}

function detectFormat({
	content,
	explicit,
}: {
	content: string;
	explicit?: ContentFormat;
}): { format: ContentFormat; reason: string } {
	if (explicit) {
		return { format: explicit, reason: "explicit --format flag" };
	}
	const lower = content.toLowerCase();
	for (const entry of FORMAT_SIGNAL_MAP) {
		if (entry.keywords.some((keyword) => lower.includes(keyword))) {
			return { format: entry.format, reason: `matched content signal: ${entry.keywords.join(", ")}` };
		}
	}
	return { format: "film", reason: "default format fallback" };
}

function buildProductionRules({
	medium,
	format,
}: {
	medium: Medium;
	format: ContentFormat;
}): string[] {
	const mediumRules: Record<Medium, string[]> = {
		"live-action": [
			"Use physically plausible lighting, lens behavior, and wardrobe materials.",
			"Characters should read like photographed performers, not illustrated or synthetic avatars.",
		],
		animation: [
			"Lean into stylized shape language, controlled exaggeration, and designed motion readability.",
			"Do not force photoreal skin or live-action lens realism unless the beat explicitly requires it.",
		],
		hybrid: [
			"Blend photographed realism with deliberate animated augmentation in a coherent single frame.",
			"Keep the compositing logic intentional so live-action and animated elements feel designed together.",
		],
		cgi: [
			"Render as fully synthetic cinema with deliberate 3D worldbuilding and controlled surface detail.",
			"Do not imply photographed actors or practical set capture.",
		],
	};
	const formatRules: Record<ContentFormat, string[]> = {
		film: [
			"Favor cinematic scale, visual intent, and stronger standalone composition per shot.",
		],
		"tv-series": [
			"Keep coverage practical and repeatable for episodic storytelling rather than only poster-like frames.",
		],
		documentary: [
			"Prioritize observational credibility and restrained composition over glossy spectacle.",
		],
		variety: [
			"Keep the frame presentational, performance-aware, and suitable for multi-segment entertainment pacing.",
		],
		"short-film": [
			"Compress story information efficiently; every frame should carry narrative weight quickly.",
		],
		"short-video": [
			"Make the frame immediately readable with fast hook value and minimal visual ambiguity.",
		],
	};

	return [...mediumRules[medium], ...formatRules[format]];
}

function resolveStyle({
	content,
	options,
	medium,
	format,
}: {
	content: string;
	options: CLIOptions;
	medium: Medium;
	format: ContentFormat;
}): {
	style: string;
	stylePreset?: string;
	styleReason: string;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
} {
	const detected = detectPreset({ content, explicit: options.style, medium, format });
	const basePreset = PRESETS[detected.preset] ? detected.preset : DEFAULT_STYLE;
	const base = PRESETS[basePreset];
	const hasCustom = Boolean(
		options.style === "custom" || options.framing || options.movement || options.lighting || options.mood,
	);

	const resolved = {
		framing: options.framing || base.framing,
		movement: options.movement || base.movement,
		lighting: options.lighting || base.lighting,
		mood: options.mood || base.mood,
	};

	if (hasCustom) {
		return {
			style: `custom:${resolved.framing}+${resolved.movement}+${resolved.lighting}+${resolved.mood}`,
			styleReason:
				options.style === "custom"
					? "explicit --style custom with dimension composition"
					: `custom dimension override on preset ${basePreset}`,
			...resolved,
		};
	}

	return {
		style: basePreset,
		stylePreset: basePreset,
		styleReason: detected.reason,
		...resolved,
	};
}

function firstMatchingTerm({
	terms,
	candidates,
}: {
	terms: string[];
	candidates: string[];
}): string | null {
	for (const term of terms) {
		for (const candidate of candidates) {
			if (term.includes(candidate) || candidate.includes(term)) {
				return term;
			}
		}
	}
	return null;
}

function preferredToken({
	content,
	fallbackTerms,
	candidates,
}: {
	content: string;
	fallbackTerms: string[];
	candidates: string[];
}): string | null {
	for (const candidate of candidates) {
		if (content.includes(candidate)) {
			return candidate;
		}
	}
	return firstMatchingTerm({ terms: fallbackTerms, candidates });
}

function buildVisualAnchors({
	content,
	title,
	style,
	beats,
}: {
	content: string;
	title: string;
	style: {
		framing: Framing;
		movement: Movement;
		lighting: Lighting;
		mood: ShotMood;
	};
	beats: Beat[];
}): VisualAnchors {
	const terms = collectFrequentTerms({ text: `${title} ${content}` });
	const lower = content.toLowerCase();
	const subjectTerm =
		preferredToken({
			content: lower,
			fallbackTerms: terms,
			candidates: ["archer", "contender", "hero", "runner", "survivor", "fighter", "teen", "girl", "boy", "protagonist"],
		}) ?? "contender";
	const locationTerm =
		preferredToken({
			content: lower,
			fallbackTerms: terms,
			candidates: ["arena", "valley", "platform", "forest", "city", "warehouse", "corridor", "stage", "lab"],
		}) ?? "arena";
	const propTerm =
		preferredToken({
			content: lower,
			fallbackTerms: terms,
			candidates: ["bow", "blade", "sword", "rifle", "mask", "device", "crate", "screen", "drones"],
		}) ?? "signature gear";
	const paletteSeed =
		firstMatchingTerm({
			terms,
			candidates: ["orange", "blue", "amber", "fog", "neon", "ash", "green", "steel", "gold"],
		}) ?? (style.lighting === "dramatic" ? "steel-blue shadows with ember highlights" : "controlled neutral palette");
	const openingBeat = beats[0]?.body || title;
	const subjectAnchor = [
		`Same central ${subjectTerm} across the full sequence.`,
		"Keep one readable silhouette, age band, and wardrobe language from shot to shot.",
		lower.includes("bow")
			? "The subject is a lean survival archer in worn tactical layers, dirt and sweat visible."
			: `The subject reads as a resilient ${subjectTerm} under pressure, never a generic crowd extra.`,
	].join(" ");
	const locationAnchor = [
		`Treat the location as one continuous ${locationTerm}-world.`,
		openingBeat,
		"Repeat key materials, elevation logic, and background structures so shots feel adjacent in the same geography.",
	].join(" ");
	const propAnchor = [
		`Keep the ${propTerm} visually consistent whenever it appears.`,
		propTerm === "bow"
			? "Use the same bow design, grip wrap, and survival-worn finish in every shot."
			: propTerm === "screen"
				? "Use the same giant arena screen design, support structure, and glow treatment across the sequence."
				: "Do not swap the hero prop design between shots.",
	].join(" ");
	const continuityRules = [
		"Do not change protagonist identity, costume family, or body type between shots.",
		"Do not relocate the scene into a different world or architecture style.",
		"Keep recurring props, insignia, and screen technology consistent.",
		`Maintain a ${paletteSeed} palette bias unless a beat explicitly requires contrast.`,
	];

	return {
		subjectId: `${slugify({ value: subjectTerm }).slice(0, 24) || "subject"}-01`,
		subjectAnchor,
		locationId: `${slugify({ value: locationTerm }).slice(0, 24) || "location"}-01`,
		locationAnchor,
		propId: `${slugify({ value: propTerm }).slice(0, 24) || "prop"}-01`,
		propAnchor,
		paletteAnchor: paletteSeed,
		continuityRules,
	};
}

export function analyzeSource({ options }: { options: CLIOptions }): AnalysisResult {
	const sourcePath = resolve(options.input);
	if (!existsSync(sourcePath)) {
		throw new Error(`Input not found: ${sourcePath}`);
	}

	const stats = statSync(sourcePath);
	if (stats.isDirectory()) {
		throw new Error("Expected a file for shot planning. Use --images-only or --regenerate with an existing shot directory.");
	}

	const sourceExtension = extname(sourcePath) || ".md";
	const rawContent = readFileSync(sourcePath, "utf8");
	const content = stripFrontmatter({ content: rawContent });
	const title = extractTitle({ content, sourcePath });
	const medium = detectMedium({ content, explicit: options.medium });
	const format = detectFormat({ content, explicit: options.format });
	const style = resolveStyle({ content, options, medium: medium.medium, format: format.format });
	const wordCount = content.split(/\s+/).filter(Boolean).length;
	const recommendedShots = recommendShots({ wordCount });
	const targetShots = resolveShotCount({ explicit: options.shots, recommended: recommendedShots });
	const beats = extractBeats({ content });
	const visualAnchors = buildVisualAnchors({ content, title, style, beats });
	const productionRules = buildProductionRules({ medium: medium.medium, format: format.format });

	return {
		title,
		topicSlug: slugify({ value: title }).split("-").slice(0, 4).join("-") || "shot-plan",
		sourcePath,
		sourceExtension,
		wordCount,
		language: detectLanguage({ content, explicit: options.lang }),
		style: style.style,
		stylePreset: style.stylePreset,
		styleReason: style.styleReason,
		medium: medium.medium,
		mediumReason: medium.reason,
		format: format.format,
		formatReason: format.reason,
		productionRules,
		framing: style.framing,
		movement: style.movement,
		lighting: style.lighting,
		mood: style.mood,
		recommendedShots,
		targetShots,
		coreThroughline: beats[0]?.title || title,
		beats,
		visualAnchors,
	};
}
