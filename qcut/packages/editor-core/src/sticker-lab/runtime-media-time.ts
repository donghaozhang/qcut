import { StickerRuntimeError } from "./runtime-model.js";

const MEDIA_TIME_DECIMAL_PLACES = 15;
const MEDIA_TIME_TICKS_PER_SECOND = 10n ** BigInt(MEDIA_TIME_DECIMAL_PLACES);
const MEDIA_TIME_TICKS_PER_SECOND_NUMBER = Number(MEDIA_TIME_TICKS_PER_SECOND);

function powerOfTen({ exponent }: { exponent: number }): bigint {
	return 10n ** BigInt(exponent);
}

/**
 * Media timestamps originate as decimal container values. Flooring their shortest
 * decimal representation to femtoseconds removes IEEE tails without advancing a
 * time that is still before a half-open boundary.
 */
export function mediaTimeToTicks({ seconds }: { seconds: number }): bigint {
	if (!Number.isFinite(seconds)) {
		throw new StickerRuntimeError({
			code: "INVALID_DESCRIPTOR",
			message: "Media time must be finite",
		});
	}
	const text = seconds.toString().toLowerCase();
	const negative = text.startsWith("-");
	const unsignedText = negative ? text.slice(1) : text;
	const [mantissa, exponentText] = unsignedText.split("e");
	const exponent = exponentText === undefined ? 0 : Number(exponentText);
	const [integerPart = "0", fractionPart = ""] = mantissa?.split(".") ?? [];
	const digits = `${integerPart}${fractionPart}`.replace(/^0+/, "") || "0";
	const significand = BigInt(digits);
	const tickExponent =
		exponent - fractionPart.length + MEDIA_TIME_DECIMAL_PLACES;
	if (tickExponent >= 0) {
		const ticks = significand * powerOfTen({ exponent: tickExponent });
		return negative ? -ticks : ticks;
	}
	const divisor = powerOfTen({ exponent: -tickExponent });
	const quotient = significand / divisor;
	const remainder = significand % divisor;
	if (!negative) return quotient;
	return remainder === 0n ? -quotient : -(quotient + 1n);
}

export function mediaTicksToSeconds({ ticks }: { ticks: bigint }): number {
	const wholeSeconds = ticks / MEDIA_TIME_TICKS_PER_SECOND;
	const fractionalTicks = ticks % MEDIA_TIME_TICKS_PER_SECOND;
	return (
		Number(wholeSeconds) +
		Number(fractionalTicks) / MEDIA_TIME_TICKS_PER_SECOND_NUMBER
	);
}

export function normalizeMediaTimeSeconds({
	seconds,
}: {
	seconds: number;
}): number {
	return mediaTicksToSeconds({ ticks: mediaTimeToTicks({ seconds }) });
}

export function compareMediaTimeSeconds({
	left,
	right,
}: {
	left: number;
	right: number;
}): number {
	const leftTicks = mediaTimeToTicks({ seconds: left });
	const rightTicks = mediaTimeToTicks({ seconds: right });
	if (leftTicks < rightTicks) return -1;
	if (leftTicks > rightTicks) return 1;
	return 0;
}

export function subtractMediaTimeSeconds({
	minuend,
	subtrahend,
}: {
	minuend: number;
	subtrahend: number;
}): number {
	return mediaTicksToSeconds({
		ticks:
			mediaTimeToTicks({ seconds: minuend }) -
			mediaTimeToTicks({ seconds: subtrahend }),
	});
}
