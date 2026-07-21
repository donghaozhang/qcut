import type { VideoTransition } from "./types";
import {
	blendSamples,
	clampedPlaneSample,
	tintPlaneExpression,
	transitionPeakExpression,
} from "./transition-expression-utils";

type TransitionDirection = NonNullable<VideoTransition["direction"]>;

function resolveTransitionDirection({
	direction,
}: {
	direction: VideoTransition["direction"];
}): TransitionDirection {
	return direction ?? "left";
}

function directionalCoordinates({
	direction,
	x,
	y,
	offset,
}: {
	direction: VideoTransition["direction"];
	x: string;
	y: string;
	offset: string;
}): { x: string; y: string } {
	switch (resolveTransitionDirection({ direction })) {
		case "right":
			return { x: `(${x})-(${offset})`, y };
		case "up":
			return { x, y: `(${y})+(${offset})` };
		case "down":
			return { x, y: `(${y})-(${offset})` };
		case "left":
			return { x: `(${x})+(${offset})`, y };
	}
	throw new Error("Unsupported transition direction");
}

function averagedDirectionalSamples({
	input,
	direction,
	radius,
}: {
	input: "a" | "b";
	direction: VideoTransition["direction"];
	radius: string;
}): string {
	const samples = [-2, -1, 0, 1, 2].map((tap) => {
		const coordinates = directionalCoordinates({
			direction,
			x: "X",
			y: "Y",
			offset: `${tap}*(${radius})`,
		});
		return clampedPlaneSample({ input, ...coordinates });
	});
	return `(${samples.join("+")})/${samples.length}`;
}

