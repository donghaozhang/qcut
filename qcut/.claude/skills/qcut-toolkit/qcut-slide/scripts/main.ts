import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
	discoverPromptFiles,
	imageOutputPath,
	mergeOutputs,
	parseArgs,
	planDeck,
	readExistingDeckMetadata,
	renderDeckArtifacts,
	runImageGeneration,
} from "./lib";

function printSummary({
	deckDir,
	title,
	style,
	promptCount,
	generatedCount,
	skippedReason,
}: {
	deckDir: string;
	title: string;
	style: string;
	promptCount: number;
	generatedCount: number;
	skippedReason: string | null;
}): void {
	console.log("");
	console.log("QCut Slide Complete");
	console.log(`- Deck: ${title}`);
	console.log(`- Style: ${style}`);
	console.log(`- Location: ${deckDir}`);
	console.log(`- Prompts: ${promptCount}`);
	console.log(`- Images Generated: ${generatedCount}`);
	if (skippedReason) {
		console.log(`- Images Skipped: ${skippedReason}`);
	}
}

async function main(): Promise<void> {
	const options = parseArgs({ argv: process.argv });
	if (options.imagesOnly || options.regenerate) {
		const deckDir = resolve(options.input);
		if (!existsSync(deckDir)) {
			throw new Error(`Deck directory not found: ${deckDir}`);
		}

		const promptFiles = discoverPromptFiles({
			deckDir,
			selectedSlides: options.regenerate,
		});
		const result = await runImageGeneration({
			deckDir,
			promptFiles,
			provider: options.provider,
			model: options.model,
			dryRun: options.dryRun,
		});

		if (result.generated.length > 0 || options.dryRun) {
			mergeOutputs({ deckDir, dryRun: options.dryRun });
		}

		const metadata = readExistingDeckMetadata({ deckDir });
		printSummary({
			deckDir,
			title: metadata.title,
			style: metadata.style,
			promptCount: promptFiles.length,
			generatedCount: result.generated.length,
			skippedReason: result.skipped,
		});
		return;
	}

	const deckPlan = planDeck({ options });
	renderDeckArtifacts({ deckPlan, skipPrompts: options.outlineOnly });

	console.log(`Deck directory: ${deckPlan.deckDir}`);
	console.log(`Outline: ${resolve(deckPlan.deckDir, "outline.md")}`);

	if (options.outlineOnly) {
		console.log("Stopped after outline generation because --outline-only was provided.");
		return;
	}

	console.log(`Prompts: ${deckPlan.promptsDir}`);

	if (options.promptsOnly) {
		console.log("Stopped after prompt generation because --prompts-only was provided.");
		return;
	}

	const promptFiles = discoverPromptFiles({ deckDir: deckPlan.deckDir });
	const imageResult = await runImageGeneration({
		deckDir: deckPlan.deckDir,
		promptFiles,
		provider: options.provider,
		model: options.model,
		dryRun: options.dryRun,
	});

	const hasImages = promptFiles.some((promptFile) =>
		existsSync(imageOutputPath({ deckDir: deckPlan.deckDir, promptFile })),
	);
	if (imageResult.generated.length > 0 || hasImages || options.dryRun) {
		mergeOutputs({ deckDir: deckPlan.deckDir, dryRun: options.dryRun });
	}

	printSummary({
		deckDir: deckPlan.deckDir,
		title: deckPlan.analysis.title,
		style: deckPlan.analysis.style,
		promptCount: promptFiles.length,
		generatedCount: imageResult.generated.length,
		skippedReason: imageResult.skipped,
	});
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
});
