import path from "node:path";
import { rm } from "node:fs/promises";
import {
	compileJianyingFilterLocalBridge,
	JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME,
} from "../electron/jianying-filter-local-runtime/bridge-resolver.js";

if (process.platform !== "darwin") {
	console.log("Skipping Jianying filter local bridge: macOS only.");
	process.exit(0);
}

const projectRoot = path.resolve(import.meta.dir, "..");
const outputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME
);

await rm(outputPath, { force: true });
await compileJianyingFilterLocalBridge({ projectRoot, outputPath });
console.log(`Staged Jianying filter local bridge: ${outputPath}`);
