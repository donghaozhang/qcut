export const TEXT_ANIMATION_SCHEMA_VERSION = 1 as const;

export type TextAnimationUnit = "all" | "word" | "grapheme";

export type TextAnimationOrder =
	| "forward"
	| "reverse"
	| "centerOut"
	| "outsideIn"
	| "random";

export type TextAnimationTarget = "text" | "textAndBackground";

export type TextAnimationDirection = "left" | "right" | "up" | "down";

export interface TextAnimationDistance {
	value: number;
	unit: "px" | "em" | "boxWidth" | "boxHeight";
}

export type TextAnimationEasing =
	| "linear"
	| "easeIn"
	| "easeOut"
	| "easeInOut"
	| {
			type: "cubicBezier";
			x1: number;
			y1: number;
			x2: number;
			y2: number;
	  }
	| {
			type: "spring";
			mass: number;
			stiffness: number;
			damping: number;
			velocity: number;
	  };

export interface TextAnimationTiming {
	/** Total phase duration, including staggered unit starts. */
	duration: number;
	delay: number;
	easing: TextAnimationEasing;
}

export interface TextAnimationSequence {
	unit: TextAnimationUnit;
	order: TextAnimationOrder;
	/** Portion of the phase reserved for staggered starts, from 0 through 0.95. */
	staggerRatio: number;
	seed: number;
	locale?: string;
}

export interface TextAnimationPresetRef {
	id: string;
	version: number;
}

export interface TextTypewriterEffect {
	kind: "typewriter";
	reveal: "step" | "fade" | "wipe";
	/**
	 * Optional per-unit slot weights, cycled over the unit ranks. Jianying's
	 * human-rhythm typewriter uses an irregular fixed table so typing speeds
	 * up and pauses instead of ticking uniformly.
	 */
	rhythm?: readonly number[];
	cursor?: {
		text: string;
		color?: string;
		blinkPeriod: number;
		persist: boolean;
	};
}

export interface TextFadeEffect {
	kind: "fade";
	minimumOpacity: number;
}

export interface TextSlideEffect {
	kind: "slide";
	direction: TextAnimationDirection;
	distance: TextAnimationDistance;
	fade: boolean;
}

export interface TextBlurEffect {
	kind: "blur";
	direction?: TextAnimationDirection;
	distance?: TextAnimationDistance;
	radiusPx: number;
	fade: boolean;
}

export interface TextRotateEffect {
	kind: "rotate";
	degrees: number;
	travelDirection?: TextAnimationDirection;
	distance?: TextAnimationDistance;
	fade: boolean;
	oscillation?: {
		cycles: number;
		phaseEasing: "linear" | "smoothstep";
		pivot: "center" | "bottomCenter";
	};
}

export interface TextScaleEffect {
	kind: "scale";
	hiddenScale: number;
	overshoot: number;
	fade: boolean;
	/** Scale axis; Jianying's 翻动 flip-open scales X only. Defaults to uniform. */
	axis?: "uniform" | "x" | "y";
	pulse?: {
		cycles: number;
		easing: "linear" | "smoothstep";
	};
}

export interface TextBounceEffect {
	kind: "bounce";
	direction: TextAnimationDirection;
	distance: TextAnimationDistance;
	hiddenScale: number;
	spring: {
		mass: number;
		stiffness: number;
		damping: number;
		velocity: number;
	};
	spatialWave?: {
		spatialCycles: number;
		phaseOffset: number;
	};
}

export interface TextOrbitEffect {
	kind: "orbit";
	rotation: "clockwise" | "counterclockwise";
	turns: number;
	radius: TextAnimationDistance;
	fade: boolean;
}

export interface TextLaserEffect {
	kind: "laser";
	direction: TextAnimationDirection;
	color: string;
	thicknessPx: number;
	glowPx: number;
	trail: number;
	fade: boolean;
}

export interface TextHeartEffect {
	kind: "heart";
	direction: TextAnimationDirection;
	distance: TextAnimationDistance;
	hiddenScale: number;
	color: string;
	particleCount: number;
	spread: number;
	seed: number;
}

