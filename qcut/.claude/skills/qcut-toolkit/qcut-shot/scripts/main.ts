import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	discoverPromptFiles,
	parseArgs,
	planShots,
	renderShotArtifacts,
	runImageGeneration,
} from "./lib";

function summarize({
	shotDir,
	title,
	style,
	promptCount,
	generatedCount,
	skippedReason,
}: {
	shotDir: string;
	title: string;
	style: string;
	promptCount: number;
	generatedCount: number;
	skippedReason: string | null;
}): void {
	console.log("");
	console.log("QCut Shot Complete");
	console.log(`- Project: ${title}`);
	console.log(`- Style: ${style}`);
	console.log(`- Location: ${shotDir}`);
	console.log(`- Prompts: ${promptCount}`);
	console.log(`- Images Generated: ${generatedCount}`);
	if (skippedReason) {
		console.log(`- Images Skipped: ${skippedReason}`);
	}
}

function readTitleAndStyle({ shotDir }: { shotDir: string }): { title: string; style: string } {
	const shotsPath = resolve(shotDir, "shots.md");
	if (!existsSync(shotsPath)) {
		return { title: shotDir, style: "cinematic" };
	}
	const text = readFileSync(shotsPath, "utf8");
	const title = text.match(/^title:\s+(.+)$/m)?.[1]?.trim() ?? shotDir;
	const style = text.match(/^style:\s+(.+)$/m)?.[1]?.trim() ?? "cinematic";
	return { title, style };
}

async function main(): Promise<void> {
	const options = parseArgs({ argv: process.argv });

	if (options.imagesOnly || options.regenerate) {
		const shotDir = resolve(options.input);
		if (!existsSync(shotDir)) {
			throw new Error(`Shot directory not found: ${shotDir}`);
		}
		const promptFiles = discoverPromptFiles({
			shotDir,
			selectedShots: options.regenerate,
		});
		const result = await runImageGeneration({
			shotDir,
			promptFiles,
			provider: options.provider,
			model: options.model,
			dryRun: options.dryRun,
		});
		const meta = readTitleAndStyle({ shotDir });
		summarize({
			shotDir,
			title: meta.title,
			style: meta.style,
			promptCount: promptFiles.length,
			generatedCount: result.generated.length,
			skippedReason: result.skipped,
		});
		return;
	}

	const project = planShots({ options });
	renderShotArtifacts({ project });

	console.log(`Shot directory: ${project.shotDir}`);
	console.log(`Shots: ${resolve(project.shotDir, "shots.md")}`);
	console.log(`Prompts: ${project.promptsDir}`);

	if (options.promptsOnly) {
		console.log("Stopped after prompt generation because --prompts-only was provided.");
		return;
	}

	const promptFiles = discoverPromptFiles({ shotDir: project.shotDir });
	const result = await runImageGeneration({
		shotDir: project.shotDir,
		promptFiles,
		provider: options.provider,
		model: options.model,
		dryRun: options.dryRun,
	});

	summarize({
		shotDir: project.shotDir,
		title: project.analysis.title,
		style: project.analysis.style,
		promptCount: promptFiles.length,
		generatedCount: result.generated.length,
		skippedReason: result.skipped,
	});
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
});
