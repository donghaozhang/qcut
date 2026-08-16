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
	/** Quantized positional shake while scaling, in em (Jianying's 收缩震动). */
	shakeEm?: number;
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
	/**
	 * Ring mode collapses each unit to the layout center before orbiting, so
	 * staggered units form Jianying's 环绕 ring instead of tracing circles
	 * around their own line positions.
	 */
	ring?: boolean;
	/** Set false to translate without rotating the glyph (Jianying's 漩涡). */
	spin?: boolean;
	fade: boolean;
}

/**
 * Jianying's 上弧 loop: the line bows into an upward arc and relaxes, ends
 * tilting outward with the arc's slope.
 */
export interface TextArcEffect {
	kind: "arc";
	/** Peak rise of the line center, in em. */
	riseEm: number;
	/** Outward tilt of the line ends at full rise, in degrees. */
	tiltDeg: number;
}

/** Jianying's 波浪挤压: a squash wave travels through the characters. */
export interface TextSqueezeEffect {
	kind: "squeeze";
	/** Vertical squash at the wave crest, 0..1. */
	amount: number;
	/** Spatial wave cycles across the line. */
	spatialCycles: number;
}

/** Jianying's 折叠: characters fold flat and reopen, phase-stepped by rank. */
export interface TextFoldEffect {
	kind: "fold";
	/** Narrowest horizontal scale at the fold, kept > 0 to stay visible. */
	minimumScale: number;
	/** Phase step between neighbouring units, in degrees. */
	phaseStepDeg: number;
}

/** Jianying's 螺旋下降: units corkscrew outward and drop away. */
export interface TextSpiralEffect {
	kind: "spiral";
	turns: number;
	radius: TextAnimationDistance;
	drop: TextAnimationDistance;
	fade: boolean;
}

/**
 * Jianying's 粒子碎落, ported from the LumiDust vertex shader: a dissolve
 * front sweeps the text and every raster tile behind it drifts away on a
 * seeded noise offset plus rotated gravity.
 */
export interface TextShatterEffect {
	kind: "shatter";
	/** Raster tile edge, px. */
	tilePx: number;
	/** Noise drift at full release, in em. */
	distortion: number;
	gravity: TextAnimationDistance;
	/** Gravity rotation, deg; 0 pulls straight down. */
	gravityRotDeg: number;
	/** Dissolve front: seeded noise or a rotated linear wipe. */
	front: "noise" | "wipe";
	frontRotDeg: number;
	/** Front feather width, 0..1 of the sweep. */
	feather: number;
}

/**
 * Sprite burst, parameter names mirroring Jianying's LumiDust prefab schema
 * (particleTotalNum / pSize / pLifeRandom / gravity …). Drives 彩带喷射 and
 * 福袋炸开 style presets; every particle is a closed-form function of the
 * phase progress.
 */
export interface TextBurstEffect {
	kind: "burst";
	shape: "ribbon" | "coin" | "rect";
	count: number;
	speed: TextAnimationDistance;
	/** Fan center in degrees; 0 points up, 90 points right. */
	directionDeg: number;
	/** Fan width in degrees; 360 bursts in every direction. */
	spreadDeg: number;
	gravity: TextAnimationDistance;
	/** Random life-span variance, 0..1 (pLifeRandom). */
	lifeRandom: number;
	sizeEm: number;
	sizeRandom: number;
	palette: string[];
	/** Ribbon flutter strength, 0..1. */
	flutter: number;
	/**
	 * Optional firework core: dotted spark trails radiating from the layout
	 * center (the reference 彩带喷射 overlay is a starburst plus confetti).
	 */
	rays?: { count: number; length: TextAnimationDistance };
	seed: number;
}

export interface TextBurstParticleState {
	x: number;
	y: number;
	rotationDeg: number;
	sizePx: number;
	opacity: number;
	colorIndex: number;
}

/** Resolved shatter parameters the renderer consumes, all in px. */
export interface TextAnimationShatterState {
	progress: number;
	tilePx: number;
	distortionPx: number;
	gravityPx: number;
	gravityRotDeg: number;
	front: "noise" | "wipe";
	frontRotDeg: number;
	feather: number;
	seed: number;
}

/**
 * Jianying's RotateFlyOut.lua: the unit shrinks to nothing in place while
 * spinning and dropping, all on a cubic-in drive. 随机飞出 uses two full
 * negative turns; 弹性伸缩 reads as a half-turn tumble with a slight drop.
 */
