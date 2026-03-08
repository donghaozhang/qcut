import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadBasePrompt } from "./references";
import type { AnalysisResult, ShotPlan } from "./types";
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
	shots: ShotPlan[];
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
	shots: ShotPlan[];
}): void {
	writeFileSync(
		join(shotDir, "shots.json"),
		`${JSON.stringify({ title: analysis.title, style: analysis.style, shots }, null, 2)}\n`,
	);
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
	shots: ShotPlan[];
	styleInstructions: string;
}): void {
	ensureDir({ path: promptsDir });
	const promptPrelude = loadBasePrompt();
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

export function renderShotArtifacts({
	project,
}: {
	project: {
		shotDir: string;
		promptsDir: string;
		analysis: AnalysisResult;
		shots: ShotPlan[];
		styleInstructions: string;
	};
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
