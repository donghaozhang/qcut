function validDuration({ value }: { value: number }) {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export function resolveReviewProjectDuration({
	remoteDuration,
	timelineDuration,
}: {
	remoteDuration: number;
	timelineDuration: number;
}) {
	return Math.max(
		validDuration({ value: remoteDuration }),
		validDuration({ value: timelineDuration })
	);
}
