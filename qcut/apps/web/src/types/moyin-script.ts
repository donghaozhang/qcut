/**
 * Moyin Script Types — ported from moyin-creator
 *
 * Core data model for screenplay parsing, character management,
 * and shot composition. Camera/lighting types are used by
 * cinematography profiles and director presets.
 */

// ==================== Character Types ====================

/**
 * 6-layer character identity anchor system.
 * Ensures AI-generated images maintain character consistency across scenes.
 */
export interface CharacterIdentityAnchors {
	// Layer 1: Bone structure
	faceShape?: string;
	jawline?: string;
	cheekbones?: string;

	// Layer 2: Facial features
	eyeShape?: string;
	eyeDetails?: string;
	noseShape?: string;
	lipShape?: string;

	// Layer 3: Identifying marks (strongest anchor)
	uniqueMarks: string[];

	// Layer 4: Color anchors (hex values)
	colorAnchors?: {
		iris?: string;
		hair?: string;
		skin?: string;
		lips?: string;
	};

	// Layer 5: Skin texture
	skinTexture?: string;

	// Layer 6: Hair details
	hairStyle?: string;
	hairlineDetails?: string;
}

export interface CharacterNegativePrompt {
	avoid: string[];
	styleExclusions?: string[];
}

export interface ScriptCharacter {
	id: string;
	name: string;
	gender?: string;
	age?: string;
	personality?: string;
	role?: string;
	traits?: string;
	skills?: string;
	keyActions?: string;
	appearance?: string;
	relationships?: string;
	tags?: string[];
	notes?: string;

	// Visual prompts for AI image generation
	visualPromptEn?: string;
	visualPromptZh?: string;

	// Reference images for generation consistency
	referenceImages?: string[];

	// 6-layer identity anchors (filled during AI calibration)
	identityAnchors?: CharacterIdentityAnchors;
	negativePrompt?: CharacterNegativePrompt;

	// Wardrobe / stage variations
	variations?: CharacterVariation[];
}

// ==================== Scene Types ====================

export interface ScriptScene {
	id: string;
	name?: string;
	location: string;
	time: string;
	atmosphere: string;
	visualPrompt?: string;
	tags?: string[];
	notes?: string;

	// Professional scene design fields (filled during AI calibration)
	visualPromptEn?: string;
	architectureStyle?: string;
	lightingDesign?: string;
	colorPalette?: string;
	keyProps?: string[];
	spatialLayout?: string;
	eraDetails?: string;

	// Appearance statistics
	episodeNumbers?: number[];
	appearanceCount?: number;
	importance?: "main" | "secondary" | "transition";
}

// ==================== Script Data ====================

export interface ScriptParagraph {
	id: number;
	text: string;
	sceneRefId: string;
}

export interface DialogueLine {
	character: string;
	parenthetical?: string;
	line: string;
}

export interface Episode {
	id: string;
	index: number;
	title: string;
	description?: string;
	sceneIds: string[];
}

export interface ScriptData {
	title: string;
	genre?: string;
	logline?: string;
	language: string;
	targetDuration?: string;
	characters: ScriptCharacter[];
	scenes: ScriptScene[];
	episodes: Episode[];
	storyParagraphs: ScriptParagraph[];
}

// ==================== Camera & Lighting Types ====================

export type LightingStyle =
	| "high-key"
	| "low-key"
	| "silhouette"
	| "chiaroscuro"
	| "natural"
	| "neon"
	| "candlelight"
	| "moonlight";

export type LightingDirection =
	| "front"
	| "side"
	| "back"
	| "top"
	| "bottom"
	| "rim"
	| "three-point";

export type ColorTemperature =
	| "warm"
	| "neutral"
	| "cool"
	| "golden-hour"
	| "blue-hour"
	| "mixed";

export type DepthOfField =
	| "ultra-shallow"
	| "shallow"
	| "medium"
	| "deep"
	| "split-diopter";

export type FocusTransition =
	| "rack-to-fg"
	| "rack-to-bg"
	| "rack-between"
	| "pull-focus"
	| "none";

export type CameraRig =
	| "tripod"
	| "handheld"
	| "steadicam"
	| "dolly"
	| "crane"
	| "drone"
	| "shoulder"
	| "slider";

export type MovementSpeed =
	| "very-slow"
	| "slow"
	| "normal"
	| "fast"
	| "very-fast";

export type AtmosphericEffect =
	| "rain"
	| "heavy-rain"
	| "snow"
	| "blizzard"
	| "fog"
	| "mist"
	| "dust"
	| "sandstorm"
	| "smoke"
	| "haze"
	| "fire"
	| "sparks"
	| "lens-flare"
	| "vortex"
	| "shockwave"
	| "cube"
	| "light-rays"
	| "falling-leaves"
	| "cherry-blossom"
	| "fireflies"
	| "particles";

export type EffectIntensity = "subtle" | "moderate" | "heavy";

