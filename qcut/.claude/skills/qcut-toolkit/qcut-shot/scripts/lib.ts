import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { generateFalImage, getDefaultFalModel, hasFalCredentials } from "./providers/fal";

export type Framing = "wide" | "medium" | "close" | "macro" | "overhead";
export type Movement = "locked-off" | "handheld" | "dolly" | "slider" | "crane" | "dynamic";
export type Lighting = "natural" | "bright" | "dramatic" | "low-key" | "neon" | "soft";
export type ShotMood = "grounded" | "warm" | "tense" | "moody" | "polished" | "heightened";

export interface CLIOptions {
	input: string;
	style?: string;
	framing?: Framing;
	movement?: Movement;
	lighting?: Lighting;
	mood?: ShotMood;
	lang?: string;
	shots?: number;
	promptsOnly: boolean;
	imagesOnly: boolean;
	regenerate?: Array<number>;
	outputDir?: string;
	provider?: string;
	model?: string;
	dryRun: boolean;
}

export interface Beat {
	title: string;
	body: string;
	keywords: Array<string>;
}

export interface AnalysisResult {
	title: string;
	topicSlug: string;
	sourcePath: string;
	sourceExtension: string;
	wordCount: number;
	language: string;
	style: string;
	stylePreset?: string;
	styleReason: string;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
	recommendedShots: number;
	targetShots: number;
	coreThroughline: string;
	beats: Array<Beat>;
	visualAnchors: VisualAnchors;
}

export interface ShotPlan {
	index: number;
	title: string;
	fileStem: string;
	shotType: "opening" | "action" | "detail" | "reaction" | "closing";
	continuity: ShotContinuity;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
	purpose: string;
	beat: string;
	visualDirection: string;
	shotRoleGuidance: string;
	negativePrompt: string;
}

export interface VisualAnchors {
	subjectId: string;
	subjectAnchor: string;
	locationId: string;
	locationAnchor: string;
	propId: string;
	propAnchor: string;
	paletteAnchor: string;
	continuityRules: Array<string>;
}

export interface ShotContinuity {
	subjectId: string;
	locationId: string;
	propId: string;
	continuityNotes: Array<string>;
}

export interface ShotProject {
	shotDir: string;
	promptsDir: string;
	analysis: AnalysisResult;
	shots: Array<ShotPlan>;
	styleInstructions: string;
}

const DEFAULT_STYLE = "cinematic";
const MIN_SHOTS = 4;
const MAX_SHOTS = 24;
const VALID_FRAMINGS = ["wide", "medium", "close", "macro", "overhead"] as const;
const VALID_MOVEMENTS = ["locked-off", "handheld", "dolly", "slider", "crane", "dynamic"] as const;
const VALID_LIGHTINGS = ["natural", "bright", "dramatic", "low-key", "neon", "soft"] as const;
const VALID_MOODS = ["grounded", "warm", "tense", "moody", "polished", "heightened"] as const;
const PRESETS: Record<
	string,
	{
		framing: Framing;
		movement: Movement;
		lighting: Lighting;
		mood: ShotMood;
	}
> = {
	cinematic: { framing: "wide", movement: "dolly", lighting: "dramatic", mood: "moody" },
	documentary: { framing: "medium", movement: "handheld", lighting: "natural", mood: "grounded" },
	commercial: { framing: "close", movement: "slider", lighting: "bright", mood: "polished" },
	"anime-storyboard": { framing: "wide", movement: "dynamic", lighting: "dramatic", mood: "heightened" },
	noir: { framing: "close", movement: "locked-off", lighting: "low-key", mood: "tense" },
	product: { framing: "macro", movement: "slider", lighting: "bright", mood: "polished" },
};
const STYLE_SIGNAL_MAP: Array<{ preset: string; keywords: Array<string> }> = [
	{ preset: "documentary", keywords: ["real", "interview", "documentary", "truth", "observation"] },
	{ preset: "commercial", keywords: ["brand", "product", "launch", "premium", "marketing"] },
	{ preset: "anime-storyboard", keywords: ["anime", "fantasy", "hero", "battle", "magic"] },
	{ preset: "noir", keywords: ["crime", "noir", "shadow", "mystery", "detective"] },
	{ preset: "product", keywords: ["device", "product", "feature", "unboxing", "detail"] },
	{ preset: "cinematic", keywords: ["story", "scene", "cinematic", "film", "character"] },
];

