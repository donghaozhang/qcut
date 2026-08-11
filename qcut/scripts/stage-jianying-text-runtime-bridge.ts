import path from "node:path";
import { rm } from "node:fs/promises";
import {
	compileJianyingTextRuntimeBridge,
	JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME,
} from "../electron/jianying-text-runtime/bridge-resolver.js";

if (process.platform !== "darwin") {
	console.log("Skipping Jianying text runtime bridge: macOS only.");
	process.exit(0);
}

const projectRoot = path.resolve(import.meta.dir, "..");
const outputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
);

await rm(outputPath, { force: true });
await compileJianyingTextRuntimeBridge({ projectRoot, outputPath });
console.log(`Staged Jianying text runtime bridge: ${outputPath}`);