export type PlaybackSpeed =
	| "slow-motion-4x"
	| "slow-motion-2x"
	| "normal"
	| "fast-2x"
	| "timelapse";

export type CameraAngle =
	| "eye-level"
	| "high-angle"
	| "low-angle"
	| "birds-eye"
	| "worms-eye"
	| "over-shoulder"
	| "side-angle"
	| "dutch-angle"
	| "third-person";

export type FocalLength =
	| "8mm"
	| "14mm"
	| "24mm"
	| "35mm"
	| "50mm"
	| "85mm"
	| "105mm"
	| "135mm"
	| "200mm"
	| "400mm";

export type PhotographyTechnique =
	| "long-exposure"
	| "double-exposure"
	| "macro"
	| "tilt-shift"
	| "high-speed"
	| "bokeh"
	| "reflection"
	| "silhouette-technique";

// ==================== Shot Type ====================

export type ShotStatus = "idle" | "generating" | "completed" | "failed";

export interface Shot {
	id: string;
	index: number;
	sceneRefId: string;

	// Core shot info
	actionSummary: string;
	visualDescription?: string;

	// Camera language
	cameraMovement?: string;
	specialTechnique?: string;
	shotSize?: string;
	duration?: number;

	// Visual prompts
	visualPrompt?: string;

	// Three-layer prompt system (Seedance 1.5 Pro)
	imagePrompt?: string;
	imagePromptZh?: string;
	videoPrompt?: string;
	videoPromptZh?: string;
	endFramePrompt?: string;
	endFramePromptZh?: string;
	needsEndFrame?: boolean;

	// Audio design
	dialogue?: string;
	ambientSound?: string;
	soundEffect?: string;
	bgm?: string;
	audioEnabled?: boolean;

	// Character info
	characterNames?: string[];
	characterIds: string[];
	characterVariations: Record<string, string>;

	// Emotion tags
	emotionTags?: string[];

	// Narrative fields (based on Grammar of Film Language)
	narrativeFunction?: string;
	shotPurpose?: string;
	visualFocus?: string;
	cameraPosition?: string;
	characterBlocking?: string;
	rhythm?: string;

	// Gaffer (lighting)
	lightingStyle?: LightingStyle;
	lightingDirection?: LightingDirection;
	colorTemperature?: ColorTemperature;
	lightingNotes?: string;

	// Focus puller
	depthOfField?: DepthOfField;
	focusTarget?: string;
	focusTransition?: FocusTransition;

	// Camera rig
	cameraRig?: CameraRig;
	movementSpeed?: MovementSpeed;

	// On-set SFX
	atmosphericEffects?: AtmosphericEffect[];
	effectIntensity?: EffectIntensity;

	// Speed ramping
	playbackSpeed?: PlaybackSpeed;

	// Angle / focal length / technique
	cameraAngle?: CameraAngle;
	focalLength?: FocalLength;
	photographyTechnique?: PhotographyTechnique;

	// Generation status
	imageStatus: ShotStatus;
	imageProgress: number;
	imageError?: string;
	imageUrl?: string;
	imageMediaId?: string;

	videoStatus: ShotStatus;
	videoProgress: number;
	videoError?: string;
	videoUrl?: string;
	videoMediaId?: string;

	// End frame image
	endFrameImageUrl?: string;
	endFrameImageStatus?: ShotStatus;
	endFrameImageError?: string;
	endFrameSource?: "upload" | "ai-generated" | "next-scene" | "video-extracted";
}

// ==================== Episode Parser Types ====================

/**
 * Raw content of a single scene parsed from screenplay text.
 * Used by episode-parser.ts for rule-based Chinese screenplay parsing.
 */
export interface SceneRawContent {
	sceneHeader: string;
	characters: string[];
	content: string;
	dialogues: DialogueLine[];
	actions: string[];
	subtitles: string[];
	weather?: string;
	timeOfDay?: string;
}

/**
 * Raw episode data from screenplay parsing.
 * Contains the original text and parsed scenes before AI processing.
 */
export interface EpisodeRawScript {
	episodeIndex: number;
	title: string;
	rawContent: string;
	scenes: SceneRawContent[];
	shotGenerationStatus: "idle" | "generating" | "done" | "error";
	season?: string;
}

/**
 * Project background / metadata extracted from screenplay header.
 * Contains title, outline, character bios, and era/timeline info.
 */
export interface ProjectBackground {
	title: string;
	outline: string;
	characterBios: string;
	era: string;
	timelineSetting?: string;
	storyStartYear?: number;
	storyEndYear?: number;
	genre?: string;
	worldSetting?: string;
	themes?: string[];
}

/**
 * Character variation data for multi-stage character representations.
 * E.g., young version vs. middle-aged version of the same character.
 */
export interface CharacterVariation {
	id: string;
	name: string;
	visualPrompt: string;
	visualPromptZh?: string;
	isStageVariation?: boolean;
	episodeRange?: [number, number];
	ageDescription?: string;
	stageDescription?: string;
	imageUrl?: string;
}
