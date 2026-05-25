import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { generateFalImage, getDefaultFalModel, hasFalCredentials } from "./providers/fal";

export type Audience =
	| "beginners"
	| "intermediate"
	| "experts"
	| "executives"
	| "general";
export type Texture = "clean" | "grid" | "organic" | "pixel" | "paper";
export type Mood =
	| "professional"
	| "warm"
	| "cool"
	| "vibrant"
	| "dark"
	| "neutral";
export type Typography =
	| "geometric"
	| "humanist"
	| "handwritten"
	| "editorial"
	| "technical";
export type Density = "minimal" | "balanced" | "dense";

export interface CLIOptions {
	input: string;
	style?: string;
	audience: Audience;
	texture?: Texture;
	mood?: Mood;
	typography?: Typography;
	density?: Density;
	lang?: string;
	slides?: number;
	outlineOnly: boolean;
	promptsOnly: boolean;
	imagesOnly: boolean;
	regenerate?: Array<number>;
	outputDir?: string;
	projectId?: string;
	provider?: string;
	model?: string;
	dryRun: boolean;
}

export interface AnalysisResult {
	title: string;
	topicSlug: string;
	sourcePath: string;
	sourceExtension: string;
	wordCount: number;
	language: string;
	audience: Audience;
	style: string;
	stylePreset?: string;
	styleReason: string;
	texture: Texture;
	mood: Mood;
	typography: Typography;
	density: Density;
	recommendedSlides: number;
	targetSlides: number;
	coreMessage: string;
	supportingPoints: Array<string>;
	sections: Array<Section>;
}

export interface Section {
	title: string;
	body: string;
	keywords: Array<string>;
}

export interface SlidePlan {
	index: number;
	title: string;
	fileStem: string;
	type: "cover" | "content" | "closing";
	layout: string;
	narrativeGoal: string;
	bodyPoints: Array<string>;
	visualDescription: string;
}

export interface DeckPlan {
	deckDir: string;
	promptsDir: string;
	analysis: AnalysisResult;
	slides: Array<SlidePlan>;
	styleInstructions: string;
}

const DEFAULT_AUDIENCE: Audience = "general";
const DEFAULT_STYLE = "blueprint";
const DEFAULT_SLIDES = 10;
const MIN_SLIDES = 5;
const MAX_SLIDES = 30;
const VALID_TEXTURES = ["clean", "grid", "organic", "pixel", "paper"] as const;
const VALID_MOODS = ["professional", "warm", "cool", "vibrant", "dark", "neutral"] as const;
const VALID_TYPOGRAPHIES = [
	"geometric",
	"humanist",
	"handwritten",
	"editorial",
	"technical",
] as const;
const VALID_DENSITIES = ["minimal", "balanced", "dense"] as const;
const PRESET_DIMENSIONS: Record<
	string,
	{
		texture: Texture;
		mood: Mood;
		typography: Typography;
		density: Density;
	}
> = {
	blueprint: { texture: "grid", mood: "cool", typography: "technical", density: "balanced" },
	chalkboard: { texture: "organic", mood: "warm", typography: "handwritten", density: "balanced" },
	corporate: { texture: "clean", mood: "professional", typography: "geometric", density: "balanced" },
	minimal: { texture: "clean", mood: "neutral", typography: "geometric", density: "minimal" },
	"sketch-notes": { texture: "organic", mood: "warm", typography: "handwritten", density: "balanced" },
	watercolor: { texture: "organic", mood: "warm", typography: "humanist", density: "minimal" },
	"dark-atmospheric": { texture: "clean", mood: "dark", typography: "editorial", density: "balanced" },
	notion: { texture: "clean", mood: "neutral", typography: "geometric", density: "dense" },
	"bold-editorial": { texture: "clean", mood: "vibrant", typography: "editorial", density: "balanced" },
	"editorial-infographic": { texture: "clean", mood: "cool", typography: "editorial", density: "dense" },
	"fantasy-animation": { texture: "organic", mood: "vibrant", typography: "handwritten", density: "minimal" },
	"intuition-machine": { texture: "clean", mood: "cool", typography: "technical", density: "dense" },
	"pixel-art": { texture: "pixel", mood: "vibrant", typography: "technical", density: "balanced" },
	scientific: { texture: "clean", mood: "cool", typography: "technical", density: "dense" },
	"vector-illustration": { texture: "clean", mood: "vibrant", typography: "humanist", density: "balanced" },
	vintage: { texture: "paper", mood: "warm", typography: "editorial", density: "balanced" },
};

