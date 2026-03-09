import { join } from "node:path";
import { analyzeSource } from "./analysis";
import { parseArgs } from "./args";
import { renderShotArtifacts, shotsDir } from "./artifacts";
import { loadStyleInstructions } from "./references";
import { planScenes } from "./scene-planner";
import { validateBreakdown } from "./shots";
import type { CLIOptions, ShotProject } from "./types";

export { analyzeSource } from "./analysis";
export { parseArgs } from "./args";
export { discoverPromptFiles, imageOutputPath, runImageGeneration } from "./render";
export { loadStyleInstructions } from "./references";
export { planScenes } from "./scene-planner";
export { validateBreakdown } from "./shots";
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
} from "./types";
export { parseNumberList, slugify } from "./utils";

export async function planShotsAsync({ options }: { options: CLIOptions }): Promise<ShotProject> {
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
