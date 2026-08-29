import type { JianyingFilterLabLoadRendererResult } from "./jianying-filter-lab-contract.js";
import type { JianyingNativeSwingRenderer } from "./native-pipeline/filters/filter-lab-native-swing.js";

export function loadJianyingFilterNativeSwingRenderer({
	filterTitle,
	renderer,
	resourceId,
}: {
	filterTitle: string;
	renderer: JianyingNativeSwingRenderer;
	resourceId: string;
}): JianyingFilterLabLoadRendererResult {
	return {
		resourceId,
		version: renderer.version,
		name: filterTitle,
		enabled: true,
		presetId: `jianying:${resourceId}:${renderer.version}`,
		intensity: 100,
		fidelity: "native-local",
		nativeEffect: {
			provider: "jianying-local-effect-v1",
			resourceId,
			version: renderer.version,
		},
		passes: [],
	};
}
