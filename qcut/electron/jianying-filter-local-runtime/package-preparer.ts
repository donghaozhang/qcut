import { createHash } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SCRIPT_RELATIVE_PATH = path.join(
	"AmazingFeature",
	"lua",
	"SeekModeScript.lua"
);

interface NativeMultiPassProfile {
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
};

export interface PreparedJianyingMultiPassPackage {
	packagePath: string;
	resourceId: string;
	version: string;
	intensity: number;
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

	const sourceScriptPath = path.join(packagePath, SCRIPT_RELATIVE_PATH);
	const sourceScript = await readFile(sourceScriptPath);
	const scriptSha256 = createHash("sha256").update(sourceScript).digest("hex");
	if (scriptSha256 !== profile.scriptSha256) {
		throw new Error("Native multi-pass package changed since verification");
	}

	const preparedPath = path.join(destinationDirectory, "prepared-effect");
	await cp(packagePath, preparedPath, {
		recursive: true,
		errorOnExist: true,
		force: false,
	});
	const normalizedIntensity = intensity / 100;
	const preparedScript = profile.bootstrap({
		source: sourceScript.toString("utf8"),
		intensity: normalizedIntensity,
	});
	await writeFile(
		path.join(preparedPath, SCRIPT_RELATIVE_PATH),
		preparedScript,
		{
			mode: 0o600,
		}
	);
	return {
		packagePath: preparedPath,
		resourceId,
		version: profile.version,
		intensity,
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
		if (!profile) throw new Error("Unknown native multi-pass profile");
		return profile.bootstrap({ source, intensity });
	},
};
