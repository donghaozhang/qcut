import type {
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeElement,
} from "../types/claude-api.js";

export type UtilityRequestFromMain = (
	channel: string,
	data: Record<string, unknown>,
	options?: { timeoutMs?: number }
) => Promise<unknown>;

export function createUtilityTimelineMutationAccessor({
	requestFromMain,
}: {
	requestFromMain: UtilityRequestFromMain;
}): {
	requestAddElement: (
		projectId: string,
		element: Partial<ClaudeElement>,
		correlationId?: string
	) => Promise<void>;
	batchAddElements: (
		projectId: string,
		elements: ClaudeBatchAddElementRequest[],
		correlationId?: string
	) => Promise<ClaudeBatchAddResponse>;
} {
	return {
		requestAddElement: async (projectId, element, correlationId) => {
			await requestFromMain("timeline:add-element", {
				correlationId,
				element,
				projectId,
			});
		},
		batchAddElements: (projectId, elements, correlationId) =>
			requestFromMain("batch-add-elements", {
				correlationId,
				elements,
				projectId,
			}) as Promise<ClaudeBatchAddResponse>,
	};
}
