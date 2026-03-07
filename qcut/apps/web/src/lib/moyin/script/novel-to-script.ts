/**
 * NovelParseResult → ScriptData converter.
 *
 * Bridges the novel-parser output format into the existing moyin ScriptData
 * structure so novel imports flow into the same calibration pipeline.
 */

import type {
	ScriptData,
	ScriptCharacter,
	ScriptScene,
	Episode,
	ScriptParagraph,
} from "@/types/moyin-script";
import type { NovelParseResult, ClipScreenplay } from "./novel-parser";
import { normalizeTimeValue } from "./script-parser";

let idCounter = 0;
function nextId(prefix: string): string {
	idCounter += 1;
	return `${prefix}_${idCounter}`;
}

/** Reset the internal ID counter (useful in tests). */
export function resetIdCounter(): void {
	idCounter = 0;
}

/** Convert a NovelParseResult into a ScriptData for the moyin store. */
export function novelResultToScriptData(
	result: NovelParseResult,
	title = "Imported Novel"
): ScriptData {
	resetIdCounter();

	const language =
		result.characters.length > 0
			? detectResultLanguage(result.characters[0].name)
			: "en";

	const characters: ScriptCharacter[] = result.characters.map((c) => ({
		id: nextId("char"),
		name: c.name,
		gender: c.gender,
		age: c.age,
		appearance: c.visualTraits,
		personality: c.introduction,
	}));

	// Build a location+time → ScriptScene map to deduplicate
	const sceneMap = new Map<string, ScriptScene>();
	for (const loc of result.locations) {
		const id = nextId("scene");
		const time = normalizeTimeValue(loc.time);
		const key = `${loc.name}|${time}`;
		sceneMap.set(key, {
			id,
			name: loc.name,
			location: loc.name,
			time,
			atmosphere: loc.atmosphere ?? "",
			notes: loc.description,
		});
	}

	const storyParagraphs: ScriptParagraph[] = [];
	let paragraphId = 0;

	// Process successful screenplays into scenes
	const successScreenplays = result.screenplays.filter(
		(sp): sp is ClipScreenplay & { screenplay: NonNullable<ClipScreenplay["screenplay"]> } =>
			sp.success && sp.screenplay != null
	);

	for (const sp of successScreenplays) {
		for (const scene of sp.screenplay.scenes) {
			// Ensure we have a ScriptScene for this location+time
			const time = normalizeTimeValue(scene.time);
			const sceneKey = scene.location ? `${scene.location}|${time}` : "";
			if (sceneKey && !sceneMap.has(sceneKey)) {
				const id = nextId("scene");
				sceneMap.set(sceneKey, {
					id,
					name: scene.location,
					location: scene.location,
					time,
					atmosphere: "",
				});
			}

			const sceneRef = sceneKey ? sceneMap.get(sceneKey) : undefined;
			const sceneRefId = sceneRef?.id ?? "scene_unknown";

			// Action as a paragraph
			if (scene.action) {
				paragraphId += 1;
				storyParagraphs.push({
					id: paragraphId,
					text: scene.action,
					sceneRefId,
				});
			}

			// Dialogue lines as paragraphs
			for (const d of scene.dialogue) {
				paragraphId += 1;
				const prefix = d.direction
					? `${d.character} (${d.direction})`
					: d.character;
				storyParagraphs.push({
					id: paragraphId,
					text: `${prefix}: ${d.line}`,
					sceneRefId,
				});
			}
		}
	}

	const scenes = [...sceneMap.values()];

	// One episode containing all scenes
	const episode: Episode = {
		id: nextId("ep"),
		index: 0,
		title: title,
		sceneIds: scenes.map((s) => s.id),
	};

	return {
		title,
		language,
		characters,
		scenes,
		episodes: [episode],
		storyParagraphs,
	};
}

/** Simple language detection from a character name. */
function detectResultLanguage(name: string): string {
	const chineseChars = (name.match(/[\u4e00-\u9fff]/g) || []).length;
	return chineseChars > 0 ? "zh" : "en";
}
