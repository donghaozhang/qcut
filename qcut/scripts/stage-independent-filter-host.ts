import { resolve } from "node:path";
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
} else {
	console.log("Skipping QCut Metal host: macOS only.");
}