const STYLE_SIGNAL_MAP: Array<{ preset: string; keywords: Array<string> }> = [
	{ preset: "sketch-notes", keywords: ["tutorial", "learn", "education", "guide", "beginner"] },
	{ preset: "chalkboard", keywords: ["classroom", "teaching", "school", "chalkboard"] },
	{ preset: "blueprint", keywords: ["architecture", "system", "data", "analysis", "technical"] },
	{ preset: "vector-illustration", keywords: ["creative", "children", "kids", "cute"] },
	{ preset: "intuition-machine", keywords: ["briefing", "academic", "research", "bilingual"] },
	{ preset: "minimal", keywords: ["executive", "minimal", "clean", "simple"] },
	{ preset: "notion", keywords: ["saas", "product", "dashboard", "metrics"] },
	{ preset: "corporate", keywords: ["investor", "quarterly", "business", "corporate"] },
	{ preset: "bold-editorial", keywords: ["launch", "marketing", "keynote", "magazine"] },
	{ preset: "dark-atmospheric", keywords: ["entertainment", "music", "gaming", "atmospheric"] },
	{ preset: "editorial-infographic", keywords: ["explainer", "journalism", "science communication"] },
	{ preset: "fantasy-animation", keywords: ["story", "fantasy", "animation", "magical"] },
	{ preset: "pixel-art", keywords: ["gaming", "retro", "pixel", "developer"] },
	{ preset: "scientific", keywords: ["biology", "chemistry", "medical", "scientific"] },
	{ preset: "vintage", keywords: ["history", "heritage", "vintage", "expedition"] },
	{ preset: "watercolor", keywords: ["lifestyle", "wellness", "travel", "artistic"] },
];

export function parseArgs({ argv }: { argv: Array<string> }): CLIOptions {
	const args = argv.slice(2);
	let input = "";
	let style: string | undefined;
	let audience = DEFAULT_AUDIENCE;
	let texture: Texture | undefined;
	let mood: Mood | undefined;
	let typography: Typography | undefined;
	let density: Density | undefined;
	let lang: string | undefined;
	let slides: number | undefined;
	let outlineOnly = false;
	let promptsOnly = false;
	let imagesOnly = false;
	let regenerate: Array<number> | undefined;
	let outputDir: string | undefined;
	let projectId: string | undefined;
	let provider: string | undefined;
	let model: string | undefined;
	let dryRun = false;

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) {
			continue;
		}

		if (value === "--help" || value === "-h") {
			input = "";
			break;
		}

		if (!value.startsWith("-")) {
			input = value;
			continue;
		}

		if (value === "--style") {
			style = requireValue({ args, index, flag: "--style" });
			index += 1;
			continue;
		}

		if (value === "--audience") {
			audience = parseEnum({
				value: args[index + 1],
				valid: ["beginners", "intermediate", "experts", "executives", "general"] as const,
				flag: "--audience",
			}) as Audience;
			index += 1;
			continue;
		}

		if (value === "--texture") {
			texture = parseEnum({
				value: args[index + 1],
				valid: VALID_TEXTURES,
				flag: "--texture",
			}) as Texture;
			index += 1;
			continue;
		}

		if (value === "--mood") {
			mood = parseEnum({
				value: args[index + 1],
				valid: VALID_MOODS,
				flag: "--mood",
			}) as Mood;
			index += 1;
			continue;
		}

		if (value === "--typography") {
			typography = parseEnum({
				value: args[index + 1],
				valid: VALID_TYPOGRAPHIES,
				flag: "--typography",
			}) as Typography;
			index += 1;
			continue;
		}

		if (value === "--density") {
			density = parseEnum({
				value: args[index + 1],
				valid: VALID_DENSITIES,
				flag: "--density",
			}) as Density;
			index += 1;
			continue;
		}

		if (value === "--lang") {
			lang = requireValue({ args, index, flag: "--lang" });
			index += 1;
			continue;
		}

		if (value === "--slides") {
			const nextValue = Number(args[index + 1]);
			if (Number.isFinite(nextValue)) {
				slides = nextValue;
			}
			index += 1;
			continue;
		}

		if (value === "--regenerate") {
			regenerate = parseSlideList({ value: args[index + 1] });
			index += 1;
			continue;
		}

		if (value === "--output-dir") {
			outputDir = requireValue({ args, index, flag: "--output-dir" });
			index += 1;
			continue;
		}
		if (value === "--project-id") {
			projectId = requireValue({ args, index, flag: "--project-id" });
			index += 1;
			continue;
		}

		if (value === "--provider") {
			provider = requireValue({ args, index, flag: "--provider" });
			index += 1;
			continue;
		}

		if (value === "--model") {
			model = requireValue({ args, index, flag: "--model" });
			index += 1;
			continue;
		}

		if (value === "--outline-only") {
			outlineOnly = true;
			continue;
		}

		if (value === "--prompts-only") {
			promptsOnly = true;
			continue;
		}

		if (value === "--images-only") {
			imagesOnly = true;
			continue;
		}

		if (value === "--dry-run") {
			dryRun = true;
		}
	}

	if (!input) {
		throw new Error(
			"Usage: bun main.ts <content-file|deck-dir> [options]\n\n" +
				"Options:\n" +
				"  --style <name>       Preset style or 'custom'\n" +
				"  --audience <type>    beginners | intermediate | experts | executives | general\n" +
				"  --texture <name>     clean | grid | organic | pixel | paper\n" +
				"  --mood <name>        professional | warm | cool | vibrant | dark | neutral\n" +
				"  --typography <name>  geometric | humanist | handwritten | editorial | technical\n" +
				"  --density <name>     minimal | balanced | dense\n" +
				"  --lang <code>        Output language\n" +
				"  --slides <number>    Target slide count (5-30)\n" +
				"  --outline-only       Stop after outline\n" +
				"  --prompts-only       Stop after prompts\n" +
				"  --images-only        Render from existing deck\n" +
				"  --regenerate <list>  Re-render selected slides (e.g. 2,5)\n" +
				"  --provider <name>    Image provider (fal)\n" +
				"  --model <id>         Override image model\n" +
				"  --output-dir <path>  Output directory\n" +
				"  --project-id <id>    Save into QCut project folder\n" +
				"  --dry-run            Skip rendering",
		);
	}

	return {
		input,
		style,
		audience,
		texture,
		mood,
		typography,
		density,
		lang,
		slides,
		outlineOnly,
		promptsOnly,
		imagesOnly,
		regenerate,
		outputDir,
		projectId,
		provider,
		model,
		dryRun,
	};
}

