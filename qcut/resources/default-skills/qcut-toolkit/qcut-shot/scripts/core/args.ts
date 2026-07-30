import { VALID_FORMATS, VALID_FRAMINGS, VALID_LIGHTINGS, VALID_MEDIA, VALID_MOODS, VALID_MOVEMENTS } from "./constants";
import type {
	CLIOptions,
	ContentFormat,
	Framing,
	Lighting,
	Medium,
	Movement,
	PromoTextAnimationPreset,
	ShotMood,
} from "./types";
import { parseNumberList } from "./utils";

function parseEnum({
	value,
	valid,
	flag,
}: {
	value?: string;
	valid: readonly string[];
	flag: string;
}): string {
	if (!value?.trim()) {
		throw new Error(`Missing value for ${flag}`);
	}
	if (!valid.includes(value as (typeof valid)[number])) {
		throw new Error(`Invalid value for ${flag}: ${value}`);
	}
	return value;
}

function parsePromoPresets({
	value,
}: {
	value?: string;
}): PromoTextAnimationPreset[] {
	if (!value?.trim()) {
		throw new Error("Missing value for --promo-presets");
	}
	return value.split(",").map((entry) => {
		const [phase, presetId] = entry.split(":", 2).map((part) => part.trim());
		if (
			phase !== "entrance" &&
			phase !== "exit" &&
			phase !== "loop"
		) {
			throw new Error(`Invalid promo preset phase: ${phase}`);
		}
		if (!presetId) {
			throw new Error(`Promo preset is missing an ID: ${entry}`);
		}
		return { phase, presetId };
	});
}

/** Parses CLI arguments into structured options. */
export function parseArgs({ argv }: { argv: string[] }): CLIOptions {
	const args = argv.slice(2);
	let input = "";
	let style: string | undefined;
	let medium: Medium | undefined;
	let format: ContentFormat | undefined;
	let framing: Framing | undefined;
	let movement: Movement | undefined;
	let lighting: Lighting | undefined;
	let mood: ShotMood | undefined;
	let lang: string | undefined;
	let shots: number | undefined;
	let promptsOnly = false;
	let imagesOnly = false;
	let regenerate: number[] | undefined;
	let outputDir: string | undefined;
	let projectId: string | undefined;
	let provider: string | undefined;
	let model: string | undefined;
	let dryRun = false;
	let promo = false;
	let shotDuration = 3;
	let promoPresets: PromoTextAnimationPreset[] | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) continue;
		if (!value.startsWith("-")) {
			input = value;
			continue;
		}

		if (value === "--style") {
			style = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--medium") {
			medium = parseEnum({ value: args[index + 1], valid: VALID_MEDIA, flag: "--medium" }) as Medium;
			index += 1;
			continue;
		}
		if (value === "--format") {
			format = parseEnum({ value: args[index + 1], valid: VALID_FORMATS, flag: "--format" }) as ContentFormat;
			index += 1;
			continue;
		}
		if (value === "--framing") {
			framing = parseEnum({ value: args[index + 1], valid: VALID_FRAMINGS, flag: "--framing" }) as Framing;
			index += 1;
			continue;
		}
		if (value === "--movement") {
			movement = parseEnum({ value: args[index + 1], valid: VALID_MOVEMENTS, flag: "--movement" }) as Movement;
			index += 1;
			continue;
		}
		if (value === "--lighting") {
			lighting = parseEnum({ value: args[index + 1], valid: VALID_LIGHTINGS, flag: "--lighting" }) as Lighting;
			index += 1;
			continue;
		}
		if (value === "--mood") {
			mood = parseEnum({ value: args[index + 1], valid: VALID_MOODS, flag: "--mood" }) as ShotMood;
			index += 1;
			continue;
		}
		if (value === "--lang") {
			lang = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--shots") {
			const parsed = Number(args[index + 1]);
			if (Number.isFinite(parsed)) {
				shots = parsed;
			}
			index += 1;
			continue;
		}
		if (value === "--prompts-only") {
			promptsOnly = true;
			continue;
		}
		if (value === "--images-only") {
			imagesOnly = true;
			continue;
		}
		if (value === "--regenerate") {
			regenerate = parseNumberList({ value: args[index + 1] });
			index += 1;
			continue;
		}
		if (value === "--output-dir") {
			outputDir = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--project-id") {
			projectId = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--provider") {
			provider = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--model") {
			model = args[index + 1];
			index += 1;
			continue;
		}
		if (value === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (value === "--promo") {
			promo = true;
			continue;
		}
		if (value === "--shot-duration") {
			const parsed = Number(args[index + 1]);
			if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
				throw new Error("--shot-duration must be between 1 and 30 seconds");
			}
			shotDuration = parsed;
			index += 1;
			continue;
		}
		if (value === "--promo-presets") {
			promoPresets = parsePromoPresets({ value: args[index + 1] });
			index += 1;
		}
	}

	if (!input) {
		throw new Error("Usage: bun main.ts <content-file|shot-dir> [options]");
	}

	return {
		input,
		style,
		medium,
		format,
		framing,
		movement,
		lighting,
		mood,
		lang,
		shots,
		promptsOnly,
		imagesOnly,
		regenerate,
		outputDir,
		projectId,
		provider,
		model,
		dryRun,
		promo,
		shotDuration,
		promoPresets,
	};
}
