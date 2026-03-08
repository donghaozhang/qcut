import { join } from "node:path";
import { analyzeSource } from "./analysis";
import { parseArgs } from "./args";
import { renderShotArtifacts, shotsDir } from "./artifacts";
import { loadStyleInstructions } from "./references";
import { buildShots } from "./shots";
import type { CLIOptions, ShotProject } from "./types";

export { analyzeSource } from "./analysis";
export { parseArgs } from "./args";
export { discoverPromptFiles, imageOutputPath, runImageGeneration } from "./render";
export { loadStyleInstructions } from "./references";
export { buildShots } from "./shots";
export type {
	AnalysisResult,
	Beat,
	CLIOptions,
	CharacterAnchor,
	ContentFormat,
	Framing,
	Lighting,
	Medium,
	Movement,
	ShotContinuity,
	ShotMood,
	ShotPlan,
	ShotProject,
	VisualAnchors,
} from "./types";
export { parseNumberList, slugify } from "./utils";

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

export { renderShotArtifacts };