function parseEnum({
	value,
	valid,
	flag,
}: {
	value?: string;
	valid: readonly string[];
	flag: string;
}): string {
	if (!value?.trim()) {
		throw new Error(`Missing value for ${flag}`);
	}
	if (!valid.includes(value as (typeof valid)[number])) {
		throw new Error(`Invalid value for ${flag}: ${value}`);
	}
	return value;
}

function requireValue({ args, index, flag }: { args: Array<string>; index: number; flag: string }): string {
	const next = args[index + 1];
	if (!next || next.startsWith("-")) {
		throw new Error(`Missing value for ${flag}`);
	}
	return next;
}

export function parseSlideList({ value }: { value?: string }): Array<number> {
	if (!value?.trim()) {
		throw new Error("Missing value for --regenerate (e.g. --regenerate 2,5)");
	}

	const unique = new Set<number>();
	for (const part of value.split(",")) {
		const parsed = Number(part.trim());
		if (Number.isInteger(parsed) && parsed > 0) {
			unique.add(parsed);
		}
	}
	if (unique.size === 0) {
		throw new Error(`Invalid slide list for --regenerate: ${value}`);
	}
	return [...unique].sort((left, right) => left - right);
}

export function ensureDir({ path }: { path: string }): void {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
}

export function slugify({ value }: { value: string }): string {
	const normalized = value
		.toLowerCase()
		.replace(/[`”’””’’]/g, “”)
		.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\u4e00-\u9fff]+/gu, “-”)
		.replace(/^-+|-+$/g, “”);
	return normalized || “slide-deck”;
}

export function timestamp(): string {
	const now = new Date();
	const date = now.toISOString().slice(0, 10).replace(/-/g, "");
	const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
	return `${date}-${time}`;
}

function extractTitle({ content, sourcePath }: { content: string; sourcePath: string }): string {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	if (heading) {
		return heading;
	}

	const firstSentence = content
		.replace(/^---[\s\S]*?---\s*/u, "")
		.split(/\n+/)
		.map((line) => line.trim())
		.find(Boolean);
	if (firstSentence) {
		return firstSentence.slice(0, 80);
	}

	return basename(sourcePath, extname(sourcePath));
}

function stripFrontmatter({ content }: { content: string }): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/u, "");
}

function detectLanguage({ content, explicit }: { content: string; explicit?: string }): string {
	if (explicit?.trim()) {
		return explicit.trim();
	}

	const cjkMatches = content.match(/[\u3040-\u30ff\u3400-\u9fff]/gu)?.length ?? 0;
	const latinMatches = content.match(/[A-Za-z]/g)?.length ?? 0;
	if (cjkMatches > latinMatches / 5) {
		return "zh";
	}
	return "en";
}

function recommendSlides({ wordCount }: { wordCount: number }): number {
	if (wordCount < 1000) {
		return 8;
	}
	if (wordCount < 3000) {
		return 12;
	}
	if (wordCount < 5000) {
		return 18;
	}
	return 24;
}

function resolveSlideCount({ explicit, recommended }: { explicit?: number; recommended: number }): number {
	if (!explicit) {
		return recommended;
	}
	return Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, explicit));
}

function detectStyle({
	content,
	explicit,
}: {
	content: string;
	explicit?: string;
}): { preset: string; reason: string } {
	if (explicit?.trim() && explicit.trim() !== "custom") {
		return { preset: explicit.trim(), reason: "explicit --style flag" };
	}

	const lower = content.toLowerCase();
	for (const entry of STYLE_SIGNAL_MAP) {
		if (entry.keywords.some((keyword) => lower.includes(keyword))) {
			return { preset: entry.preset, reason: `matched content signal: ${entry.keywords.join(", ")}` };
		}
	}

	return { preset: DEFAULT_STYLE, reason: "default fallback" };
}

function resolveStyleConfig({
	content,
	options,
}: {
	content: string;
	options: CLIOptions;
}): {
	style: string;
	stylePreset?: string;
	styleReason: string;
	texture: Texture;
	mood: Mood;
	typography: Typography;
	density: Density;
} {
	const detected = detectStyle({ content, explicit: options.style });
	const basePreset = PRESET_DIMENSIONS[detected.preset] ? detected.preset : DEFAULT_STYLE;
	const base = PRESET_DIMENSIONS[basePreset];
	const hasCustomDimensions = Boolean(
		options.style === "custom" ||
			options.texture ||
			options.mood ||
			options.typography ||
			options.density,
	);

	const resolved = {
		texture: options.texture || base.texture,
		mood: options.mood || base.mood,
		typography: options.typography || base.typography,
		density: options.density || base.density,
	};

	if (hasCustomDimensions) {
		return {
			style: `custom:${resolved.texture}+${resolved.mood}+${resolved.typography}+${resolved.density}`,
			stylePreset: undefined,
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

function extractSupportingPoints({ content }: { content: string }): Array<string> {
	const headings = [...content.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1].trim());
	if (headings.length > 0) {
		return headings.slice(0, 5);
	}

	const paragraphs = content
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	return paragraphs.slice(0, 5).map((paragraph) => paragraph.slice(0, 90));
}

function extractSections({ content }: { content: string }): Array<Section> {
	const normalized = stripFrontmatter({ content });
	const headingMatches = [...normalized.matchAll(/^#{2,3}\s+(.+)$/gm)];
	if (headingMatches.length > 0) {
		const sections: Array<Section> = [];
		for (let index = 0; index < headingMatches.length; index += 1) {
			const heading = headingMatches[index];
			const start = heading.index ?? 0;
			const end = headingMatches[index + 1]?.index ?? normalized.length;
			const body = normalized
				.slice(start, end)
				.split("\n")
				.slice(1)
				.join("\n")
				.replace(/\s+/g, " ")
				.trim();
			sections.push({
				title: heading[1].trim(),
				body,
				keywords: collectKeywords({ text: `${heading[1]} ${body}` }),
			});
		}
		return sections;
	}

	const paragraphs = normalized
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
		.filter(Boolean);

	return paragraphs.slice(0, 12).map((paragraph, index) => ({
		title: `Point ${index + 1}`,
		body: paragraph,
		keywords: collectKeywords({ text: paragraph }),
	}));
}

function collectKeywords({ text }: { text: string }): Array<string> {
	const words = text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, " ")
		.split(/\s+/)
		.filter((word) => word.length >= 2);
	const counts = new Map<string, number>();
	for (const word of words) {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((left, right) => right[1] - left[1])
		.slice(0, 5)
		.map(([word]) => word);
}

function deriveCoreMessage({
	title,
	supportingPoints,
}: {
	title: string;
	supportingPoints: Array<string>;
}): string {
	if (supportingPoints.length === 0) {
		return title;
	}
	return `${title}: ${supportingPoints[0]}`;
}

export function analyzeSource({ options }: { options: CLIOptions }): AnalysisResult {
	const sourcePath = resolve(options.input);
	if (!existsSync(sourcePath)) {
		throw new Error(`Input not found: ${sourcePath}`);
	}

	const stats = statSync(sourcePath);
	if (stats.isDirectory()) {
		throw new Error("Expected a file for content analysis. Use --images-only or --regenerate with an existing deck directory.");
	}

	const sourceExtension = extname(sourcePath) || ".md";
	const rawContent = readFileSync(sourcePath, "utf8");
	const content = stripFrontmatter({ content: rawContent });
	const title = extractTitle({ content, sourcePath });
	const styleConfig = resolveStyleConfig({ content, options });
	const wordCount = content.split(/\s+/).filter(Boolean).length;
	const recommended = recommendSlides({ wordCount });
	const targetSlides = resolveSlideCount({ explicit: options.slides, recommended });
	const sections = extractSections({ content });
	const supportingPoints = extractSupportingPoints({ content });

	return {
		title,
		topicSlug: slugify({ value: title }).split("-").slice(0, 4).join("-") || "slide-deck",
		sourcePath,
		sourceExtension,
		wordCount,
		language: detectLanguage({ content, explicit: options.lang }),
		audience: options.audience,
		style: styleConfig.style,
		stylePreset: styleConfig.stylePreset,
		styleReason: styleConfig.styleReason,
		texture: styleConfig.texture,
		mood: styleConfig.mood,
		typography: styleConfig.typography,
		density: styleConfig.density,
		recommendedSlides: recommended,
		targetSlides,
		coreMessage: deriveCoreMessage({ title, supportingPoints }),
		supportingPoints,
		sections,
	};
}

function styleReferencePath({ preset }: { preset: string }): string {
	return resolve(
		import.meta.dir,
		"..",
		"references",
		"styles",
		`${preset}.md`,
	);
}

function dimensionReferencePath({
	name,
}: {
	name: "texture" | "mood" | "typography" | "density";
}): string {
	return resolve(import.meta.dir, "..", "references", "dimensions", `${name}.md`);
}

function extractDimensionSection({
	name,
	option,
}: {
	name: "texture" | "mood" | "typography" | "density";
	option: string;
}): string {
	const referencePath = dimensionReferencePath({ name });
	if (!existsSync(referencePath)) {
		return `${name}: ${option}`;
	}

	const content = readFileSync(referencePath, "utf8");
	const marker = `### ${option}`;
	const start = content.indexOf(marker);
	if (start === -1) {
		return `${name}: ${option}`;
	}

	const afterStart = content.slice(start + marker.length);
	const nextHeading = afterStart.match(/\n###\s+/);
	const end = nextHeading ? start + marker.length + (nextHeading.index ?? 0) : content.length;
	return content.slice(start, end).trim();
}

export function loadStyleInstructions({
	style,
	stylePreset,
	texture,
	mood,
	typography,
	density,
}: {
	style: string;
	stylePreset?: string;
	texture: Texture;
	mood: Mood;
	typography: Typography;
	density: Density;
}): string {
	if (stylePreset) {
		const referencePath = styleReferencePath({ preset: stylePreset });
		if (existsSync(referencePath)) {
			return readFileSync(referencePath, "utf8").trim();
		}
	}

	return [
		`# ${style}`,
		"",
		"Custom dimension-composed slide style.",
		"",
		"## Dimension Summary",
		`- Texture: ${texture}`,
		`- Mood: ${mood}`,
		`- Typography: ${typography}`,
		`- Density: ${density}`,
		"",
		"## Texture",
		extractDimensionSection({ name: "texture", option: texture }),
		"",
		"## Mood",
		extractDimensionSection({ name: "mood", option: mood }),
		"",
		"## Typography",
		extractDimensionSection({ name: "typography", option: typography }),
		"",
		"## Density",
		extractDimensionSection({ name: "density", option: density }),
	].join("\n");
}

function selectLayout({ section, index, total }: { section?: Section; index: number; total: number }): string {
	if (index === 1) {
		return "title-hero";
	}
	if (index === total) {
		return "quote-callout";
	}

	if (!section) {
		return "bullet-list";
	}

	const joined = `${section.title} ${section.body}`.toLowerCase();
	if (joined.includes("timeline") || joined.includes("history") || joined.includes("roadmap")) {
		return "linear-progression";
	}
	if (joined.includes("compare") || joined.includes("versus") || joined.includes("vs")) {
		return "binary-comparison";
	}
	if (joined.includes("metric") || joined.includes("kpi") || joined.includes("data")) {
		return "dashboard";
	}
	if (joined.includes("process") || joined.includes("step")) {
		return "winding-roadmap";
	}
	return "bullet-list";
}

function buildBodyPoints({ text }: { text: string }): Array<string> {
	return text
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean)
		.slice(0, 3)
		.map((sentence) => shortenToPhrase({ sentence }));
}

/** Shorten a sentence to a max ~8 word phrase suitable for slide rendering. */
function shortenToPhrase({ sentence }: { sentence: string }): string {
	const words = sentence.replace(/\s+/g, " ").split(" ");
	if (words.length <= 8) {
		return words.join(" ");
	}
	return `${words.slice(0, 7).join(" ")}…`;
}

export function buildSlides({ analysis }: { analysis: AnalysisResult }): Array<SlidePlan> {
	const contentSlideCount = Math.max(1, analysis.targetSlides - 2);
	const sections = analysis.sections.slice(0, contentSlideCount);
	const slides: Array<SlidePlan> = [];

	slides.push({
		index: 1,
		title: analysis.title,
		fileStem: "01-slide-cover",
		type: "cover",
		layout: "title-hero",
		narrativeGoal: "Introduce the topic and establish the deck's visual tone.",
		bodyPoints: analysis.supportingPoints.slice(0, 2).map((p) => shortenToPhrase({ sentence: p })),
		visualDescription: `Create a bold opening frame for "${analysis.title}" with a single dominant visual metaphor. Minimize text — show the concept visually.`,
	});

	for (let index = 0; index < sections.length; index += 1) {
		const slideIndex = index + 2;
		const section = sections[index];
		const stem = slugify({ value: section.title }).split("-").slice(0, 5).join("-");
		slides.push({
			index: slideIndex,
			title: section.title,
			fileStem: `${String(slideIndex).padStart(2, "0")}-slide-${stem || `section-${slideIndex}`}`,
			type: "content",
			layout: selectLayout({ section, index: slideIndex, total: analysis.targetSlides }),
			narrativeGoal: `Explain why "${section.title}" matters to ${analysis.audience}.`,
			bodyPoints: buildBodyPoints({ text: section.body }),
			visualDescription: `Visualize ${section.keywords.join(", ") || section.title} with a simple diagram or metaphor. Avoid decorative filler.`,
		});
	}

	const closingIndex = slides.length + 1;
	slides.push({
		index: closingIndex,
		title: "Key Takeaways",
		fileStem: `${String(closingIndex).padStart(2, "0")}-slide-closing`,
		type: "closing",
		layout: "quote-callout",
		narrativeGoal: "Close the deck with a concise synthesis and a clear next step.",
		bodyPoints: analysis.supportingPoints.slice(0, 3).map((p) => shortenToPhrase({ sentence: p })),
		visualDescription: `End with a memorable visual synthesis. Use icons or a single powerful image — avoid text-heavy closing.`,
	});

	return slides;
}

function qcutBasePath(): string {
	return join(homedir(), "Documents", "QCut");
}

/** Resolves the output directory for slide deck artifacts. */
export function resolveDeckDir({
	analysis,
	outputDir,
	projectId,
}: {
	analysis: AnalysisResult;
	outputDir?: string;
	projectId?: string;
}): string {
	if (outputDir) return resolve(outputDir);
	if (projectId) {
		if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
			throw new Error(`Invalid project ID "${projectId}". Use only letters, numbers, hyphens, and underscores.`);
		}
		return join(qcutBasePath(), "Projects", projectId, "slide-deck", analysis.topicSlug);
	}
	return join(qcutBasePath(), "slide-deck", analysis.topicSlug);
}

export function writeSourceCopy({
	deckDir,
	analysis,
}: {
	deckDir: string;
	analysis: AnalysisResult;
}): void {
	const destination = join(deckDir, `source-${analysis.topicSlug}${analysis.sourceExtension}`);
	if (!existsSync(destination)) {
		copyFileSync(analysis.sourcePath, destination);
	}
}

export function writeAnalysis({
	deckDir,
	analysis,
}: {
	deckDir: string;
	analysis: AnalysisResult;
}): void {
	const lines = [
		"# Analysis",
		"",
		`- Topic: ${analysis.title}`,
		`- Audience: ${analysis.audience}`,
		`- Language: ${analysis.language}`,
		`- Word Count: ${analysis.wordCount}`,
		`- Recommended Slides: ${analysis.recommendedSlides}`,
		`- Target Slides: ${analysis.targetSlides}`,
		`- Style: ${analysis.style}`,
		`- Texture: ${analysis.texture}`,
		`- Mood: ${analysis.mood}`,
		`- Typography: ${analysis.typography}`,
		`- Density: ${analysis.density}`,
		`- Style Reason: ${analysis.styleReason}`,
		`- Core Message: ${analysis.coreMessage}`,
		"",
		"## Supporting Points",
		"",
		...analysis.supportingPoints.map((point) => `- ${point}`),
		"",
		"## Sections",
		"",
		...analysis.sections.map(
			(section, index) =>
				`### ${index + 1}. ${section.title}\n\n${section.body}\n`,
		),
	];

	writeFileSync(join(deckDir, "analysis.md"), `${lines.join("\n").trim()}\n`);
}

export function writeOutline({
	deckDir,
	analysis,
	slides,
	styleInstructions,
}: {
	deckDir: string;
	analysis: AnalysisResult;
	slides: Array<SlidePlan>;
	styleInstructions: string;
}): void {
	const lines = [
		"---",
		`title: ${analysis.title}`,
		`style: ${analysis.style}`,
		`audience: ${analysis.audience}`,
		`language: ${analysis.language}`,
		`slides: ${slides.length}`,
		"---",
		"",
		"# Slide Outline",
		"",
		"## STYLE_INSTRUCTIONS",
		"",
		"<STYLE_INSTRUCTIONS>",
		styleInstructions.trim(),
		"</STYLE_INSTRUCTIONS>",
		"",
	];

	for (const slide of slides) {
		lines.push(`## Slide ${slide.index}: ${slide.title}`);
		lines.push("");
		lines.push(`- Filename: ${slide.fileStem}.png`);
		lines.push(`- Type: ${slide.type}`);
		lines.push(`- Layout: ${slide.layout}`);
		lines.push(`- Narrative Goal: ${slide.narrativeGoal}`);
		lines.push(`- Visual: ${slide.visualDescription}`);
		lines.push("- Body Points:");
		for (const point of slide.bodyPoints) {
			lines.push(`  - ${point}`);
		}
		lines.push("");
	}

	writeFileSync(join(deckDir, "outline.md"), `${lines.join("\n").trim()}\n`);
}

function loadBasePrompt(): string {
	const path = resolve(
		import.meta.dir,
		"..",
		"references",
		"base-prompt.md",
	);
	if (!existsSync(path)) {
		return "Create a 16:9 presentation slide image with strong hierarchy and legible text.";
	}
	return readFileSync(path, "utf8").trim();
}

export function writePrompts({
	deckDir,
	promptsDir,
	slides,
	styleInstructions,
	analysis,
}: {
	deckDir: string;
	promptsDir: string;
	slides: Array<SlidePlan>;
	styleInstructions: string;
	analysis: AnalysisResult;
}): void {
	const basePrompt = loadBasePrompt();
	ensureDir({ path: promptsDir });

	for (const slide of slides) {
		const prompt = [
			basePrompt,
			"",
			"---",
			"",
			`# Slide ${slide.index}: ${slide.title}`,
			"",
			"<STYLE_INSTRUCTIONS>",
			styleInstructions.trim(),
			"</STYLE_INSTRUCTIONS>",
			"",
			"## Slide Metadata",
			`- Language: ${analysis.language}`,
			`- Audience: ${analysis.audience}`,
			`- Layout: ${slide.layout}`,
			`- Type: ${slide.type}`,
			"",
			"## Slide Content",
			`- Title (render as text, 2-4 words): ${slide.title}`,
			`- Narrative Goal: ${slide.narrativeGoal}`,
			`- Visual Direction: ${slide.visualDescription}`,
			"- Concepts to illustrate as ICONS/VISUALS (do NOT render as text):",
			...slide.bodyPoints.map((point) => `  - ${point}`),
			"",
			"## Rendering Rules (CRITICAL)",
			"- Keep 16:9 slide composition.",
			"- Do not include slide numbers, logos, headers, or footers.",
			"- ALMOST NO TEXT: only the title (2-4 words) and at most one short label.",
			"- DO NOT render body points as text. Convert them to icons, pictograms, or diagrams.",
			"- The slide must be 80%+ visual content (illustrations, icons, diagrams, charts).",
			"- DO NOT write sentences or paragraphs anywhere on the slide.",
		];
		writeFileSync(join(promptsDir, `${slide.fileStem}.md`), `${prompt.join("\n").trim()}\n`);
	}

	const promptIndex = slides
		.map((slide) => `- ${slide.index}. ${slide.title} -> prompts/${slide.fileStem}.md`)
		.join("\n");
	writeFileSync(join(deckDir, "prompts.md"), `# Prompt Index\n\n${promptIndex}\n`);
}

export function planDeck({ options }: { options: CLIOptions }): DeckPlan {
	const analysis = analyzeSource({ options });
	const deckDir = resolveDeckDir({ analysis, outputDir: options.outputDir, projectId: options.projectId });
	const promptsDir = join(deckDir, "prompts");
	const styleInstructions = loadStyleInstructions({
		style: analysis.style,
		stylePreset: analysis.stylePreset,
		texture: analysis.texture,
		mood: analysis.mood,
		typography: analysis.typography,
		density: analysis.density,
	});
	const slides = buildSlides({ analysis });

	return {
		deckDir,
		promptsDir,
		analysis,
		slides,
		styleInstructions,
	};
}

export function renderDeckArtifacts({
	deckPlan,
	skipPrompts,
}: {
	deckPlan: DeckPlan;
	skipPrompts?: boolean;
}): void {
	ensureDir({ path: deckPlan.deckDir });
	writeSourceCopy({ deckDir: deckPlan.deckDir, analysis: deckPlan.analysis });
	writeAnalysis({ deckDir: deckPlan.deckDir, analysis: deckPlan.analysis });
	writeOutline({
		deckDir: deckPlan.deckDir,
		analysis: deckPlan.analysis,
		slides: deckPlan.slides,
		styleInstructions: deckPlan.styleInstructions,
	});
	if (!skipPrompts) {
		writePrompts({
			deckDir: deckPlan.deckDir,
			promptsDir: deckPlan.promptsDir,
			slides: deckPlan.slides,
			styleInstructions: deckPlan.styleInstructions,
			analysis: deckPlan.analysis,
		});
	}
}

function parsePromptSlideNumber({ filename }: { filename: string }): number | null {
	const match = filename.match(/^(\d+)-slide-.*\.md$/i);
	if (!match) {
		return null;
	}
	return Number(match[1]);
}

export function discoverPromptFiles({
	deckDir,
	selectedSlides,
}: {
	deckDir: string;
	selectedSlides?: Array<number>;
}): Array<string> {
	const promptsDir = join(deckDir, "prompts");
	if (!existsSync(promptsDir)) {
		throw new Error(`Prompts directory not found: ${promptsDir}`);
	}

	const allowed = selectedSlides && selectedSlides.length > 0 ? new Set(selectedSlides) : null;
	const promptFiles = readdirSync(promptsDir)
		.filter((filename) => filename.endsWith(".md"))
		.map((filename) => join(promptsDir, filename))
		.filter((path) => {
			if (!allowed) {
				return true;
			}
			const slideNumber = parsePromptSlideNumber({ filename: basename(path) });
			return slideNumber !== null && allowed.has(slideNumber);
		})
		.sort();

	if (promptFiles.length === 0) {
		throw new Error(`No prompt files found in: ${promptsDir}`);
	}

	return promptFiles;
}

function detectImageExtension({ bytes }: { bytes: Uint8Array }): string {
	if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) {
		return ".png";
	}
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		return ".jpeg";
	}
	return ".png";
}

