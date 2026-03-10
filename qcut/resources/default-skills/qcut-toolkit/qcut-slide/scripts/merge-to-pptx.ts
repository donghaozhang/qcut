import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import PptxGenJS from "pptxgenjs";

interface SlideInfo {
	filename: string;
	path: string;
	index: number;
	promptPath?: string;
}

function parseArgs(): { dir: string; output?: string } {
	const args = process.argv.slice(2);
	let dir = "";
	let output: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--output" || value === "-o") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --output");
			}
			output = next;
			index += 1;
			continue;
		}
		if (value && !value.startsWith("-")) {
			dir = value;
		}
	}

	if (!dir) {
		throw new Error("Usage: bun merge-to-pptx.ts <slide-deck-dir> [--output filename.pptx]");
	}

	return { dir, output };
}

function findSlideImages({ dir }: { dir: string }): Array<SlideInfo> {
	if (!existsSync(dir)) {
		throw new Error(`Directory not found: ${dir}`);
	}

	const slidePattern = /^(\d+)-slide-.*\.(png|jpg|jpeg)$/i;
	const promptsDir = join(dir, "prompts");
	const hasPrompts = existsSync(promptsDir);

	const slides = readdirSync(dir)
		.filter((filename) => slidePattern.test(filename))
		.map((filename) => {
			const match = filename.match(slidePattern);
			const baseName = filename.replace(/\.(png|jpg|jpeg)$/i, "");
			const promptPath = hasPrompts ? join(promptsDir, `${baseName}.md`) : undefined;
			return {
				filename,
				path: join(dir, filename),
				index: Number(match?.[1] ?? 0),
				promptPath: promptPath && existsSync(promptPath) ? promptPath : undefined,
			};
		})
		.sort((left, right) => left.index - right.index);

	if (slides.length === 0) {
		throw new Error(`No slide images found in: ${dir}`);
	}

	return slides;
}

async function createPptx({
	slides,
	outputPath,
}: {
	slides: Array<SlideInfo>;
	outputPath: string;
}): Promise<void> {
	const pptx = new PptxGenJS();
	pptx.layout = "LAYOUT_16x9";
	pptx.author = "qcut-slide";
	pptx.subject = "Generated Slide Deck";

	for (const slide of slides) {
		const presentationSlide = pptx.addSlide();
		const imageBuffer = readFileSync(slide.path);
		const imageData = imageBuffer.toString("base64");
		const mimeType = detectMimeType({ bytes: imageBuffer });

		presentationSlide.addImage({
			data: `data:${mimeType};base64,${imageData}`,
			x: 0,
			y: 0,
			w: "100%",
			h: "100%",
			sizing: { type: "cover", w: "100%", h: "100%" },
		});

		if (slide.promptPath) {
			presentationSlide.addNotes(readFileSync(slide.promptPath, "utf8"));
		}
	}

	await pptx.writeFile({ fileName: outputPath });
}

function detectMimeType({ bytes }: { bytes: Uint8Array }): "image/png" | "image/jpeg" {
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return "image/png";
	}

	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		return "image/jpeg";
	}

	throw new Error("Unsupported image format. Expected PNG or JPEG bytes.");
}

async function main(): Promise<void> {
	const { dir, output } = parseArgs();
	const slides = findSlideImages({ dir });
	const outputPath = output || join(dir, `${basename(dir)}.pptx`);
	await createPptx({ slides, outputPath });
	console.log(`Created: ${outputPath}`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
});