export type TextAnimationEffect =
	| TextTypewriterEffect
	| TextFadeEffect
	| TextSlideEffect
	| TextBlurEffect
	| TextRotateEffect
	| TextScaleEffect
	| TextBounceEffect
	| TextOrbitEffect
	| TextLaserEffect
	| TextHeartEffect;

export interface TextAnimationPhaseBase {
	sourcePreset?: TextAnimationPresetRef;
	timing: TextAnimationTiming;
	sequence: TextAnimationSequence;
	target: TextAnimationTarget;
	effect: TextAnimationEffect;
}

export type TextAnimationEdgePhase = TextAnimationPhaseBase;

export interface TextAnimationLoopPhase extends TextAnimationPhaseBase {
	repeat: {
		mode: "restart" | "alternate";
		count?: number;
		gap: number;
		phaseOffset: number;
	};
}

export interface TextAnimationsV1 {
	schemaVersion: typeof TEXT_ANIMATION_SCHEMA_VERSION;
	entrance?: TextAnimationEdgePhase;
	exit?: TextAnimationEdgePhase;
	loop?: TextAnimationLoopPhase;
}

export type TextAnimations = TextAnimationsV1;

export interface TextAnimationRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface TextAnimationGraphemeLayout {
	index: number;
	start: number;
	end: number;
	lineIndex: number;
	bounds: TextAnimationRect;
}

export interface TextAnimationLayout {
	bounds: TextAnimationRect;
	graphemes: TextAnimationGraphemeLayout[];
	fontSize: number;
}

export interface TextAnimationMaskState {
	direction: TextAnimationDirection;
	progress: number;
	featherPx: number;
}

export interface TextAnimationVisualState {
	opacity: number;
	translateX: number;
	translateY: number;
	scaleX: number;
	scaleY: number;
	rotationDeg: number;
	blurPx: number;
	mask?: TextAnimationMaskState;
	transformOrigin?: "center" | "bottomCenter";
}

export interface TextAnimationUnitState {
	index: number;
	graphemeStart: number;
	graphemeEnd: number;
	visual: TextAnimationVisualState;
}

export type TextAnimationDecorationState =
	| {
			kind: "cursor";
			afterGrapheme: number;
			text: string;
			color?: string;
			opacity: number;
	  }
	| {
			kind: "laser";
			unitIndex: number;
			progress: number;
			direction: TextAnimationDirection;
			color: string;
			thicknessPx: number;
			glowPx: number;
	  }
	| {
			kind: "heart";
			id: string;
			x: number;
			y: number;
			scale: number;
			rotationDeg: number;
			opacity: number;
			color: string;
	  };

export type TextAnimationActivePhase = "entrance" | "loop" | "exit";

export interface TextAnimationFrameState {
	frame: number;
	render: boolean;
	activePhases: TextAnimationActivePhase[];
	container: TextAnimationVisualState;
	units: TextAnimationUnitState[];
	decorations: TextAnimationDecorationState[];
}

export interface TextAnimationSegment {
	start: number;
	end: number;
	text: string;
}

export interface CompiledTextAnimationUnit {
	index: number;
	graphemeStart: number;
	graphemeEnd: number;
	rank: number;
}

export interface CompiledTextAnimationRhythm {
	weights: readonly number[];
	prefixTotals: readonly number[];
	cycleTotal: number;
	total: number;
	span: number;
}

export interface CompiledTextAnimationPhase<
	TPhase extends TextAnimationPhaseBase,
> {
	config: TPhase;
	delayFrames: number;
	durationFrames: number;
	startFrame: number;
	endFrame: number;
	units: CompiledTextAnimationUnit[];
	typewriterRhythm?: CompiledTextAnimationRhythm;
}

export interface CompiledTextAnimation {
	content: string;
	fps: number;
	visibleStartFrame: number;
	visibleEndFrame: number;
	entrance?: CompiledTextAnimationPhase<TextAnimationEdgePhase>;
	exit?: CompiledTextAnimationPhase<TextAnimationEdgePhase>;
	loop?: CompiledTextAnimationPhase<TextAnimationLoopPhase>;
}

export const IDENTITY_TEXT_ANIMATION_VISUAL_STATE: TextAnimationVisualState = {
	opacity: 1,
	translateX: 0,
	translateY: 0,
	scaleX: 1,
	scaleY: 1,
	rotationDeg: 0,
	blurPx: 0,
};