export function parseArgs({ argv }: { argv: Array<string> }): CLIOptions {
	const args = argv.slice(2);
	let input = "";
	let style: string | undefined;
	let framing: Framing | undefined;
	let movement: Movement | undefined;
	let lighting: Lighting | undefined;
	let mood: ShotMood | undefined;
	let lang: string | undefined;
	let shots: number | undefined;
	let promptsOnly = false;
	let imagesOnly = false;
	let regenerate: Array<number> | undefined;
	let outputDir: string | undefined;
	let provider: string | undefined;
	let model: string | undefined;
	let dryRun = false;

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) continue;
		if (!value.startsWith("-")) {
			input = value;
			continue;
		}

		if (value === "--style") {
			style = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--framing") {
			framing = parseEnum({ value: args[index + 1], valid: VALID_FRAMINGS, flag: "--framing" }) as Framing;
			index += 1;
			continue;
		}
		if (value === "--movement") {
			movement = parseEnum({ value: args[index + 1], valid: VALID_MOVEMENTS, flag: "--movement" }) as Movement;
			index += 1;
			continue;
		}
		if (value === "--lighting") {
			lighting = parseEnum({ value: args[index + 1], valid: VALID_LIGHTINGS, flag: "--lighting" }) as Lighting;
			index += 1;
			continue;
		}
		if (value === "--mood") {
			mood = parseEnum({ value: args[index + 1], valid: VALID_MOODS, flag: "--mood" }) as ShotMood;
			index += 1;
			continue;
		}
		if (value === "--lang") {
			lang = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--shots") {
			const parsed = Number(args[index + 1]);
			if (Number.isFinite(parsed)) {
				shots = parsed;
			}
			index += 1;
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
		if (value === "--regenerate") {
			regenerate = parseNumberList({ value: args[index + 1] });
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
		if (value === "--dry-run") {
			dryRun = true;
		}
	}

	if (!input) {
		throw new Error("Usage: bun main.ts <content-file|shot-dir> [options]");
	}

	return {
		input,
		style,
		framing,
		movement,
		lighting,
		mood,
		lang,
		shots,
		promptsOnly,
		imagesOnly,
		regenerate,
		outputDir,
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

export function parseNumberList({ value }: { value?: string }): Array<number> {
	if (!value?.trim()) {
		return [];
	}
	const unique = new Set<number>();
	for (const item of value.split(",")) {
		const parsed = Number(item.trim());
		if (Number.isInteger(parsed) && parsed > 0) {
			unique.add(parsed);
		}
	}
	return [...unique].sort((a, b) => a - b);
}

function ensureDir({ path }: { path: string }): void {
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
	return normalized || "shot-plan";
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

function collectFrequentTerms({ text }: { text: string }): Array<string> {
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

function extractBeats({ content }: { content: string }): Array<Beat> {
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

function resolveStyle({
	content,
	options,
}: {
	content: string;
	options: CLIOptions;
}): {
	style: string;
	stylePreset?: string;
	styleReason: string;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
} {
	const detected = detectPreset({ content, explicit: options.style });
	const basePreset = PRESETS[detected.preset] ? detected.preset : DEFAULT_STYLE;
	const base = PRESETS[basePreset];
	const hasCustom = Boolean(
		options.style === "custom" ||
			options.framing ||
			options.movement ||
			options.lighting ||
			options.mood,
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
	terms: Array<string>;
	candidates: Array<string>;
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
	fallbackTerms: Array<string>;
	candidates: Array<string>;
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
	beats: Array<Beat>;
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
	const style = resolveStyle({ content, options });
	const wordCount = content.split(/\s+/).filter(Boolean).length;
	const recommendedShots = recommendShots({ wordCount });
	const targetShots = resolveShotCount({ explicit: options.shots, recommended: recommendedShots });
	const beats = extractBeats({ content });
	const visualAnchors = buildVisualAnchors({ content, title, style, beats });

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

function referencePath({
	parts,
}: {
	parts: Array<string>;
}): string {
	return resolve(import.meta.dir, "..", "references", ...parts);
}

function extractDimensionSection({
	file,
	option,
}: {
	file: string;
	option: string;
}): string {
	const path = referencePath({ parts: ["dimensions", `${file}.md`] });
	if (!existsSync(path)) {
		return `${file}: ${option}`;
	}
	const content = readFileSync(path, "utf8");
	const marker = `### ${option}`;
	const start = content.indexOf(marker);
	if (start === -1) {
		return `${file}: ${option}`;
	}
	const rest = content.slice(start + marker.length);
	const next = rest.match(/\n###\s+/);
	const end = next ? start + marker.length + (next.index ?? 0) : content.length;
	return content.slice(start, end).trim();
}

export function loadStyleInstructions({
	style,
	stylePreset,
	framing,
	movement,
	lighting,
	mood,
}: {
	style: string;
	stylePreset?: string;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
}): string {
	if (stylePreset) {
		const presetReference = referencePath({ parts: ["dimensions", "presets.md"] });
		if (existsSync(presetReference)) {
			const presetContent = readFileSync(presetReference, "utf8");
			if (presetContent.includes(`### ${stylePreset}`)) {
				return [
					`# ${stylePreset}`,
					"",
					`Preset shot style built from ${framing} framing, ${movement} movement, ${lighting} lighting, and ${mood} mood.`,
					"",
					"## Framing",
					extractDimensionSection({ file: "framing", option: framing }),
					"",
					"## Movement",
					extractDimensionSection({ file: "movement", option: movement }),
					"",
					"## Lighting",
					extractDimensionSection({ file: "lighting", option: lighting }),
					"",
					"## Mood",
					extractDimensionSection({ file: "mood", option: mood }),
				].join("\n");
			}
		}
	}

	return [
		`# ${style}`,
		"",
		"Custom shot style composed from dimensions.",
		"",
		`- Framing: ${framing}`,
		`- Movement: ${movement}`,
		`- Lighting: ${lighting}`,
		`- Mood: ${mood}`,
		"",
		"## Framing",
		extractDimensionSection({ file: "framing", option: framing }),
		"",
		"## Movement",
		extractDimensionSection({ file: "movement", option: movement }),
		"",
		"## Lighting",
		extractDimensionSection({ file: "lighting", option: lighting }),
		"",
		"## Mood",
		extractDimensionSection({ file: "mood", option: mood }),
	].join("\n");
}

function shotTypeForIndex({
	index,
	total,
}: {
	index: number;
	total: number;
}): ShotPlan["shotType"] {
	if (index === 1) return "opening";
	if (index === total) return "closing";
	if (index % 3 === 0) return "detail";
	if (index % 2 === 0) return "action";
	return "reaction";
}

function framingForShot({
	base,
	type,
}: {
	base: Framing;
	type: ShotPlan["shotType"];
}): Framing {
	if (type === "opening") return "wide";
	if (type === "detail") return base === "wide" ? "close" : "macro";
	if (type === "closing") return base === "macro" ? "medium" : base;
	return base;
}

function buildShotVisual({
	beat,
	type,
}: {
	beat: Beat;
	type: ShotPlan["shotType"];
}): string {
	if (type === "opening") {
		return `Establish the environment and subject around ${beat.title}.`;
	}
	if (type === "detail") {
		return `Focus on a concrete detail tied to ${beat.keywords[0] || beat.title}.`;
	}
	if (type === "closing") {
		return `Land the final emotional image for ${beat.title}.`;
	}
	return `Visualize the active beat in ${beat.title} with clear subject emphasis.`;
}

function shotRoleGuidance({
	shotType,
	anchors,
}: {
	shotType: ShotPlan["shotType"];
	anchors: VisualAnchors;
}): string {
	if (shotType === "opening") {
		return `Open with clear geography. Introduce ${anchors.subjectId} inside ${anchors.locationId} and make the world readable before action details.`;
	}
	if (shotType === "detail") {
		return `Stay tight on a tactile story clue linked to ${anchors.propId}. Preserve the same wardrobe, skin texture, and prop design established earlier.`;
	}
	if (shotType === "closing") {
		return `Deliver payoff by echoing the opening geography, but with escalated emotion and the same ${anchors.subjectId} now clearly transformed by the beat.`;
	}
	if (shotType === "reaction") {
		return `Prioritize subject psychology. Keep the face, posture, and costume language tied to ${anchors.subjectId} rather than inventing a new character.`;
	}
	return `Stage decisive movement inside the established ${anchors.locationId}. Motion should clarify stakes, not replace continuity.`;
}

function continuityNotesForShot({
	shotType,
	anchors,
}: {
	shotType: ShotPlan["shotType"];
	anchors: VisualAnchors;
}): Array<string> {
	const notes = [
		`Use subject ${anchors.subjectId} consistently.`,
		`Keep location ${anchors.locationId} coherent.`,
		`Reuse prop ${anchors.propId} when visible.`,
	];
	if (shotType === "opening") {
		notes.push("Introduce the anchor palette and architecture clearly.");
	}
	if (shotType === "detail") {
		notes.push("Crop closer without losing continuity of costume, hands, and prop materials.");
	}
	if (shotType === "closing") {
		notes.push("Echo the opening geography so the sequence feels complete.");
	}
	return notes;
}

function negativePromptForShot({
	shotType,
}: {
	shotType: ShotPlan["shotType"];
}): string {
	const shared = [
		"no extra hero characters",
		"no wardrobe reset",
		"no unrelated architecture style",
		"no futuristic UI overlays or text",
		"no logo, watermark, or subtitle",
	];
	if (shotType === "detail") {
		shared.push("no random second prop", "no anatomy distortion", "no faceless mannequin hands");
	}
	if (shotType === "opening" || shotType === "closing") {
		shared.push("no cluttered collage composition", "no disconnected background elements");
	}
	return shared.join("; ");
}

export function buildShots({ analysis }: { analysis: AnalysisResult }): Array<ShotPlan> {
	const shotCount = analysis.targetShots;
	const shots: Array<ShotPlan> = [];

	for (let index = 0; index < shotCount; index += 1) {
		const shotIndex = index + 1;
		const beat = analysis.beats[index % analysis.beats.length] || {
			title: `Beat ${shotIndex}`,
			body: analysis.coreThroughline,
			keywords: [],
		};
		const shotType = shotTypeForIndex({ index: shotIndex, total: shotCount });
		const stem = slugify({ value: beat.title }).split("-").slice(0, 4).join("-");
		shots.push({
			index: shotIndex,
			title: beat.title,
			fileStem: `${String(shotIndex).padStart(2, "0")}-shot-${stem || `beat-${shotIndex}`}`,
			shotType,
			continuity: {
				subjectId: analysis.visualAnchors.subjectId,
				locationId: analysis.visualAnchors.locationId,
				propId: analysis.visualAnchors.propId,
				continuityNotes: continuityNotesForShot({
					shotType,
					anchors: analysis.visualAnchors,
				}),
			},
			framing: framingForShot({ base: analysis.framing, type: shotType }),
			movement: shotType === "detail" ? "slider" : analysis.movement,
			lighting: analysis.lighting,
			mood: analysis.mood,
			purpose:
				shotType === "opening"
					? "Establish context"
					: shotType === "closing"
						? "Deliver visual payoff"
						: shotType === "detail"
							? "Highlight a specific detail"
							: "Advance the scene beat",
			beat: beat.body,
			visualDirection: buildShotVisual({ beat, type: shotType }),
			shotRoleGuidance: shotRoleGuidance({ shotType, anchors: analysis.visualAnchors }),
			negativePrompt: negativePromptForShot({ shotType }),
		});
	}

	return shots;
}

function shotsDir({
	analysis,
	outputDir,
}: {
	analysis: AnalysisResult;
	outputDir?: string;
}): string {
	return outputDir ? resolve(outputDir) : resolve(process.cwd(), "shot-plan", analysis.topicSlug);
}

function copySource({
	shotDir,
	analysis,
}: {
	shotDir: string;
	analysis: AnalysisResult;
}): void {
	const destination = join(shotDir, `source-${analysis.topicSlug}${analysis.sourceExtension}`);
	if (!existsSync(destination)) {
		copyFileSync(analysis.sourcePath, destination);
	}
}

function writeAnalysis({
	shotDir,
	analysis,
}: {
	shotDir: string;
	analysis: AnalysisResult;
}): void {
	const lines = [
		"# Analysis",
		"",
		`- Topic: ${analysis.title}`,
		`- Language: ${analysis.language}`,
		`- Word Count: ${analysis.wordCount}`,
		`- Recommended Shots: ${analysis.recommendedShots}`,
		`- Target Shots: ${analysis.targetShots}`,
		`- Style: ${analysis.style}`,
		`- Framing: ${analysis.framing}`,
		`- Movement: ${analysis.movement}`,
		`- Lighting: ${analysis.lighting}`,
		`- Mood: ${analysis.mood}`,
		`- Style Reason: ${analysis.styleReason}`,
		`- Core Throughline: ${analysis.coreThroughline}`,
		"",
		"## Visual Anchors",
		"",
		`- Subject ID: ${analysis.visualAnchors.subjectId}`,
		`- Subject Anchor: ${analysis.visualAnchors.subjectAnchor}`,
		`- Location ID: ${analysis.visualAnchors.locationId}`,
		`- Location Anchor: ${analysis.visualAnchors.locationAnchor}`,
		`- Prop ID: ${analysis.visualAnchors.propId}`,
		`- Prop Anchor: ${analysis.visualAnchors.propAnchor}`,
		`- Palette Anchor: ${analysis.visualAnchors.paletteAnchor}`,
		"",
		"## Continuity Rules",
		"",
		...analysis.visualAnchors.continuityRules.map((rule) => `- ${rule}`),
		"",
		"## Beats",
		"",
		...analysis.beats.map((beat, index) => `### ${index + 1}. ${beat.title}\n\n${beat.body}\n`),
	];
	writeFileSync(join(shotDir, "analysis.md"), `${lines.join("\n").trim()}\n`);
}

function writeShotsMd({
	shotDir,
	analysis,
	shots,
	styleInstructions,
}: {
	shotDir: string;
	analysis: AnalysisResult;
	shots: Array<ShotPlan>;
	styleInstructions: string;
}): void {
	const lines = [
		"---",
		`title: ${analysis.title}`,
		`style: ${analysis.style}`,
		`language: ${analysis.language}`,
		`shots: ${shots.length}`,
		"---",
		"",
		"# Shot Plan",
		"",
		"<STYLE_INSTRUCTIONS>",
		styleInstructions,
		"</STYLE_INSTRUCTIONS>",
		"",
	];

	for (const shot of shots) {
		lines.push(`## Shot ${shot.index}: ${shot.title}`);
		lines.push("");
		lines.push(`- Filename: ${shot.fileStem}.png`);
		lines.push(`- Type: ${shot.shotType}`);
		lines.push(`- Subject ID: ${shot.continuity.subjectId}`);
		lines.push(`- Location ID: ${shot.continuity.locationId}`);
		lines.push(`- Prop ID: ${shot.continuity.propId}`);
		lines.push(`- Framing: ${shot.framing}`);
		lines.push(`- Movement: ${shot.movement}`);
		lines.push(`- Lighting: ${shot.lighting}`);
		lines.push(`- Mood: ${shot.mood}`);
		lines.push(`- Purpose: ${shot.purpose}`);
		lines.push(`- Beat: ${shot.beat}`);
		lines.push(`- Visual: ${shot.visualDirection}`);
		lines.push(`- Shot Role: ${shot.shotRoleGuidance}`);
		lines.push(`- Negative Prompt: ${shot.negativePrompt}`);
		lines.push(`- Continuity Notes: ${shot.continuity.continuityNotes.join(" | ")}`);
		lines.push("");
	}

	writeFileSync(join(shotDir, "shots.md"), `${lines.join("\n").trim()}\n`);
}

function writeShotsJson({
	shotDir,
	analysis,
	shots,
}: {
	shotDir: string;
	analysis: AnalysisResult;
	shots: Array<ShotPlan>;
}): void {
	writeFileSync(
		join(shotDir, "shots.json"),
		`${JSON.stringify({ title: analysis.title, style: analysis.style, shots }, null, 2)}\n`,
	);
}

function basePrompt(): string {
	const path = referencePath({ parts: ["base-prompt.md"] });
	return existsSync(path)
		? readFileSync(path, "utf8").trim()
		: "Render a cinematic storyboard frame with readable composition.";
}

function writePrompts({
	shotDir,
	promptsDir,
	analysis,
	shots,
	styleInstructions,
}: {
	shotDir: string;
	promptsDir: string;
	analysis: AnalysisResult;
	shots: Array<ShotPlan>;
	styleInstructions: string;
}): void {
	ensureDir({ path: promptsDir });
	const promptPrelude = basePrompt();
	for (const shot of shots) {
		const content = [
			promptPrelude,
			"",
			"---",
			"",
			`# Shot ${shot.index}: ${shot.title}`,
			"",
			"<STYLE_INSTRUCTIONS>",
			styleInstructions,
			"</STYLE_INSTRUCTIONS>",
			"",
			"## Shot Metadata",
			`- Language: ${analysis.language}`,
			`- Type: ${shot.shotType}`,
			`- Subject ID: ${shot.continuity.subjectId}`,
			`- Location ID: ${shot.continuity.locationId}`,
			`- Prop ID: ${shot.continuity.propId}`,
			`- Framing: ${shot.framing}`,
			`- Movement: ${shot.movement}`,
			`- Lighting: ${shot.lighting}`,
			`- Mood: ${shot.mood}`,
			"",
			"## Visual Anchors",
			analysis.visualAnchors.subjectAnchor,
			"",
			analysis.visualAnchors.locationAnchor,
			"",
			analysis.visualAnchors.propAnchor,
			"",
			`Palette anchor: ${analysis.visualAnchors.paletteAnchor}`,
			"",
			"## Continuity Rules",
			...analysis.visualAnchors.continuityRules.map((rule) => `- ${rule}`),
			"",
			"## Shot Role Guidance",
			shot.shotRoleGuidance,
			"",
			"## Continuity Notes",
			...shot.continuity.continuityNotes.map((note) => `- ${note}`),
			"",
			"## Story Beat",
			shot.beat,
			"",
			"## Shot Objective",
			shot.purpose,
			"",
			"## Visual Direction",
			shot.visualDirection,
			"",
			"## Rendering Rules",
			"- One frame only.",
			"- Fill the full frame edge to edge with no cinematic black bars or letterboxing.",
			"- Maintain cinematic readability.",
			"- No subtitles, UI, logos, or watermarks.",
			`- Negative constraints: ${shot.negativePrompt}.`,
		];
		writeFileSync(join(promptsDir, `${shot.fileStem}.md`), `${content.join("\n").trim()}\n`);
	}
	writeFileSync(
		join(shotDir, "prompts.md"),
		`# Prompt Index\n\n${shots.map((shot) => `- ${shot.index}. ${shot.title} -> prompts/${shot.fileStem}.md`).join("\n")}\n`,
	);
}

export function planShots({ options }: { options: CLIOptions }): ShotProject {
	const analysis = analyzeSource({ options });
	const shotDir = shotsDir({ analysis, outputDir: options.outputDir });
	const promptsDir = join(shotDir, "prompts");
	const styleInstructions = loadStyleInstructions({
		style: analysis.style,
		stylePreset: analysis.stylePreset,
		framing: analysis.framing,
		movement: analysis.movement,
		lighting: analysis.lighting,
		mood: analysis.mood,
	});
	const shots = buildShots({ analysis });

	return {
		shotDir,
		promptsDir,
		analysis,
		shots,
		styleInstructions,
	};
}

export function renderShotArtifacts({
	project,
}: {
	project: ShotProject;
}): void {
	ensureDir({ path: project.shotDir });
	copySource({ shotDir: project.shotDir, analysis: project.analysis });
	writeAnalysis({ shotDir: project.shotDir, analysis: project.analysis });
	writeShotsMd({
		shotDir: project.shotDir,
		analysis: project.analysis,
		shots: project.shots,
		styleInstructions: project.styleInstructions,
	});
	writeShotsJson({ shotDir: project.shotDir, analysis: project.analysis, shots: project.shots });
	writePrompts({
		shotDir: project.shotDir,
		promptsDir: project.promptsDir,
		analysis: project.analysis,
		shots: project.shots,
		styleInstructions: project.styleInstructions,
	});
}

export function discoverPromptFiles({
	shotDir,
	selectedShots,
}: {
	shotDir: string;
	selectedShots?: Array<number>;
}): Array<string> {
	const promptsDir = join(shotDir, "prompts");
	if (!existsSync(promptsDir)) {
		throw new Error(`Prompts directory not found: ${promptsDir}`);
	}
	const allowed = selectedShots && selectedShots.length > 0 ? new Set(selectedShots) : null;
	const promptFiles = readdirSync(promptsDir)
		.filter((filename) => filename.endsWith(".md"))
		.map((filename) => join(promptsDir, filename))
		.filter((path) => {
			if (!allowed) return true;
			const match = basename(path).match(/^(\d+)-shot-.*\.md$/i);
			return match ? allowed.has(Number(match[1])) : false;
		})
		.sort();
	if (promptFiles.length === 0) {
		throw new Error(`No prompt files found in: ${promptsDir}`);
	}
	return promptFiles;
}

export function imageOutputPath({
	shotDir,
	promptFile,
}: {
	shotDir: string;
	promptFile: string;
}): string {
	return join(shotDir, `${basename(promptFile, ".md")}.png`);
}

export async function runImageGeneration({
	shotDir,
	promptFiles,
	provider,
	model,
	dryRun,
}: {
	shotDir: string;
	promptFiles: Array<string>;
	provider?: string;
	model?: string;
	dryRun: boolean;
}): Promise<{ generated: Array<string>; skipped: string | null }> {
	const resolvedProvider = provider?.trim() || "fal";
	if (resolvedProvider !== "fal") {
		return {
			generated: [],
			skipped: `qcut-shot local rendering currently supports only the fal provider. Received: ${resolvedProvider}`,
		};
	}
	if (!hasFalCredentials()) {
		return {
			generated: [],
			skipped: "No FAL_KEY or FAL_API_KEY found. Generated analysis and prompts only.",
		};
	}

	const generated: Array<string> = [];
	for (const promptFile of promptFiles) {
		const outputPath = imageOutputPath({ shotDir, promptFile });
		if (dryRun) {
			generated.push(outputPath);
			continue;
		}
		const prompt = readFileSync(promptFile, "utf8");
		const bytes = await generateFalImage({
			prompt,
			model: model?.trim() || getDefaultFalModel(),
			aspectRatio: "16:9",
		});
		await Bun.write(outputPath, bytes);
		generated.push(outputPath);
	}

	return { generated, skipped: null };
}
