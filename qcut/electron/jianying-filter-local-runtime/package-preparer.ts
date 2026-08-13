import { createHash } from "node:crypto";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SCRIPT_RELATIVE_PATH = path.join(
	"AmazingFeature",
	"lua",
	"SeekModeScript.lua"
);

interface ScriptBootstrapProfile {
	kind: "script-bootstrap";
	version: string;
	scriptSha256: string;
	bootstrap: ({
		source,
		intensity,
	}: {
		source: string;
		intensity: number;
	}) => string;
}

interface UnchangedPackageProfile {
	kind: "unchanged-package";
	version: string;
	packageSha256: string;
}

type NativeMultiPassProfile = ScriptBootstrapProfile | UnchangedPackageProfile;

function replaceExactlyOnce({
	source,
	needle,
	replacement,
}: {
	source: string;
	needle: string;
	replacement: string;
}) {
	const first = source.indexOf(needle);
	if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
		throw new Error("Native filter bootstrap anchor is missing or ambiguous");
	}
	return `${source.slice(0, first)}${replacement}${source.slice(first + needle.length)}`;
}

function numberLiteral({ value }: { value: number }) {
	return String(Number(value.toFixed(6)));
}

const MULTI_PASS_PROFILES: Readonly<Record<string, NativeMultiPassProfile>> = {
	"7403664041945681191": {
		kind: "script-bootstrap",
		version: "59f14f9555fc38667c3ddb0814346cc8",
		scriptSha256:
			"79a632e90eb31fea308a9bde0af3effdb4eb7774310bd4bdd0c533765ddbf9e0",
		bootstrap: ({ source, intensity }) => {
			const anchor =
				'    self.pass0Material = comp.entity.scene:findEntityBy("sharp"):getComponent("MeshRenderer").material\n';
			const literal = numberLiteral({ value: intensity });
			return replaceExactlyOnce({
				source,
				needle: anchor,
				replacement: `${anchor}    self.pass0Material:setFloat("u_sharpness", ${literal})\n    self.filterMaterial:setFloat("intensity", ${literal})\n`,
			});
		},
	},
	"7647099764940557618": {
		kind: "script-bootstrap",
		version: "29fec8019c1c3fb2e4d8606e10ebb39d",
		scriptSha256:
			"e15e1a7f190162aacfd2426d55049815fd06aa1aa57c4779ce9ccfe2fff69945",
		bootstrap: ({ source, intensity }) =>
			replaceExactlyOnce({
				source,
				needle: "    data.intensity = 1\n",
				replacement: `    data.intensity = ${numberLiteral({ value: intensity })}\n`,
			}),
	},
	"7160594413847203085": {
		kind: "script-bootstrap",
		version: "e745e131cff1db913aea07f4098ec8de",
		scriptSha256:
			"3e31309e74c274703ba5ef68c095fb1808ebbf502e2dc4ea599a69e9b6e75270",
		bootstrap: ({ source, intensity }) => {
			const anchor =
				'    self.pass2Material = comp.entity:getComponent("MeshRenderer").material\n';
			const blur = numberLiteral({ value: intensity * 3.6 });
			const screen = numberLiteral({ value: 1 - intensity * 0.5 });
			const lut = numberLiteral({ value: intensity });
			return replaceExactlyOnce({
				source,
				needle: anchor,
				replacement: `${anchor}    self.pass2Material:setFloat("intensity", ${screen})\n    self.pass0Material:setFloat("blurSize", ${blur})\n    self.pass1Material:setFloat("blurSize", ${blur})\n    self.filterMaterial:setFloat("intensity", ${lut})\n`,
			});
		},
	},
	"7447126702137904420": {
		kind: "unchanged-package",
		version: "9673f80b8e2f5a07f02f9ce1130b784a",
		packageSha256:
			"9db2974298a914c4a465c4fc42a1e797f4c2e416bd2d9442d2ab57174526f971",
	},
};

export interface PreparedJianyingMultiPassPackage {
	packagePath: string;
	resourceId: string;
	version: string;
	intensity: number;
	outputBlendIntensity?: number;
}

