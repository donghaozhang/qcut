import { resolve } from "node:path";
import {
	compileSoftGlowHost,
	SOFT_GLOW_HOST,
} from "../electron/qcut-independent-filter/soft-glow-bridge.js";
import {
	compileIndependentFilterHost,
	INDEPENDENT_FILTER_HOST,
} from "../electron/qcut-independent-filter/bridge.js";

if (process.platform === "darwin") {
	const projectRoot = resolve(import.meta.dir, "..");
	const outputPath = resolve(
		projectRoot,
		"electron/resources/bin",
		INDEPENDENT_FILTER_HOST
	);
	await compileIndependentFilterHost({ projectRoot, outputPath });
	console.log(`Staged QCut independent Metal host: ${outputPath}`);
	const softGlowPath = resolve(
		projectRoot,
		"electron/resources/bin",
		SOFT_GLOW_HOST
	);
	await compileSoftGlowHost({ projectRoot, outputPath: softGlowPath });
	console.log(`Staged QCut independent CPU soft glow host: ${softGlowPath}`);
} else {
	console.log("Skipping QCut Metal host: macOS only.");
}
