/**
 * Character data models for ViMax pipeline.
 *
 * Handles character information at different levels:
 * - CharacterBase: Common fields
 * - CharacterInNovel: Full character from novel
 * - CharacterInScene: Character appearance in a scene
 * - CharacterPortrait: Generated multi-angle portrait
 * - CharacterPortraitRegistry: Registry for storing/retrieving portraits
 *
 * Ported from: vimax/interfaces/character.py
 */

export interface CharacterBase {
	name: string;
	description: string;
}

export interface CharacterInNovel extends CharacterBase {
	age?: string;
	gender?: string;
	appearance: string;
	personality: string;
	role: string;
	relationships: string[];
	/** Pre-generated image prompt for portrait generation (avoids extra LLM call). */
	portrait_prompt?: string;
}

export interface CharacterInScene extends CharacterBase {
	scene_id?: string;
	position?: string;
	action: string;
	emotion: string;
	dialogue?: string;
}

export interface CharacterInEvent extends CharacterBase {
	event_id?: string;
	involvement: string;
	importance: number;
}

export interface CharacterPortrait {
	character_name: string;
	description: string;
	front_view?: string;
	side_view?: string;
	back_view?: string;
	three_quarter_view?: string;
}

// -- CharacterPortrait helpers --

export function getPortraitViews(
	portrait: CharacterPortrait
): Record<string, string> {
	const views: Record<string, string> = {};
	if (portrait.front_view) views.front = portrait.front_view;
	if (portrait.side_view) views.side = portrait.side_view;
	if (portrait.back_view) views.back = portrait.back_view;
	if (portrait.three_quarter_view)
		views.three_quarter = portrait.three_quarter_view;
	return views;
}

export function hasPortraitViews(portrait: CharacterPortrait): boolean {
	return Object.keys(getPortraitViews(portrait)).length > 0;
}

// -- Camera angle → portrait view mapping --

const ANGLE_TO_VIEW: Record<string, string> = {
	front: "front",
	eye_level: "front",
	straight_on: "front",
	side: "side",
	profile: "side",
	left: "side",
	right: "side",
	back: "back",
	behind: "back",
	three_quarter: "three_quarter",
	"45_degree": "three_quarter",
};

/**
 * Registry of all character portraits for a project.
 *
 * Stores and indexes character portraits for easy retrieval
 * during storyboard generation.
 */
export class CharacterPortraitRegistry {
	project_id: string;
	portraits: Map<string, CharacterPortrait>;

	constructor(project_id: string, portraits?: Map<string, CharacterPortrait>) {
		this.project_id = project_id;
		this.portraits = portraits ?? new Map();
	}

	addPortrait(portrait: CharacterPortrait): void {
		this.portraits.set(portrait.character_name, portrait);
	}

	getPortrait(name: string): CharacterPortrait | undefined {
		return this.portraits.get(name);
	}

	getBestView(name: string, cameraAngle: string): string | undefined {
		const portrait = this.getPortrait(name);
		if (!portrait) return;

		const preferredView = ANGLE_TO_VIEW[cameraAngle.toLowerCase()] ?? "front";
		const views = getPortraitViews(portrait);

		// Try preferred view first
		if (preferredView in views) return views[preferredView];
		// Fall back to front view
		if ("front" in views) return views.front;
		// Last resort: any available view
		const values = Object.values(views);
		return values.length > 0 ? values[0] : undefined;
	}

	listCharacters(): string[] {
		return [...this.portraits.keys()];
	}

	hasCharacter(name: string): boolean {
		return this.portraits.has(name);
	}

	toJSON(): Record<string, unknown> {
		const portraitsObj: Record<string, CharacterPortrait> = {};
		for (const [name, portrait] of this.portraits) {
			portraitsObj[name] = portrait;
		}
		return {
			project_id: this.project_id,
			portraits: portraitsObj,
		};
	}

	static fromJSON(data: Record<string, unknown>): CharacterPortraitRegistry {
		const projectId = data.project_id as string;
		if (!projectId) throw new Error("Registry data must contain 'project_id'");

		const portraitsData = (data.portraits ?? {}) as Record<
			string,
			CharacterPortrait
		>;
		const portraits = new Map<string, CharacterPortrait>();
		for (const [name, portrait] of Object.entries(portraitsData)) {
			portraits.set(name, portrait);
		}
		return new CharacterPortraitRegistry(projectId, portraits);
	}
}

// -- Factory helpers --

export function createCharacterInNovel(
	partial: Partial<CharacterInNovel> & { name: string }
): CharacterInNovel {
	return {
		description: "",
		appearance: "",
		personality: "",
		role: "",
		relationships: [],
		...partial,
	};
}

export function createCharacterPortrait(
	partial: Partial<CharacterPortrait> & { character_name: string }
): CharacterPortrait {
	return {
		description: "",
		...partial,
	};
}
