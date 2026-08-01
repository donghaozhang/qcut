import { writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { writeCapCutGuiVisualCaptureManifest } from "../capcut-e2e/gui-visual-capture-manifest.js";
import {
	cleanupGuiVisualBridgeFixtures,
	createGuiVisualBridgeFixture,
	type GuiVisualBridgeFixture,
} from "./capcut-e2e-gui-visual-fixture.js";

afterEach(cleanupGuiVisualBridgeFixtures);

async function writeOracle({
	fixture,
	oracle,
}: {
	fixture: GuiVisualBridgeFixture;
	oracle: GuiVisualBridgeFixture["oracle"];
}) {
	await writeFile(
		fixture.visualOracleManifestPath,
		`${JSON.stringify(oracle, null, 2)}\n`,
		"utf8"
	);
}

function captureFixture({ fixture }: { fixture: GuiVisualBridgeFixture }) {
	return writeCapCutGuiVisualCaptureManifest({
		extractionManifestPath: fixture.extractionManifestPath,
		guiPlanPath: fixture.guiPlanPath,
		guiResultPath: fixture.guiResultPath,
		visualOracleManifestPath: fixture.visualOracleManifestPath,
	});
}

describe("CapCut GUI LUT/mask visual recomputation", () => {
	it("rejects a structurally valid but forged probe comparison", async () => {
		const fixture = await createGuiVisualBridgeFixture({
			verifiedVisuals: true,
		});
		const oracle = structuredClone(fixture.oracle);
		const probe = oracle.lutMask.comparison?.probes.find(
			({ region }) => region === "inside"
		);
		if (!probe) throw new Error("Fixture LUT/mask comparison is incomplete.");
		const [, green, blue, alpha] = probe.candidateRgba;
		probe.candidateRgba = [
			probe.candidateRgba[0] === 0 ? 1 : 0,
			green,
			blue,
			alpha,
		];
		await writeOracle({ fixture, oracle });

		await expect(captureFixture({ fixture })).rejects.toThrow(
			"comparison is not reproducible from the bound images"
		);
	});

	it("rejects an internally consistent forged failed status", async () => {
		const fixture = await createGuiVisualBridgeFixture({
			verifiedVisuals: true,
		});
		const oracle = structuredClone(fixture.oracle);
		const comparison = oracle.lutMask.comparison;
		const outsideProbe = comparison?.probes.find(
			({ region }) => region === "outside"
		);
		if (!comparison || !outsideProbe) {
			throw new Error("Fixture LUT/mask comparison is incomplete.");
		}
		outsideProbe.candidateRgba = [255, 255, 255, 255];
		outsideProbe.pass = false;
		comparison.pass = false;
		oracle.lutMask.status = "failed";
		oracle.overallStatus = "failed";
		await writeOracle({ fixture, oracle });

		await expect(captureFixture({ fixture })).rejects.toThrow(
			"comparison is not reproducible from the bound images"
		);
	});

	it("rejects text bytes masquerading as a verified capture PNG", async () => {
		const fixture = await createGuiVisualBridgeFixture({
			forgedTextLutMask: true,
			verifiedVisuals: true,
		});

		await expect(captureFixture({ fixture })).rejects.toThrow(
			"images could not be independently decoded and compared"
		);
	});
});
