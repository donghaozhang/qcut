import type { Scene, SceneBreakdown } from "./types";
import { slugify } from "./utils";

export function validateBreakdown({ breakdown }: { breakdown: SceneBreakdown }): SceneBreakdown {
	const characterIds = new Set(breakdown.characters.map((c) => c.id));

	const scenes: Scene[] = breakdown.scenes.map((scene, index) => {
		const sceneIndex = scene.index || index + 1;
		const title = scene.title || `Scene ${sceneIndex}`;
		const stem = slugify({ value: title }).split("-").slice(0, 5).join("-");
		const fileStem =
			scene.fileStem ||
			`${String(sceneIndex).padStart(2, "0")}-${stem || `scene-${sceneIndex}`}`;

		const sceneCharacterIds = Array.isArray(scene.characterIds) ? scene.characterIds : [];
		const validCharacterIds = sceneCharacterIds.filter((id) => characterIds.has(id));
		if (validCharacterIds.length === 0 && breakdown.characters.length > 0) {
			console.warn(`Warning: Scene ${sceneIndex} ("${title}") has no valid characters, defaulting to "${breakdown.characters[0].id}".`);
			validCharacterIds.push(breakdown.characters[0].id);
		}

		return {
			index: sceneIndex,
			title,
			fileStem,
			camera: {
				lens: scene.camera?.lens || "35mm",
				framing: scene.camera?.framing || "medium shot",
				movement: scene.camera?.movement || "locked-off",
				angle: scene.camera?.angle || "eye level",
			},
			lighting: scene.lighting || "natural ambient lighting",
			location: scene.location || "unspecified location",
			action: scene.action || title || "Scene action",
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
