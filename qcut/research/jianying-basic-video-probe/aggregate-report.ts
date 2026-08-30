import path from "node:path";
import { LOCAL_VIDEO_CAPABILITIES } from "./capabilities";
import type { CapabilityProbeResult } from "./probe-report";

interface CapabilitySummary {
	id: string;
	localizedName: string;
	locality: string;
	level: CapabilityProbeResult["level"];
	appIndependent: boolean;
	detail: string;
	boundary: string;
	evidencePaths: string[];
}

const NATIVE_MODE_BY_CAPABILITY = new Map<string, string>([
	["deflicker", "deflicker"],
	["stabilization", "stabilization"],
	["bytenn-denoise", "bytenn-denoise"],
	["umvfi-interpolation", "umvfi-interpolation"],
	["optical-flow-motion-blur", "optical-flow-motion-blur"],
	["camera-tracking", "camera-tracking"],
	["eye-correction", "eye-correction"],
]);

function parseArguments({ args }: { args: string[] }): {
	evidenceRoot: string;
	superResolutionReport: string;
	frameworksRoot: string;
	modelsRoot: string;
	outputPath: string;
} {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const key = args[index];
		const value = args[index + 1];
		if (key && value) values.set(key, value);
	}
	const evidenceRoot = values.get("--evidence-root");
	const superResolutionReport = values.get("--super-resolution-report");
	const frameworksRoot = values.get("--frameworks");
	const modelsRoot = values.get("--models");
	const outputPath = values.get("--output");
	if (
		!(
			evidenceRoot &&
			superResolutionReport &&
			frameworksRoot &&
			modelsRoot &&
			outputPath
		)
	) {
		throw new Error(
			"usage: aggregate-report.ts --evidence-root <dir> --super-resolution-report <json> --frameworks <dir> --models <dir> --output <json>"
		);
	}
	return {
		evidenceRoot,
		superResolutionReport,
		frameworksRoot,
		modelsRoot,
		outputPath,
	};
}

async function readJson({
	filePath,
}: {
	filePath: string;
}): Promise<Record<string, unknown>> {
	const parsed: unknown = JSON.parse(await Bun.file(filePath).text());
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`expected a JSON object: ${filePath}`);
	}
	return parsed as Record<string, unknown>;
}

function levelForNativeStatus({
	status,
}: {
	status: unknown;
}): CapabilityProbeResult["level"] {
	if (status === "processed") return "input-processed";
	if (status === "model-loaded") return "model-loaded";
	if (status === "constructed") return "runtime-callable";
	return "unavailable";
}

async function readNativeSummary({
	id,
	mode,
	evidenceRoot,
}: {
	id: string;
	mode: string;
	evidenceRoot: string;
}): Promise<Pick<CapabilitySummary, "level" | "detail" | "evidencePaths">> {
	const logPath = path.join(evidenceRoot, `${mode}.log`);
	const resultLine = (await Bun.file(logPath).text())
		.split("\n")
		.find((line) => line.startsWith(`{"mode":"${mode}"`));
	if (!resultLine) throw new Error(`missing native result for ${id}`);
	const result: unknown = JSON.parse(resultLine);
	if (!result || typeof result !== "object" || Array.isArray(result)) {
		throw new Error(`invalid native result for ${id}`);
	}
	const record = result as Record<string, unknown>;
	return {
		level: levelForNativeStatus({ status: record.status }),
		detail: typeof record.detail === "string" ? record.detail : "",
		evidencePaths: [logPath],
	};
}

async function buildSummary({
	id,
	evidenceRoot,
	superResolutionReport,
}: {
	id: string;
	evidenceRoot: string;
	superResolutionReport: string;
}): Promise<CapabilitySummary> {
	const capability = LOCAL_VIDEO_CAPABILITIES.find(
		(candidate) => candidate.id === id
	);
	if (!capability) throw new Error(`unknown capability: ${id}`);
	const nativeMode = NATIVE_MODE_BY_CAPABILITY.get(id);
	if (nativeMode) {
		const native = await readNativeSummary({
			id,
			mode: nativeMode,
			evidenceRoot,
		});
		return {
			...capability,
			...native,
			appIndependent: native.level !== "unavailable",
		};
	}
	if (id === "smart-motion" || id === "smart-crop") {
		const reportPath = path.join(evidenceRoot, `${id}.json`);
		const report = await readJson({ filePath: reportPath });
		return {
			...capability,
			level:
				report.validationLevel === "input-processed"
					? "input-processed"
					: "unavailable",
			appIndependent: report.validationLevel === "input-processed",
			detail:
				"Private Saliency runtime processed real frames and QCut produced inspectable output.",
			evidencePaths: [reportPath],
		};
	}
	const report = await readJson({ filePath: superResolutionReport });
	return {
		...capability,
		level:
			report.validationLevel === "discovered" ? "discovered" : "unavailable",
		appIndependent: false,
		detail: typeof report.detail === "string" ? report.detail : "",
		evidencePaths: [superResolutionReport],
	};
}

async function main({ args }: { args: string[] }): Promise<void> {
	const {
		evidenceRoot,
		superResolutionReport,
		frameworksRoot,
		modelsRoot,
		outputPath,
	} = parseArguments({ args });
	const capabilities = await Promise.all(
		LOCAL_VIDEO_CAPABILITIES.map(({ id }) =>
			buildSummary({ id, evidenceRoot, superResolutionReport })
		)
	);
	await Bun.write(
		outputPath,
		`${JSON.stringify(
			{
				probeSuite: "jianying-basic-video-local-v1",
				generatedAt: new Date().toISOString(),
				runtime: {
					frameworksRoot,
					modelsRoot,
					sourceApplicationRequiredDuringProbe: false,
				},
				capabilities,
			},
			null,
			2
		)}\n`
	);
	console.log(outputPath);
}

await main({ args: Bun.argv.slice(2) });
