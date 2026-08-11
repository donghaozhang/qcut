import type { ColorCubeLut } from "@/types/timeline";
import type {
	JianyingFilterLabAPI,
	JianyingFilterLabCube,
} from "../../../../../electron/jianying-filter-lab-contract";

export interface ElectronJianyingFilterLabOps {
	jianyingFilterLab?: JianyingFilterLabAPI;
}

/**
 * Compile-time parity guard: `JianyingFilterLabCube`
 * (electron/jianying-filter-lab-contract.ts) and `ColorCubeLut`
 * (packages/editor-core/src/types/color.ts, re-exported via
 * `@/types/timeline`) are independent declarations kept structurally
 * identical by convention — the filter-lab onApply handoff assigns one to
 * the other. If either side drifts, one of the aliases below stops
 * compiling. Update BOTH declarations together.
 */
type AssertAssignable<A extends B, B> = A;
type _CubeToLut = AssertAssignable<JianyingFilterLabCube, ColorCubeLut>;
type _LutToCube = AssertAssignable<ColorCubeLut, JianyingFilterLabCube>;

export type {
	JianyingFilterLabAPI,
	JianyingFilterLabCube,
	JianyingFilterLabListResult,
	JianyingFilterLabLoadRequest,
	JianyingFilterLabLoadResult,
	JianyingFilterLabLutSummary,
	JianyingLutRole,
} from "../../../../../electron/jianying-filter-lab-contract";
