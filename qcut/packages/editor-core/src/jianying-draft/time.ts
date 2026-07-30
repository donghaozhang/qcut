const MICROSECONDS_PER_SECOND = 1_000_000;

export function secondsToMicroseconds({
	seconds,
}: {
	seconds: number;
}): number {
	if (!Number.isFinite(seconds) || seconds < 0) {
		throw new RangeError(`Invalid non-negative time in seconds: ${seconds}`);
	}
	const microseconds = Math.round(seconds * MICROSECONDS_PER_SECOND);
	if (!Number.isSafeInteger(microseconds)) {
		throw new RangeError(`Time exceeds safe integer microseconds: ${seconds}`);
	}
	return microseconds;
}
