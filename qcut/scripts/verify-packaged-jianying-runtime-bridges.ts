import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME } from "../electron/jianying-filter-local-runtime/bridge-resolver.js";
import { JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME } from "../electron/jianying-portrait-adjustment-runtime/bridge-resolver.js";
import { JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME } from "../electron/jianying-person-cutout/bridge-resolver.js";
import { JIANYING_SALIENCY_BRIDGE_FILE_NAME } from "../electron/jianying-person-cutout/saliency-bridge-resolver.js";
import {
	VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME,
	VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS,
} from "../electron/jianying-person-cutout/video-object-bach-bridge-resolver.js";
import { VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME } from "../electron/jianying-person-cutout/video-object-coreml-bridge-resolver.js";
import { JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME } from "../electron/jianying-text-runtime/bridge-resolver.js";
import { JIANYING_TRANSITION_BRIDGE_FILE_NAME } from "../electron/jianying-transition/bridge-resolver.js";
import { verifyPackagedJianyingRuntimeBridge } from "./verify-packaged-jianying-runtime-bridge.js";

const execFileAsync = promisify(execFile);
const REQUIRED_TRANSITION_BRIDGE_MODES = [
	"transition-video",
	"effect-video",
] as const;

async function bridgeUsage({ bridgePath }: { bridgePath: string }) {
	try {
		const { stdout, stderr } = await execFileAsync(bridgePath, [], {
			timeout: 10_000,
		});
		return `${stdout}${stderr}`;
	} catch (error) {
		const processError = error as { stdout?: string; stderr?: string };
		return `${processError.stdout ?? ""}${processError.stderr ?? ""}`;
	}
}

async function requireTransitionModes({ bridgePath }: { bridgePath: string }) {
	const usage = await bridgeUsage({ bridgePath });
	for (const mode of REQUIRED_TRANSITION_BRIDGE_MODES) {
		if (!usage.includes(mode)) {
			throw new Error(
				`Packaged Jianying transition bridge does not advertise required mode: ${mode}`
			);
		}
	}
}

/**
 * Face-tracking beauty cards only render when the host binds the runtime's own
 * image-processing context. A host built before that landed still starts, still
 * renders, and silently returns the original frame for those cards — so a
 * staged-but-stale artifact is invisible to a Mach-O identity check. This marker
 * makes the capability itself a packaging gate.
 */
const PORTRAIT_ENGINE_CONTEXT_MARKER = "HTSGLContext";
const PERSON_CUTOUT_NATIVE_METAL_MARKER =
	"TEMattingBlendEffectV2-native-metal-canary";
const PERSON_CUTOUT_VISION_FUSION_MARKER = "Vision-person-fusion-v1";
const VIDEO_OBJECT_ROUTE_MARKER = "video-object-general-seg-v1";
const VIDEO_OBJECT_ALPHA_QUALITY_MARKER = "video-object-alpha-quality-v1";
const VIDEO_OBJECT_SAME_MODEL_COREML_MARKER =
	"video-object-same-model-coreml-v1";
async function requirePortraitEngineGlContext({
	hostPath,
}: {
	hostPath: string;
}) {
	const image = await readFile(hostPath);
	if (!image.includes(PORTRAIT_ENGINE_CONTEXT_MARKER)) {
		throw new Error(
			`Packaged Jianying portrait adjustment host predates the engine GL context fix (no ${PORTRAIT_ENGINE_CONTEXT_MARKER} reference): ${hostPath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
}

async function requirePersonCutoutNativeMetal({
	bridgePath,
}: {
	bridgePath: string;
}) {
	const image = await readFile(bridgePath);
	if (!image.includes(PERSON_CUTOUT_NATIVE_METAL_MARKER)) {
		throw new Error(
			`Packaged Jianying person cutout bridge predates native Metal canary validation: ${bridgePath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
	if (!image.includes(PERSON_CUTOUT_VISION_FUSION_MARKER)) {
		throw new Error(
			`Packaged Jianying person cutout bridge predates Vision fusion: ${bridgePath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
}

async function requireVideoObjectRoute({ bridgePath }: { bridgePath: string }) {
	const image = await readFile(bridgePath);
	if (!image.includes(VIDEO_OBJECT_ROUTE_MARKER)) {
		throw new Error(
			`Packaged Jianying segmentation bridge predates the video-object route: ${bridgePath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
	if (!image.includes(VIDEO_OBJECT_ALPHA_QUALITY_MARKER)) {
		throw new Error(
			`Packaged Jianying segmentation bridge predates the video-object Alpha quality gate: ${bridgePath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
}

async function requireSameModelCoreMLRoute({
	bridgePath,
}: {
	bridgePath: string;
}) {
	const image = await readFile(bridgePath);
	if (!image.includes(VIDEO_OBJECT_SAME_MODEL_COREML_MARKER)) {
		throw new Error(
			`Packaged Jianying same-model CoreML bridge is stale: ${bridgePath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
}

async function requireAuditedBachRoute({ bridgePath }: { bridgePath: string }) {
	const image = await readFile(bridgePath);
	for (const marker of VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS) {
		if (image.includes(marker)) continue;
		throw new Error(
			`Packaged Jianying Bach bridge is missing audited capability ${marker}: ${bridgePath}. Re-run \`bun run stage-jianying-filter-local-bridge\`.`
		);
	}
}

export async function verifyPackagedJianyingRuntimeBridges({
	distRoot,
	projectRoot,
}: {
	distRoot: string;
	projectRoot: string;
}) {
	const [
		transitionBridge,
		textBridge,
		filterBridge,
		portraitAdjustmentHost,
		personCutoutBridge,
		saliencyBridge,
		videoObjectBachBridge,
		videoObjectCoreMLBridge,
	] = await Promise.all([
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: JIANYING_TRANSITION_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: JIANYING_SALIENCY_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
		verifyPackagedJianyingRuntimeBridge({
			bridgeFileName: VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME,
			distRoot,
			projectRoot,
		}),
	]);
	await requireTransitionModes({ bridgePath: transitionBridge });
	await Promise.all([
		requirePortraitEngineGlContext({ hostPath: portraitAdjustmentHost }),
		requirePersonCutoutNativeMetal({ bridgePath: personCutoutBridge }),
		requireVideoObjectRoute({ bridgePath: saliencyBridge }),
		requireAuditedBachRoute({ bridgePath: videoObjectBachBridge }),
		requireSameModelCoreMLRoute({ bridgePath: videoObjectCoreMLBridge }),
	]);
	return {
		transitionBridge,
		textBridge,
		filterBridge,
		portraitAdjustmentHost,
		personCutoutBridge,
		saliencyBridge,
		videoObjectBachBridge,
		videoObjectCoreMLBridge,
	};
}

if (import.meta.main) {
	const projectRoot = path.resolve(import.meta.dir, "..");
	const bridges = await verifyPackagedJianyingRuntimeBridges({
		projectRoot,
		distRoot: path.join(projectRoot, "dist-electron"),
	});
	console.log(
		`Verified packaged Jianying runtime bridges: ${Object.values(bridges).join(", ")}`
	);
}
