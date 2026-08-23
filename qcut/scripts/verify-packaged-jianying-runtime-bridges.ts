import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME } from "../electron/jianying-filter-local-runtime/bridge-resolver.js";
import { JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME } from "../electron/jianying-portrait-adjustment-runtime/bridge-resolver.js";
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

export async function verifyPackagedJianyingRuntimeBridges({
	distRoot,
	projectRoot,
}: {
	distRoot: string;
	projectRoot: string;
}) {
	const [transitionBridge, textBridge, filterBridge, portraitAdjustmentHost] =
		await Promise.all([
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
		]);
	await requireTransitionModes({ bridgePath: transitionBridge });
	return {
		transitionBridge,
		textBridge,
		filterBridge,
		portraitAdjustmentHost,
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