export function imageOutputPath({
	deckDir,
	promptFile,
}: {
	deckDir: string;
	promptFile: string;
}): string {
	return join(deckDir, `${basename(promptFile, ".md")}.png`);
}

export async function runImageGeneration({
	deckDir,
	promptFiles,
	provider,
	model,
	dryRun,
}: {
	deckDir: string;
	promptFiles: Array<string>;
	provider?: string;
	model?: string;
	dryRun: boolean;
}): Promise<{ generated: Array<string>; skipped: string | null }> {
	const resolvedProvider = provider?.trim() || "fal";
	if (resolvedProvider !== "fal") {
		return {
			generated: [],
			skipped: `qcut-slide local rendering currently supports only the fal provider. Received: ${resolvedProvider}`,
		};
	}

	if (!hasFalCredentials()) {
		return {
			generated: [],
			skipped: "No FAL_KEY or FAL_API_KEY found. Generated outline and prompts only.",
		};
	}

	const generated: Array<string> = [];
	for (const promptFile of promptFiles) {
		const outputPath = imageOutputPath({ deckDir, promptFile });

		if (dryRun) {
			generated.push(outputPath);
			continue;
		}

		const prompt = readFileSync(promptFile, "utf8");
		const actualPath = await writeRenderedImage({
			prompt,
			model: model?.trim() || getDefaultFalModel(),
			outputPath,
		});
		generated.push(actualPath);
	}

	return { generated, skipped: null };
}

