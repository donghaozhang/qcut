import { execFile } from "node:child_process";

export const CAPCUT_GUI_APP_BUNDLE_IDENTIFIER = "com.lemon.lvoverseas";
export const CAPCUT_GUI_CODESIGN_PATH = "/usr/bin/codesign";
export const CAPCUT_GUI_APP_TEAM_IDENTIFIER = "22MMUN2RN5";
export const CAPCUT_GUI_APP_SIGNING_AUTHORITIES = [
	"Developer ID Application: BYTEDANCE PTE. LTD. (22MMUN2RN5)",
	"Developer ID Certification Authority",
	"Apple Root CA",
] as const;
export const CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT =
	'identifier "com.lemon.lvoverseas" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = "22MMUN2RN5"';

const MAXIMUM_CODESIGN_OUTPUT_BYTES = 2 * 1024 * 1024;
const CODESIGN_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;

export interface CapCutGuiAppSignatureReceipt {
	authorities: typeof CAPCUT_GUI_APP_SIGNING_AUTHORITIES;
	cdHash: string;
	codesignPath: typeof CAPCUT_GUI_CODESIGN_PATH;
	designatedRequirement: typeof CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT;
	identifier: typeof CAPCUT_GUI_APP_BUNDLE_IDENTIFIER;
	teamIdentifier: typeof CAPCUT_GUI_APP_TEAM_IDENTIFIER;
}

interface CodeSignCommandResult {
	stderr: string;
	stdout: string;
}

export type CapCutGuiCodeSignRunner = ({
	args,
	executablePath,
}: {
	args: readonly string[];
	executablePath: typeof CAPCUT_GUI_CODESIGN_PATH;
}) => Promise<CodeSignCommandResult>;

export type CapCutGuiAppSignatureInspector = ({
	canonicalAppPath,
}: {
	canonicalAppPath: string;
}) => Promise<CapCutGuiAppSignatureReceipt>;

function runCodeSign({
	args,
	executablePath,
}: {
	args: readonly string[];
	executablePath: typeof CAPCUT_GUI_CODESIGN_PATH;
}): Promise<CodeSignCommandResult> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			executablePath,
			[...args],
			{
				encoding: "utf8",
				maxBuffer: MAXIMUM_CODESIGN_OUTPUT_BYTES,
				shell: false,
				timeout: CODESIGN_TIMEOUT_MILLISECONDS,
				windowsHide: true,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(
							"CapCut does not have the required valid Apple Developer ID signature.",
							{ cause: error }
						)
					);
					return;
				}
				resolvePromise({ stderr, stdout });
			}
		);
	});
}

function normalizeRequirement({ value }: { value: string }): string {
	return value.replace(/\s+/gu, " ").trim();
}

function readSingleOutputValue({
	label,
	lines,
	prefix,
}: {
	label: string;
	lines: readonly string[];
	prefix: string;
}): string {
	const values = lines
		.filter((line) => line.startsWith(prefix))
		.map((line) => line.slice(prefix.length).trim());
	if (values.length !== 1 || !values[0]) {
		throw new Error(
			`CapCut codesign output must contain exactly one ${label}.`
		);
	}
	return values[0];
}

export function parseCapCutCodeSignOutput({
	text,
}: {
	text: string;
}): CapCutGuiAppSignatureReceipt {
	if (
		Buffer.byteLength(text, "utf8") > MAXIMUM_CODESIGN_OUTPUT_BYTES ||
		text.includes("\0")
	) {
		throw new Error("CapCut codesign output is invalid or exceeds the limit.");
	}
	const lines = text
		.split(/\r?\n/gu)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const identifier = readSingleOutputValue({
		label: "Identifier",
		lines,
		prefix: "Identifier=",
	});
	const teamIdentifier = readSingleOutputValue({
		label: "TeamIdentifier",
		lines,
		prefix: "TeamIdentifier=",
	});
	const cdHash = readSingleOutputValue({
		label: "CDHash",
		lines,
		prefix: "CDHash=",
	});
	const designatedRequirement = normalizeRequirement({
		value: readSingleOutputValue({
			label: "designated requirement",
			lines,
			prefix: "designated =>",
		}),
	});
	const authorities = lines
		.filter((line) => line.startsWith("Authority="))
		.map((line) => line.slice("Authority=".length).trim());

	if (identifier !== CAPCUT_GUI_APP_BUNDLE_IDENTIFIER) {
		throw new Error(
			`CapCut signature Identifier must be ${CAPCUT_GUI_APP_BUNDLE_IDENTIFIER}.`
		);
	}
	if (teamIdentifier !== CAPCUT_GUI_APP_TEAM_IDENTIFIER) {
		throw new Error(
			`CapCut signature TeamIdentifier must be ${CAPCUT_GUI_APP_TEAM_IDENTIFIER}.`
		);
	}
	if (designatedRequirement !== CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT) {
		throw new Error("CapCut signature designated requirement is not approved.");
	}
	if (!/^[a-f0-9]{40}$/u.test(cdHash)) {
		throw new Error("CapCut signature CDHash is invalid.");
	}
	if (
		authorities.length !== CAPCUT_GUI_APP_SIGNING_AUTHORITIES.length ||
		authorities.some(
			(authority, index) =>
				authority !== CAPCUT_GUI_APP_SIGNING_AUTHORITIES[index]
		)
	) {
		throw new Error(
			"CapCut signature must use the approved Apple Developer ID certificate chain."
		);
	}

	return {
		authorities: CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
		cdHash,
		codesignPath: CAPCUT_GUI_CODESIGN_PATH,
		designatedRequirement: CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
		identifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
		teamIdentifier: CAPCUT_GUI_APP_TEAM_IDENTIFIER,
	};
}

async function inspectCapCutAppSignatureWithRunner({
	canonicalAppPath,
	run,
}: {
	canonicalAppPath: string;
	run: CapCutGuiCodeSignRunner;
}): Promise<CapCutGuiAppSignatureReceipt> {
	await run({
		args: [
			"--verify",
			"--deep",
			"--strict",
			"--test-requirement",
			`=${CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT}`,
			canonicalAppPath,
		],
		executablePath: CAPCUT_GUI_CODESIGN_PATH,
	});
	const display = await run({
		args: ["--display", "--verbose=4", "--requirements", "-", canonicalAppPath],
		executablePath: CAPCUT_GUI_CODESIGN_PATH,
	});
	return parseCapCutCodeSignOutput({
		text: `${display.stdout}\n${display.stderr}`,
	});
}

export async function inspectCapCutAppSignature({
	canonicalAppPath,
}: {
	canonicalAppPath: string;
}): Promise<CapCutGuiAppSignatureReceipt> {
	return inspectCapCutAppSignatureWithRunner({
		canonicalAppPath,
		run: runCodeSign,
	});
}

export const capCutGuiAppSignatureTesting = Object.freeze({
	inspectCapCutAppSignatureWithRunner,
});