export function motionBlurExpression({
	direction,
	progress,
	intensity,
}: {
	direction: VideoTransition["direction"];
	progress: string;
	intensity: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const axisSize = direction === "up" || direction === "down" ? "H" : "W";
	const radius = `${0.012 * intensity}*${axisSize}*(${peak})`;
	return blendSamples({
		progress,
		outgoing: averagedDirectionalSamples({
			input: "a",
			direction,
			radius,
		}),
		incoming: averagedDirectionalSamples({
			input: "b",
			direction,
			radius,
		}),
	});
}

export function pixelateExpression({
	progress,
	intensity,
}: {
	progress: string;
	intensity: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const blockSize = `(1+floor(${Math.round(26 * intensity)}*(${peak})))`;
	const sampleX = `floor(X/${blockSize})*${blockSize}+${blockSize}/2`;
	const sampleY = `floor(Y/${blockSize})*${blockSize}+${blockSize}/2`;
	return blendSamples({
		progress,
		outgoing: clampedPlaneSample({ input: "a", x: sampleX, y: sampleY }),
		incoming: clampedPlaneSample({ input: "b", x: sampleX, y: sampleY }),
	});
}

export function waterRippleExpression({
	progress,
	intensity,
	frequency,
}: {
	progress: string;
	intensity: number;
	frequency: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const distance = "sqrt(pow((X-W/2)/W,2)+pow((Y-H/2)/H,2))";
	const wave = `sin((${distance})*${80 * frequency}-(${progress})*24)*(${peak})*${0.028 * intensity}`;
	const sampleX = `X+(${wave})*W*((X-W/2)/(W/2))`;
	const sampleY = `Y+(${wave})*H*((Y-H/2)/(H/2))`;
	return blendSamples({
		progress,
		outgoing: clampedPlaneSample({ input: "a", x: sampleX, y: sampleY }),
		incoming: clampedPlaneSample({ input: "b", x: sampleX, y: sampleY }),
	});
}

export function particleDissolveExpression({
	progress,
	intensity,
	frequency,
}: {
	progress: string;
	intensity: number;
	frequency: number;
}): string {
	const cellSize = Math.max(5, Math.round(18 / frequency));
	const noise = `abs(sin(floor(X/${cellSize})*12.9898+floor(Y/${cellSize})*78.233))`;
	const localDistance = `sqrt(pow(mod(X,${cellSize})-${cellSize / 2},2)+pow(mod(Y,${cellSize})-${cellSize / 2},2))/(${cellSize}*0.72)`;
	const visibility = `((${progress})*${1.45 + intensity * 0.15}-(${noise})*0.45)`;
	return `if(lte(${progress},0.001),A,if(gte(${progress},0.999),B,if(lt(${localDistance},${visibility}),B,A)))`;
}

export function glassRefractionExpression({
	direction,
	progress,
	intensity,
	frequency,
}: {
	direction: VideoTransition["direction"];
	progress: string;
	intensity: number;
	frequency: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const vertical = direction === "up" || direction === "down";
	const bandSize = Math.max(6, Math.round(24 / frequency));
	const bandAxis = vertical ? "X" : "Y";
	const axisSize = vertical ? "H" : "W";
	const stripe = `if(eq(mod(floor(${bandAxis}/${bandSize}),2),0),1,-1)`;
	const offset = `${0.035 * intensity}*${axisSize}*(${peak})*(${stripe})`;
	const outgoingCoordinates = directionalCoordinates({
		direction,
		x: "X",
		y: "Y",
		offset,
	});
	const incomingCoordinates = directionalCoordinates({
		direction,
		x: "X",
		y: "Y",
		offset: `-1*(${offset})`,
	});
	const blend = blendSamples({
		progress,
		outgoing: clampedPlaneSample({ input: "a", ...outgoingCoordinates }),
		incoming: clampedPlaneSample({ input: "b", ...incomingCoordinates }),
	});
	const highlight = `if(lt(mod(${bandAxis},${bandSize}),1.5),${Math.min(42, 18 * intensity)}*(${peak}),0)`;
	return `if(eq(PLANE,3),${blend},min(255,(${blend})+(${highlight})))`;
}

function pageFlipBase({
	direction,
	progress,
}: {
	direction: VideoTransition["direction"];
	progress: string;
}): { base: string; foldDistance: string; axisSize: "W" | "H" } {
	switch (resolveTransitionDirection({ direction })) {
		case "right": {
			const fold = `(1-(${progress}))*W`;
			return {
				base: `if(gte(X,${fold}),B,A)`,
				foldDistance: `abs(X-${fold})`,
				axisSize: "W",
			};
		}
		case "up": {
			const fold = `(${progress})*H`;
			return {
				base: `if(lt(Y,${fold}),B,A)`,
				foldDistance: `abs(Y-${fold})`,
				axisSize: "H",
			};
		}
		case "down": {
			const fold = `(1-(${progress}))*H`;
			return {
				base: `if(gte(Y,${fold}),B,A)`,
				foldDistance: `abs(Y-${fold})`,
				axisSize: "H",
			};
		}
		case "left": {
			const fold = `(${progress})*W`;
			return {
				base: `if(lt(X,${fold}),B,A)`,
				foldDistance: `abs(X-${fold})`,
				axisSize: "W",
			};
		}
	}
	throw new Error("Unsupported transition direction");
}

export function pageFlipExpression({
	direction,
	progress,
	intensity,
}: {
	direction: VideoTransition["direction"];
	progress: string;
	intensity: number;
}): string {
	const { base, foldDistance, axisSize } = pageFlipBase({
		direction,
		progress,
	});
	const foldWidth = Math.min(0.16, 0.07 * intensity);
	const shade = `(0.58+0.42*min(1,(${foldDistance})/(${foldWidth}*${axisSize})))`;
	const highlight = `max(0,1-(${foldDistance})/(${foldWidth * 0.32}*${axisSize}))*34`;
	return `if(eq(PLANE,3),${base},min(255,(${base})*(${shade})+(${highlight})))`;
}

function swirledSample({
	input,
	spin,
}: {
	input: "a" | "b";
	spin: string;
}): string {
	const distance = "sqrt(pow(X-W/2,2)+pow(Y-H/2,2))";
	const falloff = `max(0,1-(${distance})/(0.75*sqrt(W*W+H*H)/2))`;
	const angle = `((${spin})*(${falloff}))`;
	const sampleX = `W/2+(X-W/2)*cos(${angle})-(Y-H/2)*sin(${angle})`;
	const sampleY = `H/2+(X-W/2)*sin(${angle})+(Y-H/2)*cos(${angle})`;
	return clampedPlaneSample({ input, x: sampleX, y: sampleY });
}

/** Vortex: both clips swirl around center while crossfading. */
export function vortexExpression({
	progress,
	intensity,
}: {
	progress: string;
	intensity: number;
}): string {
	const strength = (2.6 * intensity).toFixed(3);
	return blendSamples({
		progress,
		outgoing: swirledSample({
			input: "a",
			spin: `(${progress})*${strength}`,
		}),
		incoming: swirledSample({
			input: "b",
			spin: `-(1-(${progress}))*${strength}`,
		}),
	});
}

/** Shockwave: an expanding ring displaces pixels radially, with a bright rim. */
export function shockwaveExpression({
	progress,
	intensity,
	frequency,
}: {
	progress: string;
	intensity: number;
	frequency: number;
}): string {
	const distance = "sqrt(pow((X-W/2)/W,2)+pow((Y-H/2)/H,2))";
	const front = `((${progress})*0.82)`;
	const delta = `((${distance})-(${front}))`;
	const impulse = `((${delta})*exp(-pow(${delta},2)/${(0.007 / frequency).toFixed(5)}))`;
	const shift = `(${impulse})*${(0.6 * intensity).toFixed(3)}`;
	const sampleX = `X+(${shift})*W*((X-W/2)/(W/2))`;
	const sampleY = `Y+(${shift})*H*((Y-H/2)/(H/2))`;
	const blend = blendSamples({
		progress,
		outgoing: clampedPlaneSample({ input: "a", x: sampleX, y: sampleY }),
		incoming: clampedPlaneSample({ input: "b", x: sampleX, y: sampleY }),
	});
	const rim = `max(0,1-abs(${delta})*${Math.round(46 / frequency)})*${Math.min(70, Math.round(48 * intensity))}`;
	return `if(eq(PLANE,3),${blend},min(255,(${blend})+(${rim})))`;
}

/**
 * MG color swipe: a solid color panel sweeps across the frame; the outgoing
 * clip shows ahead of the panel and the incoming clip is revealed behind it.
 */
export function colorSwipeExpression({
	direction,
	progress,
	tint,
}: {
	direction: VideoTransition["direction"];
	progress: string;
	tint: string | undefined;
}): string {
	const axis =
		direction === "right"
			? "(X/W)"
			: direction === "up"
				? "(1-Y/H)"
				: direction === "down"
					? "(Y/H)"
					: "(1-X/W)";
	const front = `(2*(${progress}))`;
	const back = `(2*(${progress})-1)`;
	const color = tintPlaneExpression({ tint: tint ?? "#ffd233" });
	return `if(eq(PLANE,3),255,if(gt(${axis},${front}),A,if(lt(${axis},${back}),B,${color})))`;
}

/**
 * Cube rotation: the outgoing face squeezes toward one edge while the
 * incoming face expands from the other, with rotation shading, mirroring a
 * horizontal 3D cube spin.
 */
export function cubeExpression({
	progress,
	intensity,
}: {
	progress: string;
	intensity: number;
}): string {
	const split = `((1-(${progress}))*W)`;
	const outgoing = clampedPlaneSample({
		input: "a",
		x: `X/max(0.0001,1-(${progress}))`,
		y: "Y",
	});
	const incoming = clampedPlaneSample({
		input: "b",
		x: `(X-(${split}))/max(0.0001,(${progress}))`,
		y: "Y",
	});
	const base = `if(lt(X,${split}),${outgoing},${incoming})`;
	const shade = (0.38 * intensity).toFixed(3);
	const shading = `if(lt(X,${split}),1-${shade}*(${progress}),1-${shade}*(1-(${progress})))`;
	return `if(eq(PLANE,3),${base},(${base})*(${shading}))`;
}

/**
 * Shaped wipe fields for texture-mask transitions with a maskShape. Each
 * shape maps every pixel to a scalar in [0,1] describing when the incoming
 * clip reveals it; the field is compared against progress with a feathered
 * edge, mirroring the preview's clip-path/mask geometry.
 */
export function maskShapeExpression({
	shape,
	progress,
}: {
	shape: string;
	progress: string;
}): string {
	const dx = "(X/W-0.5)";
	const dy = "(Y/H-0.5)";
	const radius = `(sqrt(pow(${dx},2)+pow(${dy},2))/0.7071)`;
	const angle = `((atan2(${dy},${dx})+PI)/(2*PI))`;
	const organicNoise =
		"((sin(X/W*13+sin(Y/H*17)*2)+cos(Y/H*11+sin(X/W*7)*2)+2)/4)";
	let field: string;
	let feather = 0.03;
	switch (shape) {
		case "circle":
			field = radius;
			break;
		case "clock":
			field = angle;
			feather = 0.015;
			break;
		case "blinds":
			field = "mod(Y*8/H,1)";
			feather = 0.02;
			break;
		case "cross":
			field = `(min(abs(${dx}),abs(${dy}))*2)`;
			break;
		case "triptych":
			field = "(Y/H*0.9+mod(floor(X*3/W),3)*0.05)";
			feather = 0.02;
			break;
		case "arrow":
			field = "((X+abs(Y-H/2))/(W+H/2))";
			feather = 0.02;
			break;
		case "heart":
			field = `(sqrt(pow(${dx},2)+pow(${dy},2))/(0.34*(1.35-sin(atan2(-(${dy}),${dx})))+0.08))`;
			feather = 0.05;
			break;
		case "star":
			field = `(sqrt(pow(${dx},2)+pow(${dy},2))/(0.42+0.24*cos(5*atan2(${dy},${dx})+PI/2)))`;
			feather = 0.05;
			break;
		case "ink":
			field = `(0.6*${organicNoise}+0.4*${radius})`;
			feather = 0.09;
			break;
		case "cloud":
			field = `(0.55*${organicNoise}+0.45*(Y/H))`;
			feather = 0.09;
			break;
		case "fog":
			field = `(0.7*${organicNoise}+0.3*${radius})`;
			feather = 0.11;
			break;
		case "diagonal":
			field = "((X/W+Y/H)/2)";
			feather = 0.05;
			break;
		case "curtain":
			field = `(abs(${dx})*2)`;
			feather = 0.02;
			break;
		case "drip":
			field = `(0.75*(Y/H)+0.25*${organicNoise})`;
			feather = 0.07;
			break;
		default:
			field = radius;
			break;
	}
	const scaledProgress = `((${progress})*${(1 + 2 * feather).toFixed(3)})`;
	const localMix = `min(1,max(0,((${scaledProgress})-(${field})+${feather})/${(feather * 2).toFixed(4)}))`;
	const shapedBlend = blendSamples({
		progress: localMix,
		outgoing: "A",
		incoming: "B",
	});
	return `if(lte(${progress},0.001),A,if(gte(${progress},0.999),B,${shapedBlend}))`;
}

export function textureMaskExpression({
	progress,
	frequency,
}: {
	progress: string;
	frequency: number;
}): string {
	const texture = `(sin(X/W*${55 * frequency})+cos(Y/H*${47 * frequency})+sin((X/W+Y/H)*${31 * frequency})+3)/6`;
	const feather = 0.045;
	const localMix = `min(1,max(0,((${progress})-(${texture})+${feather})/${feather * 2}))`;
	const texturedBlend = blendSamples({
		progress: localMix,
		outgoing: "A",
		incoming: "B",
	});
	return `if(lte(${progress},0.001),A,if(gte(${progress},0.999),B,${texturedBlend}))`;
}

export function lensFlareExpression({
	progress,
	intensity,
	tint,
}: {
	progress: string;
	intensity: number;
	tint: string | undefined;
}): string {
	const peak = transitionPeakExpression({ progress });
	const blend = blendSamples({ progress, outgoing: "A", incoming: "B" });
	const color = tintPlaneExpression({ tint: tint ?? "#ffd6a1" });
	const centerX = `(0.1+0.8*(${progress}))*W`;
	const centerY = `(0.42+0.16*sin((${progress})*PI))*H`;
	const distance = `sqrt(pow((X-${centerX})/W,2)+pow((Y-${centerY})/H,2))`;
	const orb = `max(0,1-(${distance})*8)`;
	const streak = `max(0,1-abs(Y-${centerY})/(0.035*H))*0.38`;
	const strength = Math.min(0.9, 0.55 * intensity);
	return `if(eq(PLANE,3),${blend},min(255,(${blend})+(${color})*${strength}*(${peak})*((${orb})+(${streak}))))`;
}
