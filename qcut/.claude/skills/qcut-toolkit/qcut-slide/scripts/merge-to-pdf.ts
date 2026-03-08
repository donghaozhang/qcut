import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PDFDocument } from "pdf-lib";

interface SlideInfo {
	filename: string;
	path: string;
	index: number;
}

function parseArgs(): { dir: string; output?: string } {
	const args = process.argv.slice(2);
	let dir = "";
	let output: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--output" || value === "-o") {
			output = args[index + 1];
			index += 1;
			continue;
		}
		if (value && !value.startsWith("-")) {
			dir = value;
		}
	}

	if (!dir) {
		throw new Error("Usage: bun merge-to-pdf.ts <slide-deck-dir> [--output filename.pdf]");
	}

	return { dir, output };
}

function findSlideImages({ dir }: { dir: string }): Array<SlideInfo> {
	if (!existsSync(dir)) {
		throw new Error(`Directory not found: ${dir}`);
	}

	const slidePattern = /^(\d+)-slide-.*\.(png|jpg|jpeg)$/i;
	const slides = readdirSync(dir)
		.filter((filename) => slidePattern.test(filename))
		.map((filename) => {
			const match = filename.match(slidePattern);
			return {
				filename,
				path: join(dir, filename),
				index: Number(match?.[1] ?? 0),
			};
		})
		.sort((left, right) => left.index - right.index);

	if (slides.length === 0) {
		throw new Error(`No slide images found in: ${dir}`);
	}

	return slides;
}

async function createPdf({
	slides,
	outputPath,
}: {
	slides: Array<SlideInfo>;
	outputPath: string;
}): Promise<void> {
	const pdf = await PDFDocument.create();
	pdf.setAuthor("qcut-slide");
	pdf.setSubject("Generated Slide Deck");

	for (const slide of slides) {
		const bytes = readFileSync(slide.path);
		const image = slide.filename.toLowerCase().endsWith(".png")
			? await pdf.embedPng(bytes)
			: await pdf.embedJpg(bytes);
		const page = pdf.addPage([image.width, image.height]);
		page.drawImage(image, {
			x: 0,
			y: 0,
			width: image.width,
			height: image.height,
		});
	}

	await Bun.write(outputPath, await pdf.save());
}

async function main(): Promise<void> {
	const { dir, output } = parseArgs();
	const slides = findSlideImages({ dir });
	const outputPath = output || join(dir, `${basename(dir)}.pdf`);
	await createPdf({ slides, outputPath });
	console.log(`Created: ${outputPath}`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
});
