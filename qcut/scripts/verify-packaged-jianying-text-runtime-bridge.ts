import path from "node:path";
import { JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME } from "../electron/jianying-text-runtime/bridge-resolver.js";
import {
	parseMachOUuidOutput,
	verifyPackagedJianyingRuntimeBridge,
} from "./verify-packaged-jianying-runtime-bridge.js";

export { parseMachOUuidOutput };

export function verifyPackagedJianyingTextRuntimeBridge({
	distRoot,
	projectRoot,
}: {
	distRoot: string;
	projectRoot: string;
}) {
	return verifyPackagedJianyingRuntimeBridge({
		bridgeFileName: JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME,
		distRoot,
		projectRoot,
	});
}

if (import.meta.main) {
	const projectRoot = path.resolve(import.meta.dir, "..");
	const packagedPath = await verifyPackagedJianyingTextRuntimeBridge({
		projectRoot,
		distRoot: path.join(projectRoot, "dist-electron"),
	});
	console.log(
		`Verified packaged Jianying text runtime bridge: ${packagedPath}`
	);
}
