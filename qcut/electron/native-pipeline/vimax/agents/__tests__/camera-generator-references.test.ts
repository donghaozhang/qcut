import { describe, expect, it } from "vitest";

import { collectVideoReferenceImages } from "../camera-generator.js";
import {
	CharacterPortraitRegistry,
	createCharacterPortrait,
} from "../../types/character.js";
import { createShotDescription } from "../../types/shot.js";

describe("collectVideoReferenceImages", () => {
	it("combines shot, registry, and explicit references without duplicates", () => {
		const registry = new CharacterPortraitRegistry("project-1");
		registry.addPortrait(
			createCharacterPortrait({
				character_name: "Mara",
				front_view: "/tmp/portraits/mara-front.png",
				side_view: "/tmp/portraits/mara-side.png",
			})
		);
		registry.addPortrait(
			createCharacterPortrait({
				character_name: "Jon",
				front_view: "/tmp/portraits/jon-front.png",
			})
		);
		const shot = createShotDescription({
			shot_id: "s1",
			description: "Mara and Jon study a map",
			camera_angle: "front",
			characters: ["Mara", "Jon"],
			character_references: {
				Mara: "/tmp/portraits/mara-front.png",
				Jon: "/tmp/portraits/jon-front.png",
			},
			primary_reference_image: "/tmp/portraits/mara-front.png",
		});

		const references = collectVideoReferenceImages({
			shot,
			portraitRegistry: registry,
			extraReferenceImages: [
				"/tmp/style/reference.png",
				"/tmp/portraits/jon-front.png",
			],
			maxReferences: 3,
		});

		expect(references).toEqual([
			"/tmp/portraits/mara-front.png",
			"/tmp/portraits/jon-front.png",
			"/tmp/style/reference.png",
		]);
	});
});
