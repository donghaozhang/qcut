const MEDIA_TIME_DECIMAL_PLACES = 15;

function powerOfTen({ exponent }: { exponent: number }): bigint {
	return 10n ** BigInt(exponent);
}

/**
 * Converts finite seconds to 1e-15-second integer ticks for exact comparisons.
 * Positive sub-tick remainders truncate toward zero; negative values floor,
 * so a negative sub-tick remainder rounds away from zero.
 */
export function localStickerMediaTimeToTicks({
	seconds,
}: {
	seconds: number;
}): bigint {
	if (!Number.isFinite(seconds)) {
		throw new Error("Local sticker media time must be finite");
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
