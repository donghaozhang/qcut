import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Framing, Lighting, Movement, ShotMood } from "./types";

function referencePath({ parts }: { parts: string[] }): string {
	return resolve(import.meta.dir, "..", "references", ...parts);
}

function extractDimensionSection({
	file,
	option,
}: {
	file: string;
	option: string;
}): string {
	const path = referencePath({ parts: ["dimensions", `${file}.md`] });
	if (!existsSync(path)) {
		return `${file}: ${option}`;
	}
	const content = readFileSync(path, "utf8");
	const marker = `### ${option}`;
	const start = content.indexOf(marker);
	if (start === -1) {
		return `${file}: ${option}`;
	}
	const rest = content.slice(start + marker.length);
	const next = rest.match(/\n###\s+/);
	const end = next ? start + marker.length + (next.index ?? 0) : content.length;
	return content.slice(start, end).trim();
}

export function loadStyleInstructions({
	style,
	stylePreset,
	framing,
	movement,
	lighting,
	mood,
}: {
	style: string;
	stylePreset?: string;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
}): string {
	if (stylePreset) {
		const presetReference = referencePath({ parts: ["dimensions", "presets.md"] });
		if (existsSync(presetReference)) {
			const presetContent = readFileSync(presetReference, "utf8");
			if (presetContent.includes(`### ${stylePreset}`)) {
				return [
					`# ${stylePreset}`,
					"",
					`Preset shot style built from ${framing} framing, ${movement} movement, ${lighting} lighting, and ${mood} mood.`,
					"",
					"## Framing",
					extractDimensionSection({ file: "framing", option: framing }),
					"",
					"## Movement",
					extractDimensionSection({ file: "movement", option: movement }),
					"",
					"## Lighting",
					extractDimensionSection({ file: "lighting", option: lighting }),
					"",
					"## Mood",
					extractDimensionSection({ file: "mood", option: mood }),
				].join("\n");
			}
		}
	}

	return [
		`# ${style}`,
		"",
		"Custom shot style composed from dimensions.",
		"",
		`- Framing: ${framing}`,
		`- Movement: ${movement}`,
		`- Lighting: ${lighting}`,
		`- Mood: ${mood}`,
		"",
		"## Framing",
		extractDimensionSection({ file: "framing", option: framing }),
		"",
		"## Movement",
		extractDimensionSection({ file: "movement", option: movement }),
		"",
		"## Lighting",
		extractDimensionSection({ file: "lighting", option: lighting }),
		"",
		"## Mood",
		extractDimensionSection({ file: "mood", option: mood }),
	].join("\n");
}

export function loadBasePrompt(): string {
	const path = referencePath({ parts: ["base-prompt.md"] });
	return existsSync(path)
		? readFileSync(path, "utf8").trim()
		: "Render a cinematic storyboard frame with readable composition.";
}
