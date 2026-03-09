import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadBasePrompt } from "./references";
import type { AnalysisResult, Scene, SceneBreakdown, ShotRenderManifest } from "./types";
import { ensureDir } from "./utils";

export function shotsDir({
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
	breakdown,
}: {
	shotDir: string;
	analysis: AnalysisResult;
	breakdown: SceneBreakdown;
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
		`- Medium: ${analysis.medium}`,
		`- Medium Reason: ${analysis.mediumReason}`,
		`- Format: ${analysis.format}`,
		`- Format Reason: ${analysis.formatReason}`,
		`- Style Reason: ${analysis.styleReason}`,
		"",
		"## Production Rules",
		"",
		...analysis.productionRules.map((rule) => `- ${rule}`),
		"",
		"## Genre Rules",
		"",
		...analysis.genreRules.map((rule) => `- ${rule}`),
		"",
		"## Characters",
		"",
		...breakdown.characters.map(
			(character) => `### ${character.id} (${character.role})\n\n${character.description}\n`,
		),
		"## Continuity Notes",
		"",
		...breakdown.continuityNotes.map((note) => `- ${note}`),
		"",
	];
	writeFileSync(join(shotDir, "analysis.md"), `${lines.join("\n").trim()}\n`);
}

function writeShotsMd({
	shotDir,
	analysis,
	breakdown,
	styleInstructions,
}: {
	shotDir: string;
	analysis: AnalysisResult;
	breakdown: SceneBreakdown;
	styleInstructions: string;
}): void {
	const lines = [
		"---",
		`title: ${analysis.title}`,
		`style: ${analysis.style}`,
		`medium: ${analysis.medium}`,
		`format: ${analysis.format}`,
		`language: ${analysis.language}`,
		`shots: ${breakdown.scenes.length}`,
		"---",
		"",
		"# Shot Plan",
		"",
		"<STYLE_INSTRUCTIONS>",
		styleInstructions,
		"</STYLE_INSTRUCTIONS>",
		"",
		"## Characters",
		"",
		...breakdown.characters.map(
			(c) => `- **${c.id}** (${c.role}): ${c.description}`,
		),
		"",
	];

	for (const scene of breakdown.scenes) {
		lines.push(`## Scene ${scene.index}: ${scene.title}`);
		lines.push("");
		lines.push(`- Filename: ${scene.fileStem}.png`);
		lines.push(`- Camera: ${scene.camera.lens}, ${scene.camera.framing}, ${scene.camera.movement}, ${scene.camera.angle}`);
		lines.push(`- Lighting: ${scene.lighting}`);
		lines.push(`- Location: ${scene.location}`);
		lines.push(`- Characters: ${scene.characterIds.join(", ")}`);
		lines.push(`- Mood: ${scene.mood}`);
		lines.push(`- Props: ${scene.props.join(", ") || "none"}`);
		lines.push(`- Color Palette: ${scene.colorPalette}`);
		lines.push(`- Action: ${scene.action}`);
		lines.push(`- Negative: ${scene.negative}`);
		lines.push("");
	}

	writeFileSync(join(shotDir, "shots.md"), `${lines.join("\n").trim()}\n`);
}

function writeShotsJson({
	shotDir,
	analysis,
	breakdown,
}: {
	shotDir: string;
	analysis: AnalysisResult;
	breakdown: SceneBreakdown;
}): void {
	const manifest: ShotRenderManifest = {
		title: analysis.title,
		style: analysis.style,
		language: analysis.language,
		medium: analysis.medium,
		format: analysis.format,
		productionRules: analysis.productionRules,
		genreRules: analysis.genreRules,
		characters: breakdown.characters,
		continuityNotes: breakdown.continuityNotes,
		scenes: breakdown.scenes,
	};
	writeFileSync(
		join(shotDir, "shots.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
}

function writePrompts({
	shotDir,
	promptsDir,
	analysis,
	breakdown,
	styleInstructions,
}: {
	shotDir: string;
	promptsDir: string;
	analysis: AnalysisResult;
	breakdown: SceneBreakdown;
	styleInstructions: string;
}): void {
	ensureDir({ path: promptsDir });
	const promptPrelude = loadBasePrompt();
	for (const scene of breakdown.scenes) {
		const activeCharacters = breakdown.characters.filter((c) =>
			scene.characterIds.includes(c.id),
		);
		const content = [
			promptPrelude,
			"",
			"---",
			"",
			`# Scene ${scene.index}: ${scene.title}`,
			"",
			"<STYLE_INSTRUCTIONS>",
			styleInstructions,
			"</STYLE_INSTRUCTIONS>",
			"",
			"## Scene Metadata",
			`- Language: ${analysis.language}`,
			`- Medium: ${analysis.medium}`,
			`- Format: ${analysis.format}`,
			`- Camera: ${scene.camera.lens} lens, ${scene.camera.framing}, ${scene.camera.movement}, ${scene.camera.angle}`,
			`- Lighting: ${scene.lighting}`,
			`- Location: ${scene.location}`,
			`- Mood: ${scene.mood}`,
			`- Color Palette: ${scene.colorPalette}`,
			"",
			"## Production Rules",
			...analysis.productionRules.map((rule) => `- ${rule}`),
			"",
			"## Genre Rules",
			...analysis.genreRules.map((rule) => `- ${rule}`),
			"",
			"## Characters in Scene",
			...activeCharacters.map(
				(c) => `- **${c.id}** (${c.role}): ${c.description}`,
			),
			"",
			"## Continuity Notes",
			...breakdown.continuityNotes.map((note) => `- ${note}`),
			"",
			"## Action",
			scene.action,
			"",
			"## Props",
			...(scene.props.length > 0 ? scene.props.map((p) => `- ${p}`) : ["- none"]),
			"",
			"## Rendering Rules",
			"- One frame only.",
			"- Fill the full frame edge to edge with no cinematic black bars or letterboxing.",
			"- Maintain cinematic readability.",
			"- No subtitles, UI, logos, or watermarks.",
			`- Negative constraints: ${scene.negative}.`,
		];
		writeFileSync(join(promptsDir, `${scene.fileStem}.md`), `${content.join("\n").trim()}\n`);
	}
	writeFileSync(
		join(shotDir, "prompts.md"),
		`# Prompt Index\n\n${breakdown.scenes.map((s) => `- ${s.index}. ${s.title} -> prompts/${s.fileStem}.md`).join("\n")}\n`,
	);
}

export function renderShotArtifacts({
	project,
}: {
	project: {
		shotDir: string;
		promptsDir: string;
		analysis: AnalysisResult;
		breakdown: SceneBreakdown;
		styleInstructions: string;
	};
}): void {
	ensureDir({ path: project.shotDir });
	copySource({ shotDir: project.shotDir, analysis: project.analysis });
	writeAnalysis({ shotDir: project.shotDir, analysis: project.analysis, breakdown: project.breakdown });
	writeShotsMd({
		shotDir: project.shotDir,
		analysis: project.analysis,
		breakdown: project.breakdown,
		styleInstructions: project.styleInstructions,
	});
	writeShotsJson({ shotDir: project.shotDir, analysis: project.analysis, breakdown: project.breakdown });
	writePrompts({
		shotDir: project.shotDir,
		promptsDir: project.promptsDir,
		analysis: project.analysis,
		breakdown: project.breakdown,
		styleInstructions: project.styleInstructions,
	});
}
