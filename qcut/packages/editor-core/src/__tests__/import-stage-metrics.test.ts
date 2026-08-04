import { describe, expect, it } from "vitest";
import { ImportStageMetricsRecorder } from "../draft-interop/import-stage-metrics.js";

function createClock({ values }: { values: readonly number[] }): () => number {
	let index = 0;
	return () => {
		const value = values[index];
		index += 1;
		if (value === undefined) throw new Error("test clock exhausted");
		return value;
	};
}

describe("ImportStageMetricsRecorder", () => {
	it("aggregates repeated sync and async stages without payload data", async () => {
		const recorder = new ImportStageMetricsRecorder<"parse" | "persist">({
			now: createClock({ values: [10, 11.2344, 20, 22, 30, 33.5] }),
			phase: "runtime-plan",
		});

		expect(recorder.measureSync({ stage: "parse", run: () => "parsed" })).toBe(
			"parsed"
		);
		await expect(
			recorder.measure({ stage: "persist", run: async () => "stored" })
		).resolves.toBe("stored");
		recorder.measureSync({ stage: "parse", run: () => undefined });

		expect(recorder.snapshot()).toEqual({
			schemaVersion: 1,
			phase: "runtime-plan",
			measuredDurationMilliseconds: 6.734,
			stages: {
				parse: { durationMilliseconds: 4.734, invocationCount: 2 },
				persist: { durationMilliseconds: 2, invocationCount: 1 },
			},
		});
	});

	it("records failed stages and clamps invalid clock movement", async () => {
		const recorder = new ImportStageMetricsRecorder<"sync" | "async">({
			now: createClock({ values: [5, 4, 10, Number.POSITIVE_INFINITY] }),
			phase: "renderer-commit",
		});

		expect(() =>
			recorder.measureSync({
				stage: "sync",
				run: () => {
					throw new Error("sync failure");
				},
			})
		).toThrow("sync failure");
		await expect(
			recorder.measure({
				stage: "async",
				run: async () => {
					throw new Error("async failure");
				},
			})
		).rejects.toThrow("async failure");

		expect(recorder.snapshot()).toMatchObject({
			measuredDurationMilliseconds: 0,
			stages: {
				sync: { durationMilliseconds: 0, invocationCount: 1 },
				async: { durationMilliseconds: 0, invocationCount: 1 },
			},
		});
	});

	it("returns detached snapshots", () => {
		const recorder = new ImportStageMetricsRecorder<"parse">({
			now: createClock({ values: [0, 1] }),
			phase: "runtime-plan",
		});
		recorder.measureSync({ stage: "parse", run: () => undefined });

		const first = recorder.snapshot();
		const measurement = first.stages.parse;
		if (measurement === undefined) throw new Error("missing parse measurement");
		measurement.durationMilliseconds = 999;

		expect(recorder.snapshot().stages.parse?.durationMilliseconds).toBe(1);
	});
});
