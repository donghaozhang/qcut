import { basename, join } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { generateFalImage, getDefaultFalModel, hasFalCredentials } from "./providers/fal";

export function discoverPromptFiles({
	shotDir,
	selectedShots,
}: {
	shotDir: string;
	selectedShots?: number[];
}): string[] {
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
	promptFiles: string[];
	provider?: string;
	model?: string;
	dryRun: boolean;
}): Promise<{ generated: string[]; skipped: string | null }> {
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

	const generated: string[] = [];
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
