import {
	buildStatusHistogram,
	createIssue,
	hasFields,
	incrementCount,
	isFiniteNumber,
	isRecord,
	MAX_REPORTED_SAMPLE_INDICES,
	MOTION_FIELDS,
	maximum,
	median,
	minimum,
	pointDistance,
	round,
} from "./tracking-probe-shared.mjs";

function validateMotionSample({ sample, epsilon }) {
	if (!hasFields({ value: sample, fields: MOTION_FIELDS })) {
		return { valid: false, reasons: ["missing-fields"] };
	}

	const values = MOTION_FIELDS.map((field) => sample[field]);
	if (values.some((value) => !isFiniteNumber({ value }))) {
		return { valid: false, reasons: ["non-finite"] };
	}

	const width = sample.right - sample.left;
	const height = sample.bottom - sample.top;
	const reasons = [];
	if (width <= epsilon) {
		reasons.push("non-positive-width");
	}
	if (height <= epsilon) {
		reasons.push("non-positive-height");
	}

	return {
		valid: reasons.length === 0,
		reasons,
		width,
		height,
		area: width * height,
		center: {
			x: (sample.left + sample.right) / 2,
			y: (sample.top + sample.bottom) / 2,
		},
		outsideNormalizedRange: values.some(
			(value) => value < -epsilon || value > 1 + epsilon,
		),
	};
}

function motionSamplesEquivalent({ left, right }) {
	if (!isRecord({ value: left }) || !isRecord({ value: right })) {
		return false;
	}

	const comparedFields = [...MOTION_FIELDS, "angle", "pts", "status"];
	return comparedFields.every((field) => Object.is(left[field], right[field]));
}

function summarizeCacheEntry({ entry }) {
	if (!entry) {
		return null;
	}

	return {
		index: entry.index,
		timeSeconds: round({ value: entry.timeSeconds, digits: 6 }),
		box: entry.box.map((value) => round({ value, digits: 6 })),
	};
}

function summarizeMotionCache({ cache, epsilon, issues }) {
	if (!isRecord({ value: cache })) {
		return null;
	}

	const boxes = Array.isArray(cache.track_boxes) ? cache.track_boxes : [];
	const invalidIndices = [];
	const validEntries = [];

	for (const [index, entry] of boxes.entries()) {
		const timeSeconds = Array.isArray(entry) ? entry[0] : null;
		const box = Array.isArray(entry) ? entry[1] : null;
		if (
			!isFiniteNumber({ value: timeSeconds }) ||
			!Array.isArray(box) ||
			box.length !== 4 ||
			box.some((value) => !isFiniteNumber({ value })) ||
			box[2] - box[0] <= epsilon ||
			box[3] - box[1] <= epsilon
		) {
			invalidIndices.push(index);
			continue;
		}
		validEntries.push({ index, timeSeconds, box });
	}

	if (invalidIndices.length > 0) {
		issues.push(
			createIssue({
				severity: "error",
				code: "motion-cache-invalid-boxes",
				message: `${invalidIndices.length}/${boxes.length} dense cache boxes are invalid`,
				sampleIndices: invalidIndices,
			}),
		);
	}

	return {
		imageWidth: isFiniteNumber({ value: cache.image_width })
			? cache.image_width
			: null,
		imageHeight: isFiniteNumber({ value: cache.image_height })
			? cache.image_height
			: null,
		lockonBox: Array.isArray(cache.lockon_box)
			? cache.lockon_box.map((value) =>
					isFiniteNumber({ value }) ? round({ value }) : value,
				)
			: null,
		total: boxes.length,
		valid: validEntries.length,
		invalid: invalidIndices.length,
		invalidIndices: invalidIndices.slice(0, MAX_REPORTED_SAMPLE_INDICES),
		first: summarizeCacheEntry({ entry: validEntries[0] }),
		last: summarizeCacheEntry({ entry: validEntries.at(-1) }),
	};
}

export function summarizeMotion({ samples, baseline, cache, epsilon, issues }) {
	const invalidReasonCounts = {};
	const invalidSamples = [];
	const validSamples = [];
	const controlSamples = [];
	const outOfRangeIndices = [];

	for (const [index, sample] of samples.entries()) {
		const mirrorsBaseline = baseline.some((baselineSample) =>
			motionSamplesEquivalent({ left: sample, right: baselineSample }),
		);
		if (mirrorsBaseline) {
			controlSamples.push({
				index,
				pts: sample?.pts ?? null,
				reason: "mirrors-baseline",
			});
			continue;
		}

		const result = validateMotionSample({ sample, epsilon });
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
				code: "motion-invalid-samples",
				message: `${invalidSamples.length}/${samples.length} motion samples have invalid rectangles`,
				sampleIndices: invalidSamples.map(({ index }) => index),
			}),
		);
	}

	if (outOfRangeIndices.length > 0) {
		issues.push(
			createIssue({
				severity: "warning",
				code: "motion-outside-normalized-range",
				message: `${outOfRangeIndices.length} valid rectangles contain coordinates outside [0, 1]`,
				sampleIndices: outOfRangeIndices,
			}),
		);
	}

	if (controlSamples.length > 0) {
		issues.push(
			createIssue({
				severity: "info",
				code: "motion-baseline-mirror",
				message: `${controlSamples.length} data samples mirror baseline records and were excluded from rectangle validation`,
				sampleIndices: controlSamples.map(({ index }) => index),
			}),
		);
	}

	let maximumCenterJump = null;
	for (let index = 1; index < validSamples.length; index += 1) {
		const previous = validSamples[index - 1];
		const current = validSamples[index];
		const jump = pointDistance({
			left: previous.center,
			right: current.center,
		});
		if (!maximumCenterJump || jump > maximumCenterJump.distance) {
			maximumCenterJump = {
				distance: round({ value: jump }),
				fromSampleIndex: previous.index,
				toSampleIndex: current.index,
			};
		}
	}

	const areas = validSamples.map(({ area }) => area);
	const nonZeroAngles = samples.filter(
		(sample) =>
			isFiniteNumber({ value: sample?.angle }) &&
			Math.abs(sample.angle) > epsilon,
	).length;

	return {
		total: samples.length,
		evaluated: validSamples.length + invalidSamples.length,
		control: controlSamples.length,
		valid: validSamples.length,
		invalid: invalidSamples.length,
		invalidReasonCounts,
		invalidSamples: invalidSamples.slice(0, MAX_REPORTED_SAMPLE_INDICES),
		controlSamples: controlSamples.slice(0, MAX_REPORTED_SAMPLE_INDICES),
		statusHistogram: buildStatusHistogram({ samples }),
		baseline: {
			count: baseline.length,
			statusHistogram: buildStatusHistogram({ samples: baseline }),
			note: "baseline records are reported separately and are not validated as ordinary rectangles",
		},
		geometry: {
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
			maximumCenterJump,
			nonZeroAngles,
		},
		denseCache: summarizeMotionCache({ cache, epsilon, issues }),
	};
}
