import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { generateFalImage, getDefaultFalModel, hasFalCredentials } from "./providers/fal";

export type Audience =
	| "beginners"
	| "intermediate"
	| "experts"
	| "executives"
	| "general";

export interface CLIOptions {
	input: string;
	style?: string;
	audience: Audience;
	lang?: string;
	slides?: number;
	outlineOnly: boolean;
	promptsOnly: boolean;
	imagesOnly: boolean;
	regenerate?: Array<number>;
	outputDir?: string;
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
	styleReason: string;
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
	let lang: string | undefined;
	let slides: number | undefined;
	let outlineOnly = false;
	let promptsOnly = false;
	let imagesOnly = false;
	let regenerate: Array<number> | undefined;
	let outputDir: string | undefined;
	let provider: string | undefined;
	let model: string | undefined;
	let dryRun = false;

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) {
			continue;
		}

		if (!value.startsWith("-")) {
			input = value;
			continue;
		}

		if (value === "--style") {
			style = args[index + 1];
			index += 1;
			continue;
		}

		if (value === "--audience") {
			const nextValue = args[index + 1] as Audience | undefined;
			if (nextValue) {
				audience = nextValue;
			}
			index += 1;
			continue;
		}

		if (value === "--lang") {
			lang = args[index + 1];
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
			outputDir = args[index + 1];
			index += 1;
			continue;
		}

		if (value === "--provider") {
			provider = args[index + 1];
			index += 1;
			continue;
		}

		if (value === "--model") {
			model = args[index + 1];
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
		throw new Error("Usage: bun main.ts <content-file|deck-dir> [options]");
	}

	return {
		input,
		style,
		audience,
		lang,
		slides,
		outlineOnly,
		promptsOnly,
		imagesOnly,
		regenerate,
		outputDir,
		provider,
		model,
		dryRun,
	};
}

export function parseSlideList({ value }: { value?: string }): Array<number> {
	if (!value?.trim()) {
		return [];
	}

	const unique = new Set<number>();
	for (const part of value.split(",")) {
		const parsed = Number(part.trim());
		if (Number.isInteger(parsed) && parsed > 0) {
			unique.add(parsed);
		}
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
		.replace(/[`"'“”‘’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "slide-deck";
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
	if (explicit?.trim()) {
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
	const styleResult = detectStyle({ content, explicit: options.style });
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
		style: styleResult.preset,
		styleReason: styleResult.reason,
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

export function loadStyleInstructions({ preset }: { preset: string }): string {
	const referencePath = styleReferencePath({ preset });
	if (existsSync(referencePath)) {
		return readFileSync(referencePath, "utf8").trim();
	}
	return `# ${preset}\n\nUse a clear, high-contrast editorial slide style with disciplined layout, strong hierarchy, and legible text.`;
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
		.map((sentence) => sentence.replace(/\s+/g, " "));
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
		bodyPoints: analysis.supportingPoints.slice(0, 2),
		visualDescription: `Create a bold opening frame for "${analysis.title}" with a single dominant metaphor tied to ${analysis.coreMessage}.`,
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
		bodyPoints: analysis.supportingPoints.slice(0, 3),
		visualDescription: `End with a memorable synthesis frame that reinforces ${analysis.coreMessage}.`,
	});

	return slides;
}

export function resolveDeckDir({
	analysis,
	outputDir,
}: {
	analysis: AnalysisResult;
	outputDir?: string;
}): string {
	const baseDir = outputDir
		? resolve(outputDir)
		: resolve(process.cwd(), "slide-deck", analysis.topicSlug);
	return baseDir;
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
			`- Title: ${slide.title}`,
			`- Narrative Goal: ${slide.narrativeGoal}`,
			`- Visual Direction: ${slide.visualDescription}`,
			"- Body Points:",
			...slide.bodyPoints.map((point) => `  - ${point}`),
			"",
			"## Rendering Rules",
			"- Keep 16:9 slide composition.",
			"- Do not include slide numbers, logos, headers, or footers.",
			"- Keep text short, legible, and aligned to the selected style.",
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
	const deckDir = resolveDeckDir({ analysis, outputDir: options.outputDir });
	const promptsDir = join(deckDir, "prompts");
	const styleInstructions = loadStyleInstructions({ preset: analysis.style });
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
}: {
	deckPlan: DeckPlan;
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
	writePrompts({
		deckDir: deckPlan.deckDir,
		promptsDir: deckPlan.promptsDir,
		slides: deckPlan.slides,
		styleInstructions: deckPlan.styleInstructions,
		analysis: deckPlan.analysis,
	});
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
		await writeRenderedImage({
			prompt,
			model: model?.trim() || getDefaultFalModel(),
			outputPath,
		});
		generated.push(outputPath);
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
}): Promise<void> {
	const bytes = await generateFalImage({
		prompt,
		model,
		aspectRatio: "16:9",
	});
	await Bun.write(outputPath, bytes);
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
