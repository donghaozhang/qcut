import { describe, expect, it } from "vitest";
import { buildDissolveFramePlan } from "../capcut-e2e/visual-frame-plan.js";
import { parseVisualOracleArgs } from "../capcut-e2e/visual-oracle.js";

describe("CapCut E2E dissolve visual frame plan", () => {
	it("records N, k, and concrete zero/one-based candidate frame numbers", () => {
		const plan = buildDissolveFramePlan({
			fps: 30,
			intervalEvidence: null,
			intervalReason: "No numbered export is available.",
			intervalSource: "expected-seam-candidate",
			intervalStatus: "unverified",
			transitionDurationMicroseconds: 466_666,
			transitionFrameCount: 14,
			transitionStartFrameIndex: 83,
		});
		expect(plan.sampleFormula).toBe("k=round(p*(N-1))");
		expect(plan.transitionFrameCount).toBe(14);
		expect(plan.samples.map(({ frameOffset }) => frameOffset)).toEqual([
			0, 3, 7, 10, 13,
		]);
		expect(
			plan.samples.map(({ timelineFrameIndex }) => timelineFrameIndex)
		).toEqual([83, 86, 90, 93, 96]);
		expect(
			plan.samples.map(({ timelineFrameNumber }) => timelineFrameNumber)
		).toEqual([84, 87, 91, 94, 97]);
		expect(
			plan.samples.map(({ transitionFrameNumber }) => transitionFrameNumber)
		).toEqual([1, 4, 8, 11, 14]);
		expect(
			plan.samples.map(({ realizedProgress }) => realizedProgress)
		).toEqual([0, 0.230769231, 0.538461538, 0.769230769, 1]);
		expect(plan.intervalStatus).toBe("unverified");
	});

	it("cannot call an interval verified without capture-discovered file evidence", () => {
		expect(() =>
			buildDissolveFramePlan({
				fps: 30,
				intervalEvidence: null,
				intervalReason: "Claimed export interval.",
				intervalSource: "capture-discovered",
				intervalStatus: "verified",
				transitionDurationMicroseconds: 466_666,
				transitionFrameCount: 14,
				transitionStartFrameIndex: 83,
			})
		).toThrow("requires capture-discovered file evidence");
	});

	it("rejects arbitrary files presented as discovered interval evidence", () => {
		expect(() =>
			parseVisualOracleArgs({
				args: [
					"--run-id",
					"visual-run",
					"--captures",
					"captures",
					"--transition-start-frame-index",
					"82",
					"--transition-frame-count",
					"15",
					"--transition-interval-evidence",
					"arbitrary-file.txt",
				],
			})
		).toThrow(
			"disabled until numbered-export evidence has a strict parsed schema"
		);
	});

	it("rejects a partial interval claim", () => {
		expect(() =>
			parseVisualOracleArgs({
				args: ["--run-id", "visual-run", "--transition-frame-count", "14"],
			})
		).toThrow("must be supplied together");
	});
});
