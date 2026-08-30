import {
	buildStatusHistogram,
	createIssue,
	hasFields,
	incrementCount,
	isFiniteNumber,
	MAX_REPORTED_SAMPLE_INDICES,
	maximum,
	median,
	minimum,
	PLANAR_FIELDS,
	pointDistance,
	round,
} from "./tracking-probe-shared.mjs";

function signedPolygonArea({ points }) {
	let doubledArea = 0;
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		doubledArea += current.x * next.y - next.x * current.y;
	}
	return doubledArea / 2;
}

function orientation({ left, middle, right, epsilon }) {
	const cross =
		(middle.y - left.y) * (right.x - middle.x) -
		(middle.x - left.x) * (right.y - middle.y);

	if (Math.abs(cross) <= epsilon) {
		return 0;
	}
	return cross > 0 ? 1 : -1;
}

function isPointOnSegment({ left, middle, right, epsilon }) {
	return (
		middle.x <= Math.max(left.x, right.x) + epsilon &&
		middle.x + epsilon >= Math.min(left.x, right.x) &&
		middle.y <= Math.max(left.y, right.y) + epsilon &&
		middle.y + epsilon >= Math.min(left.y, right.y)
	);
}

function segmentsIntersect({
	firstStart,
	firstEnd,
	secondStart,
	secondEnd,
	epsilon,
}) {
	const firstOrientation = orientation({
		left: firstStart,
		middle: firstEnd,
		right: secondStart,
		epsilon,
	});
	const secondOrientation = orientation({
		left: firstStart,
		middle: firstEnd,
		right: secondEnd,
		epsilon,
	});
	const thirdOrientation = orientation({
		left: secondStart,
		middle: secondEnd,
		right: firstStart,
		epsilon,
	});
	const fourthOrientation = orientation({
		left: secondStart,
		middle: secondEnd,
		right: firstEnd,
		epsilon,
	});

	if (
		firstOrientation !== secondOrientation &&
		thirdOrientation !== fourthOrientation &&
		firstOrientation !== 0 &&
		secondOrientation !== 0 &&
		thirdOrientation !== 0 &&
		fourthOrientation !== 0
	) {
		return true;
	}

	return (
		(firstOrientation === 0 &&
			isPointOnSegment({
				left: firstStart,
				middle: secondStart,
				right: firstEnd,
				epsilon,
			})) ||
		(secondOrientation === 0 &&
			isPointOnSegment({
				left: firstStart,
				middle: secondEnd,
				right: firstEnd,
				epsilon,
			})) ||
		(thirdOrientation === 0 &&
			isPointOnSegment({
				left: secondStart,
				middle: firstStart,
				right: secondEnd,
				epsilon,
			})) ||
		(fourthOrientation === 0 &&
			isPointOnSegment({
				left: secondStart,
				middle: firstEnd,
				right: secondEnd,
				epsilon,
			}))
	);
}

function isSelfIntersectingQuad({ points, epsilon }) {
	return (
		segmentsIntersect({
			firstStart: points[0],
			firstEnd: points[1],
			secondStart: points[2],
			secondEnd: points[3],
			epsilon,
		}) ||
		segmentsIntersect({
			firstStart: points[1],
			firstEnd: points[2],
			secondStart: points[3],
			secondEnd: points[0],
			epsilon,
		})
	);
}

function extractPlanarPoints({ sample }) {
	return [1, 2, 3, 4].map((pointIndex) => ({
		x: sample[`p_x${pointIndex}`],
		y: sample[`p_y${pointIndex}`],
	}));
}

function validatePlanarSample({ sample, epsilon, minimumArea }) {
	if (!hasFields({ value: sample, fields: PLANAR_FIELDS })) {
		return {
			valid: false,
			reasons: ["missing-fields"],
			points: null,
			area: null,
		};
	}

	const points = extractPlanarPoints({ sample });
	if (
		points.some(
			({ x, y }) =>
				!isFiniteNumber({ value: x }) || !isFiniteNumber({ value: y })
		)
	) {
		return { valid: false, reasons: ["non-finite"], points, area: null };
	}

	const reasons = [];
	const allZero = points.every(
		({ x, y }) => Math.abs(x) <= epsilon && Math.abs(y) <= epsilon
	);
	if (allZero) {
		reasons.push("zero-sentinel");
	}

	const area = signedPolygonArea({ points });
	if (Math.abs(area) < minimumArea) {
		reasons.push("degenerate-area");
	}
	if (isSelfIntersectingQuad({ points, epsilon })) {
		reasons.push("self-intersection");
	}

	const edgeLengths = points.map((point, index) =>
		pointDistance({ left: point, right: points[(index + 1) % points.length] })
	);
	if (edgeLengths.some((length) => length <= epsilon)) {
		reasons.push("collapsed-edge");
	}

	return {
		valid: reasons.length === 0,
		reasons: [...new Set(reasons)],
		points,
		area,
		edgeLengths,
		outsideNormalizedRange: points.some(
			({ x, y }) =>
				x < -epsilon || x > 1 + epsilon || y < -epsilon || y > 1 + epsilon
		),
	};
}

