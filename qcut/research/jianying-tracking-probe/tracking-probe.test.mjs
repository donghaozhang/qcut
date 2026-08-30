import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeTrackingBundle } from "./tracking-probe-core.mjs";

const CLI_PATH = new URL("./tracking-probe.mjs", import.meta.url);

function makePlanarSample({
	pts = 0,
	status = 0,
	corners = [
		[0.35, 0.35],
		[0.35, 0.65],
		[0.65, 0.65],
		[0.65, 0.35],
	],
} = {}) {
	return {
		p_x1: corners[0][0],
		p_y1: corners[0][1],
		p_x2: corners[1][0],
		p_y2: corners[1][1],
		p_x3: corners[2][0],
		p_y3: corners[2][1],
		p_x4: corners[3][0],
		p_y4: corners[3][1],
		pts,
		status,
	};
}

function makeMotionSample({
	pts = 0,
	status = 1,
	left = 0.2,
	top = 0.3,
	right = 0.4,
	bottom = 0.6,
	angle = 0,
} = {}) {
	return { angle, bottom, left, pts, right, status, top };
}

function makePayload({ samples, baseline = [] }) {
	return { baseline, data: samples };
}

function findIssue({ report, code }) {
	return report.issues.find((issue) => issue.code === code);
}

test("classifies and validates a synthetic planar track", () => {
	const report = analyzeTrackingBundle({
		desc: { resType: 4, startTime: 0, endTime: 33_333, baselinePts: [] },
		data: makePayload({
			samples: [
				makePlanarSample({ pts: 0 }),
				makePlanarSample({
					pts: 33_333,
					corners: [
						[0.34, 0.36],
						[0.33, 0.66],
						[0.67, 0.64],
						[0.66, 0.34],
					],
				}),
			],
		}),
	});

	assert.equal(report.classification.kind, "planar");
	assert.equal(report.classification.confidence, "strong");
	assert.equal(report.analysis.valid, 2);
	assert.equal(report.analysis.invalid, 0);
	assert.equal(report.analysis.geometry.cornerOrder.join(","), "p1,p2,p3,p4");
	assert.equal(report.outcome.valid, true);
});

test("rejects an all-zero planar sentinel even when status is zero", () => {
	const report = analyzeTrackingBundle({
		desc: { resType: 4 },
		data: makePayload({
			samples: [
				makePlanarSample({
					status: 0,
					corners: [
						[0, 0],
						[0, 0],
						[0, 0],
						[0, 0],
					],
				}),
			],
		}),
	});

	assert.equal(report.analysis.invalid, 1);
	assert.equal(report.analysis.invalidReasonCounts["zero-sentinel"], 1);
	assert.ok(findIssue({ report, code: "planar-zero-sentinel" }));
	assert.equal(report.outcome.valid, false);
});

test("reports when the same status appears on valid and invalid planar geometry", () => {
	const report = analyzeTrackingBundle({
		data: makePayload({
			samples: [
				makePlanarSample({ pts: 0, status: 0 }),
				makePlanarSample({
					pts: 33_333,
					status: 0,
					corners: [
						[0, 0],
						[0, 0],
						[0, 0],
						[0, 0],
					],
				}),
			],
		}),
	});

	assert.ok(findIssue({ report, code: "status-does-not-determine-validity" }));
});

test("rejects a self-intersecting planar quad", () => {
	const report = analyzeTrackingBundle({
		data: makePayload({
			samples: [
				makePlanarSample({
					corners: [
						[0.2, 0.2],
						[0.8, 0.8],
						[0.2, 0.8],
						[0.8, 0.2],
					],
				}),
			],
		}),
	});

	assert.equal(report.analysis.invalidReasonCounts["self-intersection"], 1);
	assert.equal(report.outcome.valid, false);
});

