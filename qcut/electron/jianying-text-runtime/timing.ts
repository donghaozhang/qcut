const MICROSECONDS_PER_SECOND = 1_000_000;
const MAXIMUM_TEMPLATE_DURATION_SECONDS = 60;

export interface JianyingTextTemplateTiming {
	timelineDuration: number;
	startTimestamp: number;
	timestampStep: number;
}

export function resolveJianyingTextTemplateTiming({
	sourceStart,
	elementDuration,
	frameCount,
	fps,
	templateDuration,
}: {
	sourceStart: number;
	elementDuration: number;
	frameCount: number;
	fps: number;
	templateDuration: number;
}): JianyingTextTemplateTiming {
	const timelineDuration =
		Math.min(MAXIMUM_TEMPLATE_DURATION_SECONDS, templateDuration) *
		MICROSECONDS_PER_SECOND;
	const startTimestamp = Math.min(
		timelineDuration,
		(sourceStart / elementDuration) * timelineDuration
	);
	if (frameCount === 1) {
		return { timelineDuration, startTimestamp, timestampStep: 0 };
	}
	const desiredStep = timelineDuration / elementDuration / fps;
	const maximumStep = (timelineDuration - startTimestamp) / (frameCount - 1);
	return {
		timelineDuration,
		startTimestamp,
		timestampStep: Math.min(desiredStep, maximumStep),
	};
}

export function jianyingTextFrameTimestamp({
	timing,
	frameIndex,
}: {
	timing: JianyingTextTemplateTiming;
	frameIndex: number;
}) {
	return Math.round(timing.startTimestamp + timing.timestampStep * frameIndex);
}