function compareFileNames({ left, right }: { left: string; right: string }) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

async function listPackageFiles({
	root,
	directory = root,
	relativeDirectory = "",
}: {
	root: string;
	directory?: string;
	relativeDirectory?: string;
}): Promise<string[]> {
	const entries = (await readdir(directory, { withFileTypes: true })).sort(
		(left, right) => compareFileNames({ left: left.name, right: right.name })
	);
	const files: string[] = [];
	for (const entry of entries) {
		const relativePath = relativeDirectory
			? path.posix.join(relativeDirectory, entry.name)
			: entry.name;
		const absolutePath = path.join(root, ...relativePath.split("/"));
		if (entry.isDirectory()) {
			files.push(
				...(await listPackageFiles({
					root,
					directory: absolutePath,
					relativeDirectory: relativePath,
				}))
			);
			continue;
		}
		if (!entry.isFile()) {
			throw new Error("Native multi-pass package contains unsupported entries");
		}
		files.push(relativePath);
	}
	return files;
}

async function hashPackageTree({ root }: { root: string }) {
	const hash = createHash("sha256");
	for (const relativePath of await listPackageFiles({ root })) {
		hash.update(relativePath);
		hash.update("\0");
		hash.update(await readFile(path.join(root, ...relativePath.split("/"))));
		hash.update("\0");
	}
	return hash.digest("hex");
}

export function supportsJianyingNativeMultiPass({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	return MULTI_PASS_PROFILES[resourceId]?.version === version;
}

export async function prepareJianyingNativeMultiPassPackage({
	resourceId,
	packagePath,
	destinationDirectory,
	intensity,
}: {
	resourceId: string;
	packagePath: string;
	destinationDirectory: string;
	intensity: number;
}): Promise<PreparedJianyingMultiPassPackage> {
	const profile = MULTI_PASS_PROFILES[resourceId];
	if (!profile || path.basename(packagePath) !== profile.version) {
		throw new Error("Native multi-pass filter version is not verified");
	}
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100) {
		throw new Error("Native multi-pass intensity must be between 0 and 100");
	}

	let preparedScript: string | undefined;
	if (profile.kind === "script-bootstrap") {
		const sourceScript = await readFile(
			path.join(packagePath, SCRIPT_RELATIVE_PATH)
		);
		const scriptSha256 = createHash("sha256")
			.update(sourceScript)
			.digest("hex");
		if (scriptSha256 !== profile.scriptSha256) {
			throw new Error("Native multi-pass package changed since verification");
		}
		preparedScript = profile.bootstrap({
			source: sourceScript.toString("utf8"),
			intensity: intensity / 100,
		});
	} else if (
		(await hashPackageTree({ root: packagePath })) !== profile.packageSha256
	) {
		throw new Error("Native multi-pass package changed since verification");
	}

	const preparedPath = path.join(destinationDirectory, "prepared-effect");
	await cp(packagePath, preparedPath, {
		recursive: true,
		errorOnExist: true,
		force: false,
	});
	if (preparedScript !== undefined) {
		await writeFile(
			path.join(preparedPath, SCRIPT_RELATIVE_PATH),
			preparedScript,
			{
				mode: 0o600,
			}
		);
	}
	return {
		packagePath: preparedPath,
		resourceId,
		version: profile.version,
		intensity,
		...(profile.kind === "unchanged-package"
			? { outputBlendIntensity: intensity }
			: {}),
	};
}

export const jianyingFilterPackagePreparerTestUtils = {
	bootstrap: ({
		resourceId,
		source,
		intensity,
	}: {
		resourceId: string;
		source: string;
		intensity: number;
	}) => {
		const profile = MULTI_PASS_PROFILES[resourceId];
		if (!profile || profile.kind !== "script-bootstrap") {
			throw new Error("Unknown native multi-pass bootstrap profile");
		}
		return profile.bootstrap({ source, intensity });
	},
	hashPackageTree,
};