async function writeRenderedImage({
	prompt,
	model,
	outputPath,
}: {
	prompt: string;
	model: string;
	outputPath: string;
}): Promise<string> {
	const bytes = await generateFalImage({
		prompt,
		model,
		aspectRatio: "16:9",
	});
	const ext = detectImageExtension({ bytes });
	const actualPath = outputPath.replace(/\.png$/i, ext);
	await Bun.write(actualPath, bytes);
	return actualPath;
}

export function mergeOutputs({
	deckDir,
	dryRun,
}: {
	deckDir: string;
	dryRun: boolean;
}): void {
	const pptxScript = join(import.meta.dir, "merge-to-pptx.ts");
	const pdfScript = join(import.meta.dir, "merge-to-pdf.ts");
	if (!existsSync(pptxScript) || !existsSync(pdfScript)) {
		throw new Error("Merge scripts are missing.");
	}

	if (dryRun) {
		return;
	}

	for (const script of [pptxScript, pdfScript]) {
		const result = Bun.spawnSync({
			cmd: ["bun", script, deckDir],
			stdout: "inherit",
			stderr: "inherit",
		});
		if (result.exitCode !== 0) {
			throw new Error(`Merge failed: ${basename(script)}`);
		}
	}
}

export function readExistingDeckMetadata({
	deckDir,
}: {
	deckDir: string;
}): { title: string; style: string } {
	const outlinePath = join(deckDir, "outline.md");
	if (!existsSync(outlinePath)) {
		return { title: basename(deckDir), style: DEFAULT_STYLE };
	}

	const outline = readFileSync(outlinePath, "utf8");
	const title = outline.match(/^title:\s+(.+)$/m)?.[1]?.trim() ?? basename(deckDir);
	const style = outline.match(/^style:\s+(.+)$/m)?.[1]?.trim() ?? DEFAULT_STYLE;
	return { title, style };
}
