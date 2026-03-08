import type { AnalysisResult, Beat, Framing, ShotPlan, VisualAnchors } from "./types";
import { slugify } from "./utils";

function shotTypeForIndex({
	index,
	total,
}: {
	index: number;
	total: number;
}): ShotPlan["shotType"] {
	if (index === 1) return "opening";
	if (index === total) return "closing";
	if (index % 3 === 0) return "detail";
	if (index % 2 === 0) return "action";
	return "reaction";
}

function framingForShot({
	base,
	type,
}: {
	base: Framing;
	type: ShotPlan["shotType"];
}): Framing {
	if (type === "opening") return "wide";
	if (type === "detail") return base === "wide" ? "close" : "macro";
	if (type === "closing") return base === "macro" ? "medium" : base;
	return base;
}

function buildShotVisual({
	beat,
	type,
}: {
	beat: Beat;
	type: ShotPlan["shotType"];
}): string {
	if (type === "opening") {
		return `Establish the environment and subject around ${beat.title}.`;
	}
	if (type === "detail") {
		return `Focus on a concrete detail tied to ${beat.keywords[0] || beat.title}.`;
	}
	if (type === "closing") {
		return `Land the final emotional image for ${beat.title}.`;
	}
	return `Visualize the active beat in ${beat.title} with clear subject emphasis.`;
}

function shotRoleGuidance({
	shotType,
	anchors,
}: {
	shotType: ShotPlan["shotType"];
	anchors: VisualAnchors;
}): string {
	if (shotType === "opening") {
		return `Open with clear geography. Introduce ${anchors.subjectId} inside ${anchors.locationId} and make the world readable before action details.`;
	}
	if (shotType === "detail") {
		return `Stay tight on a tactile story clue linked to ${anchors.propId}. Preserve the same wardrobe, skin texture, and prop design established earlier.`;
	}
	if (shotType === "closing") {
		return `Deliver payoff by echoing the opening geography, but with escalated emotion and the same ${anchors.subjectId} now clearly transformed by the beat.`;
	}
	if (shotType === "reaction") {
		return `Prioritize subject psychology. Keep the face, posture, and costume language tied to ${anchors.subjectId} rather than inventing a new character.`;
	}
	return `Stage decisive movement inside the established ${anchors.locationId}. Motion should clarify stakes, not replace continuity.`;
}

function continuityNotesForShot({
	shotType,
	anchors,
}: {
	shotType: ShotPlan["shotType"];
	anchors: VisualAnchors;
}): string[] {
	const notes = [
		`Use subject ${anchors.subjectId} consistently.`,
		`Keep location ${anchors.locationId} coherent.`,
		`Reuse prop ${anchors.propId} when visible.`,
	];
	if (shotType === "opening") {
		notes.push("Introduce the anchor palette and architecture clearly.");
	}
	if (shotType === "detail") {
		notes.push("Crop closer without losing continuity of costume, hands, and prop materials.");
	}
	if (shotType === "closing") {
		notes.push("Echo the opening geography so the sequence feels complete.");
	}
	return notes;
}

function negativePromptForShot({
	shotType,
	analysis,
}: {
	shotType: ShotPlan["shotType"];
	analysis: AnalysisResult;
}): string {
	const shared = [
		"no extra hero characters",
		"no wardrobe reset",
		"no unrelated architecture style",
		"no futuristic UI overlays or text",
		"no logo, watermark, or subtitle",
	];
	if (shotType === "detail") {
		shared.push("no random second prop", "no anatomy distortion", "no faceless mannequin hands");
	}
	if (shotType === "opening" || shotType === "closing") {
		shared.push("no cluttered collage composition", "no disconnected background elements");
	}
	if (
		analysis.genreRules.some(
			(rule) =>
				rule.includes("militarized") ||
				rule.includes("luxury fashion-world") ||
				rule.includes("Do not introduce tactical gear"),
		)
	) {
		shared.push("no tactical gear", "no weapons", "no dystopian ruins", "no survival-arena staging");
	}
	return shared.join("; ");
}

export function buildShots({ analysis }: { analysis: AnalysisResult }): ShotPlan[] {
	const shotCount = analysis.targetShots;
	const shots: ShotPlan[] = [];

	for (let index = 0; index < shotCount; index += 1) {
		const shotIndex = index + 1;
		const beat = analysis.beats[index % analysis.beats.length] || {
			title: `Beat ${shotIndex}`,
			body: analysis.coreThroughline,
			keywords: [],
		};
		const shotType = shotTypeForIndex({ index: shotIndex, total: shotCount });
		const stem = slugify({ value: beat.title }).split("-").slice(0, 4).join("-");
		shots.push({
			index: shotIndex,
			title: beat.title,
			fileStem: `${String(shotIndex).padStart(2, "0")}-shot-${stem || `beat-${shotIndex}`}`,
			shotType,
			continuity: {
				subjectId: analysis.visualAnchors.subjectId,
				locationId: analysis.visualAnchors.locationId,
				propId: analysis.visualAnchors.propId,
				continuityNotes: continuityNotesForShot({
					shotType,
					anchors: analysis.visualAnchors,
				}),
			},
			framing: framingForShot({ base: analysis.framing, type: shotType }),
			movement: shotType === "detail" ? "slider" : analysis.movement,
			lighting: analysis.lighting,
			mood: analysis.mood,
			purpose:
				shotType === "opening"
					? "Establish context"
					: shotType === "closing"
						? "Deliver visual payoff"
						: shotType === "detail"
							? "Highlight a specific detail"
							: "Advance the scene beat",
			beat: beat.body,
			visualDirection: buildShotVisual({ beat, type: shotType }),
			shotRoleGuidance: shotRoleGuidance({ shotType, anchors: analysis.visualAnchors }),
			negativePrompt: negativePromptForShot({ shotType, analysis }),
		});
	}

	return shots;
}