test("validates processed motion samples and dense cache separately", () => {
	const baselineMarker = makeMotionSample({
		pts: 16_667,
		status: 4,
		top: 0.5,
		bottom: 0.4,
	});
	const report = analyzeTrackingBundle({
		desc: { resType: 1, startTime: -1, endTime: 33_333 },
		data: makePayload({
			samples: [
				makeMotionSample({ pts: 0 }),
				baselineMarker,
				makeMotionSample({ pts: 33_333, left: 0.21 }),
			],
			baseline: [baselineMarker],
		}),
		cache: {
			image_width: 720,
			image_height: 1280,
			lockon_box: [0.2, 0.3, 0.4, 0.6],
			track_boxes: [
				[0, [144, 384, 288, 768]],
				[1 / 30, [145, 384, 289, 768]],
			],
		},
	});

	assert.equal(report.classification.kind, "motion");
	assert.equal(report.analysis.valid, 2);
	assert.equal(report.analysis.evaluated, 2);
	assert.equal(report.analysis.control, 1);
	assert.equal(report.analysis.baseline.count, 1);
	assert.equal(report.analysis.denseCache.valid, 2);
	assert.ok(findIssue({ report, code: "motion-baseline-mirror" }));
	assert.equal(report.outcome.valid, true);
});

test("rejects a motion rectangle with reversed horizontal bounds", () => {
	const report = analyzeTrackingBundle({
		data: makePayload({
			samples: [makeMotionSample({ left: 0.6, right: 0.4 })],
		}),
	});

	assert.equal(report.analysis.invalidReasonCounts["non-positive-width"], 1);
	assert.ok(findIssue({ report, code: "motion-invalid-samples" }));
});

test("uses sample fields over a contradictory resType hint", () => {
	const report = analyzeTrackingBundle({
		desc: { resType: 1 },
		data: makePayload({ samples: [makePlanarSample()] }),
	});

	assert.equal(report.classification.kind, "planar");
	assert.ok(findIssue({ report, code: "descriptor-schema-conflict" }));
});

test("reports non-increasing PTS without changing geometric validity", () => {
	const report = analyzeTrackingBundle({
		data: makePayload({
			samples: [makePlanarSample({ pts: 10 }), makePlanarSample({ pts: 10 })],
		}),
	});

	assert.equal(report.analysis.valid, 2);
	assert.equal(report.pts.nonIncreasing, 1);
	assert.ok(findIssue({ report, code: "non-increasing-pts" }));
});

test("CLI runs against a synthetic bundle without Jianying", async (context) => {
	const root = await mkdtemp(path.join(tmpdir(), "tracking-probe-valid-"));
	context.after(async () => rm(root, { recursive: true, force: true }));
	const bundle = path.join(root, "planar-valid");
	await mkdir(bundle);
	await Promise.all([
		writeFile(
			path.join(bundle, "desc.json"),
			JSON.stringify({
				resType: 4,
				startTime: 0,
				endTime: 33_333,
				baselinePts: [],
			})
		),
		writeFile(
			path.join(bundle, "data.json"),
			JSON.stringify(makePayload({ samples: [makePlanarSample({ pts: 0 })] }))
		),
	]);

	const result = spawnSync(
		process.execPath,
		[CLI_PATH.pathname, "--json", root],
		{
			encoding: "utf8",
		}
	);
	const output = JSON.parse(result.stdout);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(output.summary.total, 1);
	assert.equal(output.summary.valid, 1);
	assert.equal(output.reports[0].classification.kind, "planar");
	assert.equal(output.reports[0].sourceLabel, "planar-valid");
});

test("CLI returns exit 2 for invalid geometry only when requested", async (context) => {
	const bundle = await mkdtemp(path.join(tmpdir(), "tracking-probe-invalid-"));
	context.after(async () => rm(bundle, { recursive: true, force: true }));
	await writeFile(
		path.join(bundle, "data.json"),
		JSON.stringify(
			makePayload({
				samples: [
					makePlanarSample({
						corners: [
							[0, 0],
							[0, 0],
							[0, 0],
							[0, 0],
						],
					}),
				],
			})
		)
	);

	const permissive = spawnSync(process.execPath, [CLI_PATH.pathname, bundle], {
		encoding: "utf8",
	});
	const strict = spawnSync(
		process.execPath,
		[CLI_PATH.pathname, "--fail-on-invalid", bundle],
		{ encoding: "utf8" }
	);

	assert.equal(permissive.status, 0, permissive.stderr);
	assert.equal(strict.status, 2, strict.stderr);
	assert.match(strict.stdout, /planar-zero-sentinel/);
});
