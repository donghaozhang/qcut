import path from "node:path";
import {
	compileJianyingTransitionBridge,
	JIANYING_TRANSITION_BRIDGE_FILE_NAME,
} from "../electron/jianying-transition/bridge-resolver.js";

if (process.platform !== "darwin") {
	console.log("Skipping Jianying transition bridge: macOS only.");
	process.exit(0);
}

const projectRoot = path.resolve(import.meta.dir, "..");
const outputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_TRANSITION_BRIDGE_FILE_NAME
);

await compileJianyingTransitionBridge({ projectRoot, outputPath });
console.log(`Staged Jianying transition bridge: ${outputPath}`);
