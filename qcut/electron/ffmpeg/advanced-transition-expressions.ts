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