function summarizeValidPlanarSample({ entry }) {
	if (!entry) {
		return null;
	}

	return {
		index: entry.index,
		pts: entry.sample.pts ?? null,
		corners: entry.points.map(({ x, y }) => ({
			x: round({ value: x }),
			y: round({ value: y }),
		})),
		signedArea: round({ value: entry.area }),
	};
}

export function summarizePlanar({ samples, epsilon, minimumArea, issues }) {
	const invalidReasonCounts = {};
	const invalidSamples = [];
	const validSamples = [];
	const outOfRangeIndices = [];

	for (const [index, sample] of samples.entries()) {
		const result = validatePlanarSample({ sample, epsilon, minimumArea });
		if (!result.valid) {
			invalidSamples.push({
				index,
				pts: sample?.pts ?? null,
				reasons: result.reasons,
			});
			for (const reason of result.reasons) {
				incrementCount({ counts: invalidReasonCounts, key: reason });
			}
			continue;
		}

		if (result.outsideNormalizedRange) {
			outOfRangeIndices.push(index);
		}
		validSamples.push({ index, sample, ...result });
	}

	if (invalidSamples.length > 0) {
		issues.push(
			createIssue({
				severity: "error",
				code: "planar-invalid-samples",
				message: `${invalidSamples.length}/${samples.length} planar samples have invalid geometry`,
				sampleIndices: invalidSamples.map(({ index }) => index),
			})
		);
	}

	if ((invalidReasonCounts["zero-sentinel"] ?? 0) > 0) {
		issues.push(
			createIssue({
				severity: "error",
				code: "planar-zero-sentinel",
				message: `${invalidReasonCounts["zero-sentinel"]} samples contain an all-zero quad`,
				sampleIndices: invalidSamples
					.filter(({ reasons }) => reasons.includes("zero-sentinel"))
					.map(({ index }) => index),
			})
		);
	}

	if (outOfRangeIndices.length > 0) {
		issues.push(
			createIssue({
				severity: "warning",
				code: "planar-outside-normalized-range",
				message: `${outOfRangeIndices.length} valid quads contain coordinates outside [0, 1]`,
				sampleIndices: outOfRangeIndices,
			})
		);
	}

	const areas = validSamples.map(({ area }) => Math.abs(area));
	const orientationHistogram = { positive: 0, negative: 0 };
	for (const { area } of validSamples) {
		incrementCount({
			counts: orientationHistogram,
			key: area >= 0 ? "positive" : "negative",
		});
	}

	let maximumCornerJump = null;
	for (let index = 1; index < validSamples.length; index += 1) {
		const previous = validSamples[index - 1];
		const current = validSamples[index];
		const jump = Math.max(
			...current.points.map((point, pointIndex) =>
				pointDistance({ left: previous.points[pointIndex], right: point })
			)
		);
		if (!maximumCornerJump || jump > maximumCornerJump.distance) {
			maximumCornerJump = {
				distance: round({ value: jump }),
				fromSampleIndex: previous.index,
				toSampleIndex: current.index,
			};
		}
	}

	const invalidIndexSet = new Set(invalidSamples.map(({ index }) => index));
	const statusesWithValidity = new Map();
	for (const [index, sample] of samples.entries()) {
		const status = String(sample?.status ?? "missing");
		const entry = statusesWithValidity.get(status) ?? { valid: 0, invalid: 0 };
		const isInvalid = invalidIndexSet.has(index);
		incrementCount({ counts: entry, key: isInvalid ? "invalid" : "valid" });
		statusesWithValidity.set(status, entry);
	}

	for (const [status, counts] of statusesWithValidity.entries()) {
		if (counts.valid > 0 && counts.invalid > 0) {
			issues.push(
				createIssue({
					severity: "warning",
					code: "status-does-not-determine-validity",
					message: `status=${status} appears on both valid and invalid planar samples`,
				})
			);
		}
	}

	return {
		total: samples.length,
		evaluated: samples.length,
		control: 0,
		valid: validSamples.length,
		invalid: invalidSamples.length,
		invalidReasonCounts,
		invalidSamples: invalidSamples.slice(0, MAX_REPORTED_SAMPLE_INDICES),
		statusHistogram: buildStatusHistogram({ samples }),
		geometry: {
			cornerOrder: ["p1", "p2", "p3", "p4"],
			area: {
				minimum:
					areas.length > 0
						? round({ value: minimum({ values: areas }) })
						: null,
				median:
					areas.length > 0 ? round({ value: median({ values: areas }) }) : null,
				maximum:
					areas.length > 0
						? round({ value: maximum({ values: areas }) })
						: null,
			},
			signedAreaOrientation: orientationHistogram,
			maximumCornerJump,
			firstValidSample: summarizeValidPlanarSample({ entry: validSamples[0] }),
			lastValidSample: summarizeValidPlanarSample({
				entry: validSamples.at(-1),
			}),
		},
	};
}
