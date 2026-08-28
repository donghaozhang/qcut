export interface PersonCutoutFrameCountExpectation {
	count: number;
	source: "counted" | "declared" | "estimated";
	tolerance: number;
}

function positiveFrameCount({ value }: { value?: string }) {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolvePersonCutoutFrameCountExpectation({
	declaredFrames,
	duration,
	frameRate,
	readFrames,
}: {
	declaredFrames?: string;
	duration: number;
	frameRate: number;
	readFrames?: string;
}): PersonCutoutFrameCountExpectation {
	const counted = positiveFrameCount({ value: readFrames });
	if (counted !== null) {
		return { count: counted, source: "counted", tolerance: 0 };
	}
	const declared = positiveFrameCount({ value: declaredFrames });
	if (declared !== null) {
		return { count: declared, source: "declared", tolerance: 0 };
	}
	const estimated = Math.round(duration * frameRate);
	if (!Number.isSafeInteger(estimated) || estimated <= 0) {
		throw new Error("无法读取视频帧数");
	}
	return { count: estimated, source: "estimated", tolerance: 1 };
}

export function validatePersonCutoutAlphaFrameCount({
	actualFrameCount,
	expectation,
}: {
	actualFrameCount: number;
	expectation: PersonCutoutFrameCountExpectation;
}) {
	const isValidActual =
		Number.isSafeInteger(actualFrameCount) && actualFrameCount > 0;
	const difference = Math.abs(actualFrameCount - expectation.count);
	if (!isValidActual || difference > expectation.tolerance) {
		throw new Error(
			`人物蒙版帧数不完整（源视频 ${expectation.count} 帧，蒙版 ${actualFrameCount} 帧）`
		);
	}
}
