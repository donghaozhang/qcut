import { buildBalancedSegmentExpression } from "./balanced-segment-expression";

export interface NumericKeyframe {
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

function easingExpression({
	progress,
	easing,
}: {
	progress: string;
	easing: string;
}): string {
	if (easing === "easeIn") return `pow(${progress},2)`;
	if (easing === "easeOut") return `1-pow(1-${progress},2)`;
	if (easing === "easeInOut") {
		return `if(lt(${progress},0.5),2*pow(${progress},2),1-pow(-2*${progress}+2,2)/2)`;
	}
	if (easing === "spring") {
		return `${progress}+sin(${progress}*PI)*0.15*(1-${progress})`;
	}
	return progress;
}

export function buildNumericKeyframeExpression({
	keyframes,
	fps,
	fallback,
	timeVariable = "T",
}: {
	keyframes?: NumericKeyframe[];
	fps: number;
	fallback: number;
	timeVariable?: string;
}): string {
	const sorted = [...(keyframes ?? [])].sort(
		(left, right) => left.frame - right.frame
	);
	if (sorted.length === 0) return String(fallback);
	if (sorted.length === 1) return String(sorted[0].value);
	const normalizedFps = Math.max(1, fps || 30);
	const timeAt = ({ frame }: { frame: number }) => frame / normalizedFps;
	const buildSegment = ({ index }: { index: number }): string => {
		if (index === sorted.length - 1) {
			return String(sorted[index]?.value ?? fallback);
		}
		const from = sorted[index];
		const to = sorted[index + 1];
		const start = timeAt(from);
		const end = timeAt(to);
		const duration = Math.max(0.001, end - start);
		const progress = `(${timeVariable}-${start})/${duration}`;
		const eased = easingExpression({ progress, easing: to.easing });
		return `(${from.value})+((${to.value})-(${from.value}))*(${eased})`;
	};
	const expression = buildBalancedSegmentExpression({
		segmentCount: sorted.length,
		timeVariable,
		getBoundary: ({ rightSegmentIndex }) =>
			String(timeAt(sorted[rightSegmentIndex])),
		getSegmentExpression: ({ segmentIndex }) =>
			buildSegment({ index: segmentIndex }),
	});
	return `if(lt(${timeVariable},${timeAt(sorted[0])}),${sorted[0].value},${expression})`;
}
