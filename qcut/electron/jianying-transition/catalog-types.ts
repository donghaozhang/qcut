export type JianyingTransitionGroup =
	| "ai-one-take"
	| "dissolve"
	| "split"
	| "glitch"
	| "light"
	| "emoji"
	| "slideshow"
	| "blur"
	| "distortion"
	| "shooting"
	| "camera"
	| "natural"
	| "variety"
	| "mg";

export type JianyingTransitionRuntimeKind =
	| "ai-generation"
	| "transition-segment";

export type JianyingTransitionAccess = "free" | "vip";

export interface JianyingTransitionPreview {
	type:
		| "dissolve"
		| "fade"
		| "slide"
		| "wipe"
		| "push"
		| "zoom"
		| "whip"
		| "flash"
		| "light"
		| "glitch"
		| "shake"
		| "motion-blur"
		| "pixel"
		| "ripple"
		| "particle"
		| "glass"
		| "page"
		| "texture"
		| "flare";
	clipType:
		| "dissolve"
		| "fade-white"
		| "slide"
		| "wipe"
		| "zoom-blur"
		| "zoom-in-blur"
		| "flash"
		| "rgb-glitch"
		| "shake"
		| "glass-refraction"
		| "page-flip"
		| "texture-mask"
		| "vortex";
	direction?: "left" | "right" | "up" | "down";
	maskShape?: "blinds" | "heart" | "ink" | "fog" | "triptych";
	tuning?: {
		intensity?: number;
		frequency?: number;
		tint?: string;
	};
}

export interface JianyingTransitionDefinition {
	id: string;
	name: string;
	localizedName: string;
	resourceId: string;
	metadataMd5: string;
	defaultDuration: number;
	overlap: boolean;
	group: JianyingTransitionGroup;
	sourceGroup: JianyingTransitionGroup;
	family: string;
	runtimeKind: JianyingTransitionRuntimeKind;
	access: JianyingTransitionAccess;
	preview: JianyingTransitionPreview;
}

export interface JianyingTransitionSource {
	localizedName: string;
	resourceId: string;
	metadataMd5: string;
	defaultDuration: number;
	overlap: boolean;
	access: JianyingTransitionAccess;
	sourceGroup?: JianyingTransitionGroup;
}

export type JianyingTransitionOverride = Partial<
	Pick<JianyingTransitionDefinition, "family" | "id" | "name" | "preview">
>;
