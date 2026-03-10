import { readFileSync } from "node:fs";
import { generateFalImage, getDefaultFalModel } from "./providers/fal";

function parseArgs({
	argv,
}: {
	argv: Array<string>;
}): {
	promptFile: string;
	outputPath: string;
	model: string;
	aspectRatio: string;
} {
	const args = argv.slice(2);
	let promptFile = "";
	let outputPath = "";
	let model = getDefaultFalModel();
	let aspectRatio = "16:9";

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) {
			continue;
		}
		if (!value.startsWith("-") && !promptFile) {
			promptFile = value;
			continue;
		}
		if (value === "--image") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --image");
			}
			outputPath = next;
			index += 1;
			continue;
		}
		if (value === "--model") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --model");
			}
			model = next;
			index += 1;
			continue;
		}
		if (value === "--ar") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --ar");
			}
			aspectRatio = next;
			index += 1;
		}
	}

	if (!promptFile || !outputPath) {
		throw new Error("Usage: bun image-gen.ts <prompt-file> --image <output.png> [--model <id>] [--ar 16:9]");
	}

	return { promptFile, outputPath, model, aspectRatio };
}

async function main(): Promise<void> {
	const { promptFile, outputPath, model, aspectRatio } = parseArgs({
		argv: process.argv,
	});
	const prompt = readFileSync(promptFile, "utf8");
	const bytes = await generateFalImage({
		prompt,
		model,
		aspectRatio,
	});
	await Bun.write(outputPath, bytes);
	console.log(outputPath);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
});
