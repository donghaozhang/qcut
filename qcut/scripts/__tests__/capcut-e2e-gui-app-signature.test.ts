import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	capCutGuiAppProfileTesting,
	inspectCapCutApp,
} from "../capcut-e2e/gui-regression-app-profile.js";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
	CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
	CAPCUT_GUI_APP_TEAM_IDENTIFIER,
	CAPCUT_GUI_CODESIGN_PATH,
	capCutGuiAppSignatureTesting,
	parseCapCutCodeSignOutput,
	type CapCutGuiCodeSignRunner,
} from "../capcut-e2e/gui-regression-app-signature.js";
import {
	cleanupGuiFixtures,
	createGuiFixture,
} from "./capcut-e2e-gui-fixture.js";
import { FIXTURE_CAPCUT_SIGNATURE_RECEIPT } from "./capcut-e2e-gui-app-fixture.js";

afterEach(cleanupGuiFixtures);

function createCodeSignOutput({
	authorities = CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
	cdHash = "0123456789abcdef0123456789abcdef01234567",
	designatedRequirement = CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
	identifier = CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	teamIdentifier = CAPCUT_GUI_APP_TEAM_IDENTIFIER,
}: {
	authorities?: readonly string[];
	cdHash?: string;
	designatedRequirement?: string;
	identifier?: string;
	teamIdentifier?: string;
} = {}): string {
	return [
		`Identifier=${identifier}`,
		`CDHash=${cdHash}`,
		...authorities.map((authority) => `Authority=${authority}`),
		`TeamIdentifier=${teamIdentifier}`,
		`designated => ${designatedRequirement}`,
	].join("\n");
}

describe("CapCut GUI Apple Developer ID signature", () => {
	it("rejects the unsigned fixture through the production inspector", async () => {
		const fixture = await createGuiFixture();

		await expect(
			inspectCapCutApp({ capCutAppPath: fixture.appPath })
		).rejects.toThrow("required valid Apple Developer ID signature");
	});

	it("binds the approved signature receipt and absolute codesign commands", async () => {
		const run = vi.fn<CapCutGuiCodeSignRunner>(async () => ({
			stderr: createCodeSignOutput(),
			stdout: "",
		}));

		const receipt =
			await capCutGuiAppSignatureTesting.inspectCapCutAppSignatureWithRunner({
				canonicalAppPath: "/Applications/CapCut.app",
				run,
			});

		expect(receipt).toEqual(FIXTURE_CAPCUT_SIGNATURE_RECEIPT);
		expect(run).toHaveBeenCalledTimes(2);
		expect(run.mock.calls[0]?.[0]).toEqual({
			args: [
				"--verify",
				"--deep",
				"--strict",
				"--test-requirement",
				`=${CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT}`,
				"/Applications/CapCut.app",
			],
			executablePath: CAPCUT_GUI_CODESIGN_PATH,
		});
		expect(run.mock.calls[1]?.[0]).toEqual({
			args: [
				"--display",
				"--verbose=4",
				"--requirements",
				"-",
				"/Applications/CapCut.app",
			],
			executablePath: CAPCUT_GUI_CODESIGN_PATH,
		});
	});

	it.each([
		{
			expectedMessage: "signature Identifier",
			output: createCodeSignOutput({ identifier: "example.fake" }),
		},
		{
			expectedMessage: "signature TeamIdentifier",
			output: createCodeSignOutput({ teamIdentifier: "WRONGTEAM1" }),
		},
		{
			expectedMessage: "designated requirement",
			output: createCodeSignOutput({
				designatedRequirement: 'identifier "com.lemon.lvoverseas"',
			}),
		},
		{
			expectedMessage: "Developer ID certificate chain",
			output: createCodeSignOutput({
				authorities: [
					"Apple Development: Fake (22MMUN2RN5)",
					"Apple Worldwide Developer Relations Certification Authority",
					"Apple Root CA",
				],
			}),
		},
		{
			expectedMessage: "CDHash is invalid",
			output: createCodeSignOutput({ cdHash: "not-a-cdhash" }),
		},
		{
			expectedMessage: "exactly one Identifier",
			output: `${createCodeSignOutput()}\nIdentifier=${CAPCUT_GUI_APP_BUNDLE_IDENTIFIER}`,
		},
	])("rejects unapproved or ambiguous codesign output", ({
		expectedMessage,
		output,
	}) => {
		expect(() => parseCapCutCodeSignOutput({ text: output })).toThrow(
			expectedMessage
		);
	});

	it("rejects malformed display output after successful verification", async () => {
		let callCount = 0;
		const run = vi.fn(async () => {
			callCount += 1;
			return callCount === 1
				? { stderr: "valid on disk", stdout: "" }
				: { stderr: "Identifier=com.lemon.lvoverseas", stdout: "" };
		});

		await expect(
			capCutGuiAppSignatureTesting.inspectCapCutAppSignatureWithRunner({
				canonicalAppPath: "/Applications/CapCut.app",
				run,
			})
		).rejects.toThrow("exactly one TeamIdentifier");
	});

	it("rejects an executable mutation during signature verification", async () => {
		const fixture = await createGuiFixture();
		const executablePath = join(fixture.appPath, "Contents", "MacOS", "CapCut");

		await expect(
			capCutGuiAppProfileTesting.inspectCapCutAppWithSignatureInspector({
				capCutAppPath: fixture.appPath,
				inspectSignature: async () => {
					await writeFile(executablePath, "mutated-during-codesign", {
						encoding: "utf8",
						mode: 0o755,
					});
					return FIXTURE_CAPCUT_SIGNATURE_RECEIPT;
				},
			})
		).rejects.toThrow("executable changed while verifying");
	});
});
