import type { Scene, SceneBreakdown } from "./types";
import { slugify } from "./utils";

export function validateBreakdown({ breakdown }: { breakdown: SceneBreakdown }): SceneBreakdown {
	const characterIds = new Set(breakdown.characters.map((c) => c.id));

	const scenes: Scene[] = breakdown.scenes.map((scene, index) => {
		const sceneIndex = scene.index || index + 1;
		const stem = slugify({ value: scene.title }).split("-").slice(0, 5).join("-");
		const fileStem =
			scene.fileStem ||
			`${String(sceneIndex).padStart(2, "0")}-${stem || `scene-${sceneIndex}`}`;

		const validCharacterIds = scene.characterIds.filter((id) => characterIds.has(id));
		if (validCharacterIds.length === 0 && breakdown.characters.length > 0) {
			validCharacterIds.push(breakdown.characters[0].id);
		}

		return {
			index: sceneIndex,
			title: scene.title || `Scene ${sceneIndex}`,
			fileStem,
			camera: scene.camera || { lens: "35mm", framing: "medium shot", movement: "locked-off", angle: "eye level" },
			lighting: scene.lighting || "natural ambient lighting",
			location: scene.location || "unspecified location",
			action: scene.action || scene.title || "Scene action",
			characterIds: validCharacterIds,
			mood: scene.mood || "neutral",
			props: Array.isArray(scene.props) ? scene.props : [],
			colorPalette: scene.colorPalette || "neutral tones",
			negative: scene.negative || "no text, no watermark, no collage, no UI overlay",
		};
	});

	return {
		characters: breakdown.characters,
		continuityNotes: breakdown.continuityNotes,
		scenes,
	};
}
