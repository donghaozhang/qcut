import type { JianyingFilterLabLoadRendererResult } from "./jianying-filter-lab-contract.js";
import type {
	FilterLabMultiPassRecipe,
	JianyingFilterMultiPassRenderer,
} from "./native-pipeline/filters/filter-lab-multi-pass.js";

export async function loadJianyingFilterLabRenderer({
	cacheRoot,
	filterTitle,
	loadRecipe,
	renderer,
	resourceId,
}: {
	cacheRoot: string;
	filterTitle: string;
	loadRecipe: ({
		renderer,
		cacheRoot,
	}: {
		renderer: JianyingFilterMultiPassRenderer;
		cacheRoot: string;
	}) => Promise<FilterLabMultiPassRecipe | null>;
	renderer: JianyingFilterMultiPassRenderer;
	resourceId: string;
}): Promise<JianyingFilterLabLoadRendererResult> {
	const recipe = await loadRecipe({ renderer, cacheRoot });
	if (!recipe) throw new Error("本机剪映 Shader 资源无法读取或已经变化");
	return {
		resourceId,
		version: renderer.version,
		name: filterTitle,
		enabled: true,
		presetId: `jianying:${resourceId}:${renderer.version}`,
		intensity: 100,
		fidelity: renderer.fidelity,
		passes: recipe.passes.map((pass) =>
			pass.kind === "lut"
				? {
						...pass,
						cube: {
							size: pass.cube.size,
							domainMin: pass.cube.domainMin ?? [0, 0, 0],
							domainMax: pass.cube.domainMax ?? [1, 1, 1],
							values: Array.from(pass.cube.values),
						},
					}
				: pass
		),
	};
}
