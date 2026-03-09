import { join } from "node:path";
import { analyzeSource } from "./pipeline/analysis";
import { parseArgs } from "./core/args";
import { renderShotArtifacts, shotsDir } from "./pipeline/artifacts";
import { loadStyleInstructions } from "./pipeline/references";
import { planScenes } from "./pipeline/scene-planner";
import { validateBreakdown } from "./pipeline/shots";
import type { CLIOptions, ShotProject } from "./core/types";

export { analyzeSource } from "./pipeline/analysis";
export { parseArgs } from "./core/args";
export { discoverPromptFiles, imageOutputPath, runImageGeneration } from "./pipeline/render";
export { loadStyleInstructions } from "./pipeline/references";
export { planScenes } from "./pipeline/scene-planner";
export { validateBreakdown } from "./pipeline/shots";
export type {
	AnalysisResult,
	CLIOptions,
	Character,
	ContentFormat,
	Framing,
	Lighting,
	Medium,
	Movement,
	Scene,
	SceneBreakdown,
	SceneCamera,
	ShotMood,
	ShotProject,
	ShotRenderManifest,
} from "./core/types";
export { parseNumberList, slugify } from "./core/utils";

export async function planShotsAsync({ options }: { options: CLIOptions }): Promise<ShotProject> {
	const analysis = analyzeSource({ options });
	const shotDir = shotsDir({ analysis, outputDir: options.outputDir, projectId: options.projectId });
	const promptsDir = join(shotDir, "prompts");
	const styleInstructions = loadStyleInstructions({
		style: analysis.style,
		stylePreset: analysis.stylePreset,
		framing: analysis.framing,
		movement: analysis.movement,
		lighting: analysis.lighting,
		mood: analysis.mood,
	});

	const rawBreakdown = await planScenes({
		sourceContent: analysis.sourceContent,
		targetShots: analysis.targetShots,
		medium: analysis.medium,
		format: analysis.format,
	});
	const breakdown = validateBreakdown({ breakdown: rawBreakdown });

	return {
		shotDir,
		promptsDir,
		analysis,
		breakdown,
		styleInstructions,
	};
}

export { renderShotArtifacts };
