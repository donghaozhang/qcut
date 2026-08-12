import { describe, expect, it } from "vitest";
import {
	bootstrapSingleLutIntensity,
	parseNativeSingleLutArgs,
} from "../jianying-filter-parity/run-native-single-lut";

const SCRIPT = `function SeekModeScript:onStart(comp, sys)
    self.filterMaterial = comp.entity.scene:findEntityBy("filter"):getComponent("MeshRenderer").material
end
function SeekModeScript:onEvent(sys, event)
    if "intensity" == event.args:get(0) then
        local intensity = event.args:get(1)
        self.filterMaterial:setFloat("uniAlpha",intensity)
    end
end`;

describe("native single-LUT parity runner", () => {
	it("bootstraps the one observed material and uniform", () => {
		expect(bootstrapSingleLutIntensity({ source: SCRIPT })).toContain(
			'self.filterMaterial:setFloat("uniAlpha", 1.0)'
		);
	});

	it("rejects ambiguous intensity events", () => {
		expect(() =>
			bootstrapSingleLutIntensity({ source: `${SCRIPT}\n${SCRIPT}` })
		).toThrow(/missing or ambiguous/);
	});

	it("caps concurrency at six", () => {
		expect(() =>
			parseNativeSingleLutArgs({
				argv: [
					"--source",
					"source.ppm",
					"--run-dir",
					"run",
					"--concurrency",
					"7",
				],
			})
		).toThrow(/from 1 to 6/);
	});
});