export interface TextTumbleEffect {
	kind: "tumble";
	/** Total spin at the vanish point, in degrees (theirs: -720). */
	spinDeg: number;
	/** Fall distance at the vanish point (theirs: 1.5–2.5 char heights). */
	drop: TextAnimationDistance;
	fade: boolean;
}

/**
 * Seeded per-unit dispersal, covering Jianying's 随机飞出 and, with flicker,
 * 闪烁散开.
 */
export interface TextScatterEffect {
	kind: "scatter";
	distance: TextAnimationDistance;
	/** Strobe the unit's opacity while it disperses. */
	flicker: boolean;
	/** Maximum random spin picked per unit, in degrees. */
	rotateDeg: number;
	seed: number;
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

/**
 * Jianying's 空间翻转: the block swings through a planar tilt while a
 * position-keyed scale gradient fakes the perspective of a yawing plane —
 * the end swinging toward the viewer grows, the receding end shrinks. The
 * tilt and the gradient run 90° out of phase, matching the projection of a
 * 3D yaw viewed slightly off-axis.
 */
export interface TextFlipEffect {
	kind: "flip";
	/** Peak planar tilt of the block, in degrees. */
	maxAngleDeg: number;
	/** Scale spread across the line at full swing, 0..1 of the base size. */
	perspective: number;
}

/** A textured plane rotated in perspective around one of its local axes. */
export interface TextFlip3DEffect {
	kind: "flip3d";
	axis: "x" | "y";
	maxAngleDeg: number;
	cameraFovDeg: number;
	/** Portion of the phase used for the out-and-back motion. */
	motionRatio: number;
	motionEasing: TextAnimationEasing;
}

/** The complete text texture wrapped around a rotating cylindrical surface. */
export interface TextCylinder3DEffect {
	kind: "cylinder3d";
	turns: number;
	tiltXDeg: number;
	cameraFovDeg: number;
	/** Fraction of a full cylinder occupied by the texture, 0..1. */
	coverage: number;
	/** Cylinder radius relative to the unprojected texture width. */
	radiusRatio: number;
	startYawDeg: number;
}

/** Seeded per-glyph 3D poses with a bounded current-frame trail pass. */
export interface TextJitter3DEffect {
	kind: "jitter3d";
	cameraFovDeg: number;
	groupYawDeg: number;
	rotationXDeg: number;
	rotationYDeg: number;
	rotationZDeg: number;
	positionJitter: number;
	scaleFrom: number;
	scaleTo: number;
	frequency: number;
	seed: number;
	trailSamples: number;
	trailStrength: number;
	trapezoidAmount: number;
}

/**
 * One keyframe of a declarative value track, mirroring Jianying's
 * `motionKeyFrameInfo` rows `[t, v, vi, vo, vti, vto]`. Times are normalized
 * to 0..1 of the phase; handle times are relative to the key (incoming
 * handles usually negative). Keys without handles interpolate linearly.
 */
export interface TextKeyframePoint {
	t: number;
	v: number;
	/** Incoming handle value (Jianying `vi`). */
	inValue?: number;
	/** Outgoing handle value (Jianying `vo`). */
	outValue?: number;
	/** Incoming handle time offset (Jianying `vti`). */
	inTime?: number;
	/** Outgoing handle time offset (Jianying `vto`). */
	outTime?: number;
}

export type TextKeyframeChannel =
	| "translateXEm"
	| "translateYEm"
	| "scaleX"
	| "scaleY"
	| "rotationDeg"
	| "rotationXDeg"
	| "rotationYDeg"
	| "opacity"
	| "blurPx"
	| "colorAmount"
	| "glowIntensity"
	| "glowRadiusPx"
	// Raster post-pass parameters, so a document can animate the mosaic
	// coarseness, the channel separation, or the displacement strength.
	| "pixelateCell"
	| "rgbSplitPx"
	| "displaceAmplitudePx";

/**
 * One key of an animated tint track; `v` and the bezier handle values are
 * [r, g, b] in 0..1 (Jianying keyframes its `color` base attribute as an RGBA
 * vector with per-component handles).
 */
export interface TextColorKeyframePoint {
	t: number;
	v: [number, number, number];
	inValue?: [number, number, number];
	outValue?: [number, number, number];
	inTime?: number;
	outTime?: number;
}

/** Weight profile across an animated selector window (Jianying `shape`). */
export type TextSelectorShape =
	| "square"
	| "rampUp"
	| "rampDown"
	| "triangle"
	| "round"
	| "smooth";

/**
 * AE-style range selector: a window over normalized unit positions whose
 * start/end are themselves keyframable, with a weight shape inside and a
 * feathered edge. Jianying's 变色弹跳 is exactly this — a smooth window
 * opening from the text center whose front tints and lifts each character it
 * passes.
 */
export interface TextKeyframesSelector {
	/** Window start over unit positions 0..1; single key = constant. */
	start: TextKeyframePoint[];
	/** Window end over unit positions 0..1. */
	end: TextKeyframePoint[];
	shape: TextSelectorShape;
	/** Edge feather width in unit-position space, 0..1 (剪映 smooth). */
	feather: number;
	/**
	 * Which ordinal maps a unit onto the 0..1 window axis. "index" is layout
	 * order; "rank" follows the sequence order, so a `random` sequence makes
	 * the window consume characters in shuffled order (剪映 randomSort).
	 */
	basedOn?: "index" | "rank";
}

/**
 * Declarative keyframe animation: instead of a hand-written evaluator, the
 * effect IS the data — per-channel bezier tracks sampled at each unit's phase
 * progress. This is how Jianying ships its text animations (studioAnim.lsanim
 * property tracks), and porting one becomes transcription instead of coding.
 */
export interface TextKeyframesEffect {
	kind: "keyframes";
	channels: Partial<Record<TextKeyframeChannel, TextKeyframePoint[]>>;
	/** Tint target for the colorAmount channel, #rrggbb. */
	color?: string;
	/**
	 * Animated tint target (Jianying's keyframed `color` base attribute, e.g.
	 * 彩虹渐变's red→violet→white sweep). Overrides `color`; the colorAmount
	 * channel still scales the blend and defaults to 1 when absent.
	 */
	colorTrack?: TextColorKeyframePoint[];
	/** Glow color for the glow channels, #rrggbb; defaults to white. */
	glowColor?: string;
	/** rgbSplit direction, degrees; 0 separates horizontally. */
	rasterAngleDeg?: number;
	/** displace field spatial scale in px; smaller means finer grain. */
	rasterScale?: number;
	/** displace field turns this many times over the phase. */
	rasterEvolution?: number;
	/**
	 * Optional animated range selector. With a selector the phase clock is
	 * shared by every unit and the WINDOW does the spatial differentiation:
	 * each unit's effect strength is its selector weight.
	 */
	selector?: TextKeyframesSelector;
}

/**
 * Per-unit color cycling, the base of Jianying's 变色弹跳 / 彩虹 / 亮度渐变
 * family: every unit blends toward palette stops swept over time, shifted by
 * rank so neighbouring characters sit on different stops.
 */
export interface TextColorCycleEffect {
	kind: "colorCycle";
	/** Palette stops as #rrggbb, cycled in order. */
	palette: string[];
	/** Peak blend toward the palette color, 0..1; 0 keeps the base fill. */
	amount: number;
	/** Palette sweeps per phase pass. */
	cycles: number;
	/** Palette stops a unit is shifted per rank; 0 keeps all units in sync. */
	rankOffset: number;
	/** Snap to whole stops instead of interpolating between them. */
	stepped: boolean;
	/**
	 * Amount curve over each unit's cycle. Jianying's 变色弹跳 sweeps a
	 * feathered window across the text and characters keep their tint once the
	 * front passes ("hold"); "beat" pulses once per cycle; "constant" leaves
	 * the tint always on (rainbow cycling).
	 */
	envelope: "constant" | "hold" | "beat";
	/** Vertical lift coupled to the amount envelope, in em (变色弹跳: 0.2). */
	bounceEm?: number;
}

/**
 * Stepped per-unit shake. Jianying quantizes local time into a handful of
 * poses per cycle and derives each unit's offset from a chaotic but
 * deterministic product of sines, phase-shifted by unit rank.
 */
export interface TextJitterEffect {
	kind: "jitter";
	/** Discrete poses per cycle. Jianying uses 4 (local time floored to 1/4). */
	steps: number;
	/** Horizontal travel at full swing, in em. */
	amplitudeX: number;
	/** Vertical travel at full swing, in em. */
	amplitudeY: number;
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
	| TextHeartEffect
	| TextFlipEffect
	| TextFlip3DEffect
	| TextCylinder3DEffect
	| TextJitter3DEffect
	| TextJitterEffect
	| TextColorCycleEffect
	| TextKeyframesEffect
	| TextArcEffect
	| TextSqueezeEffect
	| TextFoldEffect
	| TextSpiralEffect
	| TextScatterEffect
	| TextTumbleEffect
	| TextShatterEffect
	| TextBurstEffect;

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

/** Renderer-level projection shared by preview and export canvas paths. */
export type TextAnimationProjectionState =
	| {
			kind: "plane";
			cameraFovDeg: number;
			rotationXDeg: number;
			rotationYDeg: number;
	  }
	| {
			kind: "cylinder";
			cameraFovDeg: number;
			tiltXDeg: number;
			yawDeg: number;
			coverage: number;
			radiusRatio: number;
	  };

/**
 * Block-level glow pass, the first stop of Jianying's effectAnimators chain
 * (SoftGlow / DeepGlow / RadianceGlow families keyframe exposure and
 * intensity on the text render group).
 */
export interface TextAnimationGlowState {
	color: string;
	radiusPx: number;
	/** 0..1 glow pass opacity. */
	intensity: number;
}

/**
 * A raster post-pass applied to the block after it is drawn to an offscreen
 * canvas — the portable stand-in for Jianying's fragment-shader passes that
 * operate on the rendered text image rather than on per-unit transforms.
 * - `pixelate`: snap sampling to a `cell`-px grid (mosaic).
 * - `rgbSplit`: draw the raster three times, the red and blue channels
 *   offset by `offsetPx` along `angleDeg` (chromatic aberration / glitch).
 * - `displace`: offset each sampled block by a value-noise field of
 *   `amplitudePx`, at spatial `scale`, advanced by `evolution` — the general
 *   case covering boil, turbulence and ripple.
 */
export interface TextAnimationRasterEffectState {
	kind: "pixelate" | "rgbSplit" | "displace";
	/** pixelate: grid cell size in px. */
	cell?: number;
	/** rgbSplit: channel separation in px, and its direction. */
	offsetPx?: number;
	angleDeg?: number;
	/** displace: field amplitude px, spatial scale px, and time phase. */
	amplitudePx?: number;
	scale?: number;
	evolution?: number;
}

export interface TextAnimationPostProcessState {
	trailSamples: number;
	trailStrength: number;
	/** Reserved for the portable pixel-warp pass. */
	trapezoidAmount: number;
	/** Animated render-group glow. */
	glow?: TextAnimationGlowState;
	/** Raster post-pass (mosaic / RGB split / noise displacement). */
	raster?: TextAnimationRasterEffectState;
}

/**
 * Per-unit fill recolor. The renderer blends the element's own fill toward
 * `color`; `amount` 0 keeps the base fill untouched, 1 replaces it.
 */
export interface TextAnimationColorMixState {
	/** Target color, #rrggbb. */
	color: string;
	/** Blend toward the target, 0..1. */
	amount: number;
	/**
	 * "multiply" filters the element's own fill through `color` instead of
	 * replacing it — Jianying's keyframed color base attribute is a
	 * multiplicative tint whose white keys mean "no tint", regardless of the
	 * text's own color. Absent = replace blend.
	 */
	mode?: "multiply";
}

export interface TextAnimationVisualState {
	opacity: number;
	translateX: number;
	translateY: number;
	translateZ?: number;
	scaleX: number;
	scaleY: number;
	rotationDeg: number;
	rotationXDeg?: number;
	rotationYDeg?: number;
	blurPx: number;
	mask?: TextAnimationMaskState;
	/** Present while a color effect drives the frame; blended by the renderer. */
	colorMix?: TextAnimationColorMixState;
	transformOrigin?: "center" | "bottomCenter";
	/** Present when the rasterized text is mapped onto a projective surface. */
	projection?: TextAnimationProjectionState;
	postProcess?: TextAnimationPostProcessState;
	/** Present while a shatter effect drives the frame; renderer-level. */
	shatter?: TextAnimationShatterState;
}

export interface TextAnimationUnitState {
	index: number;
	graphemeStart: number;
	graphemeEnd: number;
	visual: TextAnimationVisualState;
}

export type TextAnimationDecorationState =
	| {
			kind: "particles";
			shape: "ribbon" | "coin" | "rect" | "spark";
			palette: string[];
			items: TextBurstParticleState[];
	  }
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
	translateZ: 0,
	scaleX: 1,
	scaleY: 1,
	rotationDeg: 0,
	rotationXDeg: 0,
	rotationYDeg: 0,
	blurPx: 0,
};
