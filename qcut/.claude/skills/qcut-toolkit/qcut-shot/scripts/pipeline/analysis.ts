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
} from "../core/constants";
import type {
	AnalysisResult,
	CLIOptions,
	ContentFormat,
	Framing,
	Lighting,
	Medium,
	Movement,
	ShotMood,
} from "../core/types";
import { slugify } from "../core/utils";

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

function buildGenreRules({ content }: { content: string }): string[] {
	const lower = content.toLowerCase();
	const rules: string[] = [];
	const isRomance =
		lower.includes("love story") ||
		lower.includes("romance") ||
		lower.includes("romantic") ||
		lower.includes("attraction");
	const isFashion =
		lower.includes("fashion") ||
		lower.includes("supermodel") ||
		lower.includes("photographer") ||
		lower.includes("veil");

	if (isRomance) {
		rules.push("Keep the stakes emotional and intimate, not militarized, apocalyptic, or survival-driven.");
		rules.push("Favor longing glances, proximity, and tenderness over confrontation or threat spectacle.");
	}
	if (isFashion) {
		rules.push("Preserve a luxury fashion-world aesthetic with couture wardrobe, production lights, and polished city surfaces.");
		rules.push("Do not introduce tactical gear, weapons, dystopian ruins, or combat staging unless the source explicitly requests them.");
	}

	return rules;
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

/** Analyzes a source content file and returns structured metadata for shot planning. */
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
	const productionRules = buildProductionRules({ medium: medium.medium, format: format.format });
	const genreRules = buildGenreRules({ content });

	return {
		title,
		topicSlug: slugify({ value: title }).split("-").slice(0, 4).join("-") || "shot-plan",
		sourcePath,
		sourceExtension,
		sourceContent: content,
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
		genreRules,
		framing: style.framing,
		movement: style.movement,
		lighting: style.lighting,
		mood: style.mood,
		recommendedShots,
		targetShots,
	};
}
