export const MAX_REPORTED_SAMPLE_INDICES = 20;

export const PLANAR_FIELDS = [
	"p_x1",
	"p_y1",
	"p_x2",
	"p_y2",
	"p_x3",
	"p_y3",
	"p_x4",
	"p_y4",
];

export const MOTION_FIELDS = ["left", "top", "right", "bottom"];

export function isRecord({ value }) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isFiniteNumber({ value }) {
	return typeof value === "number" && Number.isFinite(value);
}

export function round({ value, digits = 9 }) {
	if (!isFiniteNumber({ value })) {
		return value;
	}

	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
}

export function median({ values }) {
	if (values.length === 0) {
		return null;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[middle];
	}

	return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function minimum({ values }) {
	let result = null;
	for (const value of values) {
		result = result === null || value < result ? value : result;
	}
	return result;
}

export function maximum({ values }) {
	let result = null;
	for (const value of values) {
		result = result === null || value > result ? value : result;
	}
	return result;
}

export function incrementCount({ counts, key }) {
	counts[key] = (counts[key] ?? 0) + 1;
}

export function createIssue({ severity, code, message, sampleIndices = [] }) {
	return {
		severity,
		code,
		message,
		sampleIndices: sampleIndices.slice(0, MAX_REPORTED_SAMPLE_INDICES),
	};
}

export function hasFields({ value, fields }) {
	return isRecord({ value }) && fields.every((field) => field in value);
}

export function buildStatusHistogram({ samples }) {
	const histogram = {};
	for (const sample of samples) {
		const key =
			isRecord({ value: sample }) && "status" in sample
				? String(sample.status)
				: "missing";
		incrementCount({ counts: histogram, key });
	}
	return histogram;
}

export function pointDistance({ left, right }) {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

export function formatHistogram({ histogram }) {
	const entries = Object.entries(histogram ?? {});
	if (entries.length === 0) {
		return "none";
	}
	return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}
