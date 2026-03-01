import {
	getSequenceAnalysisService,
	type AnalysisResult,
} from "@/lib/remotion/sequence-analysis-service";
import type { SetFn, GetFn } from "./types";

/** Creates actions for analyzing Remotion component source code and caching results. */
export function createAnalysisActions(set: SetFn, get: GetFn) {
	return {
		setAnalysisResult: (componentId: string, result: AnalysisResult) => {
			set((state) => {
				const newMap = new Map(state.analyzedSequences);
				newMap.set(componentId, result);
				return { analyzedSequences: newMap };
			});
		},

		getAnalysisResult: (componentId: string) => {
			return get().analyzedSequences.get(componentId);
		},

		clearAnalysisResult: (componentId: string) => {
			set((state) => {
				const newMap = new Map(state.analyzedSequences);
				newMap.delete(componentId);
				return { analyzedSequences: newMap };
			});
		},

		analyzeComponentSource: async (componentId: string, sourceCode: string) => {
			try {
				const service = getSequenceAnalysisService();
				const result = await service.analyzeComponent(componentId, sourceCode);
				get().setAnalysisResult(componentId, result);

				if (result.structure) {
					set((state) => {
						const components = new Map(state.registeredComponents);
						const existing = components.get(componentId);
						if (existing && !existing.sequenceStructure) {
							components.set(componentId, {
								...existing,
								sequenceStructure: result.structure!,
							});
							return { registeredComponents: components };
						}
						return state;
					});
				}

				return result;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Analysis failed";
				throw new Error(
					`Failed to analyze component ${componentId}: ${errorMessage}`
				);
			}
		},
	};
}
