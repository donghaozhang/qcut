import path from "node:path";
import { rm } from "node:fs/promises";
import {
	compileJianyingFilterLocalBridge,
	JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME,
} from "../electron/jianying-filter-local-runtime/bridge-resolver.js";
import {
	compileJianyingPortraitAdjustmentHost,
	JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME,
} from "../electron/jianying-portrait-adjustment-runtime/bridge-resolver.js";
import {
	compileJianyingPersonCutoutBridge,
	JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME,
} from "../electron/jianying-person-cutout/bridge-resolver.js";
import {
	compileJianyingSaliencyBridge,
	JIANYING_SALIENCY_BRIDGE_FILE_NAME,
} from "../electron/jianying-person-cutout/saliency-bridge-resolver.js";

if (process.platform !== "darwin") {
	console.log("Skipping Jianying filter local bridge: macOS only.");
	process.exit(0);
}

const projectRoot = path.resolve(import.meta.dir, "..");
const filterOutputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME
);
const portraitOutputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME
);
const personCutoutOutputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME
);
const saliencyOutputPath = path.join(
	projectRoot,
	"electron",
	"resources",
	"bin",
	JIANYING_SALIENCY_BRIDGE_FILE_NAME
);

await Promise.all([
	rm(filterOutputPath, { force: true }),
	rm(portraitOutputPath, { force: true }),
	rm(personCutoutOutputPath, { force: true }),
	rm(saliencyOutputPath, { force: true }),
]);
await Promise.all([
	compileJianyingFilterLocalBridge({
		projectRoot,
		outputPath: filterOutputPath,
	}),
	compileJianyingPortraitAdjustmentHost({
		projectRoot,
		outputPath: portraitOutputPath,
	}),
	compileJianyingPersonCutoutBridge({
		projectRoot,
		outputPath: personCutoutOutputPath,
	}),
	compileJianyingSaliencyBridge({
		projectRoot,
		outputPath: saliencyOutputPath,
	}),
]);
console.log(`Staged Jianying filter local bridge: ${filterOutputPath}`);
console.log(`Staged Jianying portrait adjustment host: ${portraitOutputPath}`);
console.log(`Staged Jianying person cutout bridge: ${personCutoutOutputPath}`);
console.log(`Staged Jianying saliency bridge: ${saliencyOutputPath}`);
