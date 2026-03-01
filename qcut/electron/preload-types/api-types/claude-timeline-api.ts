import type {
	MediaFile,
	ClaudeTimeline,
	ClaudeElement,
	ClaudeSplitResponse,
	ClaudeSelectionItem,
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeBatchDeleteItemRequest,
	ClaudeBatchDeleteResponse,
	ClaudeBatchUpdateItemRequest,
	ClaudeBatchUpdateResponse,
	ClaudeArrangeRequest,
	ClaudeArrangeResponse,
	ClaudeRangeDeleteRequest,
	ClaudeRangeDeleteResponse,
	BatchCutResponse,
} from "../../types/claude-api";

/** Claude media list/info/import/delete/rename operations. */
export interface ClaudeMediaAPI {
	media: {
		list: (projectId: string) => Promise<MediaFile[]>;
		info: (projectId: string, mediaId: string) => Promise<MediaFile | null>;
		import: (projectId: string, source: string) => Promise<MediaFile | null>;
		delete: (projectId: string, mediaId: string) => Promise<boolean>;
		rename: (
			projectId: string,
			mediaId: string,
			newName: string
		) => Promise<boolean>;
		onMediaImported: (
			callback: (data: {
				path: string;
				name: string;
				id: string;
				type: string;
				size: number;
			}) => void
		) => void;
	};
}

/** Claude timeline CRUD, batch operations, split, move, select. */
export interface ClaudeTimelineAPI {
	timeline: {
		export: (projectId: string, format: "json" | "md") => Promise<string>;
		import: (
			projectId: string,
			data: string,
			format: "json" | "md"
		) => Promise<void>;
		addElement: (
			projectId: string,
			element: Partial<ClaudeElement>
		) => Promise<string>;
		batchAddElements: (
			projectId: string,
			elements: ClaudeBatchAddElementRequest[]
		) => Promise<ClaudeBatchAddResponse>;
		updateElement: (
			projectId: string,
			elementId: string,
			changes: Partial<ClaudeElement>
		) => Promise<void>;
		batchUpdateElements: (
			projectId: string,
			updates: ClaudeBatchUpdateItemRequest[]
		) => Promise<ClaudeBatchUpdateResponse>;
		removeElement: (projectId: string, elementId: string) => Promise<void>;
		batchDeleteElements: (
			projectId: string,
			elements: ClaudeBatchDeleteItemRequest[],
			ripple?: boolean
		) => Promise<ClaudeBatchDeleteResponse>;
		deleteRange: (
			projectId: string,
			request: ClaudeRangeDeleteRequest
		) => Promise<ClaudeRangeDeleteResponse>;
		arrange: (
			projectId: string,
			request: ClaudeArrangeRequest
		) => Promise<ClaudeArrangeResponse>;
		splitElement: (
			projectId: string,
			elementId: string,
			splitTime: number,
			mode?: "split" | "keepLeft" | "keepRight"
		) => Promise<ClaudeSplitResponse>;
		moveElement: (
			projectId: string,
			elementId: string,
			toTrackId: string,
			newStartTime?: number
		) => Promise<void>;
		selectElements: (
			projectId: string,
			elements: ClaudeSelectionItem[]
		) => Promise<void>;
		getSelection: (projectId: string) => Promise<ClaudeSelectionItem[]>;
		clearSelection: (projectId: string) => Promise<void>;
		onRequest: (callback: () => void) => void;
		sendResponse: (timeline: ClaudeTimeline) => void;
		onApply: (
			callback: (timeline: ClaudeTimeline, replace?: boolean) => void
		) => void;
		onAddElement: (callback: (element: Partial<ClaudeElement>) => void) => void;
		onBatchAddElements: (
			callback: (data: {
				requestId: string;
				elements: ClaudeBatchAddElementRequest[];
			}) => void
		) => void;
		sendBatchAddElementsResponse: (
			requestId: string,
			result: ClaudeBatchAddResponse
		) => void;
		onUpdateElement: (
			callback: (data: {
				elementId: string;
				changes: Partial<ClaudeElement>;
			}) => void
		) => void;
		onBatchUpdateElements: (
			callback: (data: {
				requestId: string;
				updates: ClaudeBatchUpdateItemRequest[];
			}) => void
		) => void;
		sendBatchUpdateElementsResponse: (
			requestId: string,
			result: ClaudeBatchUpdateResponse
		) => void;
		onRemoveElement: (callback: (elementId: string) => void) => void;
		onBatchDeleteElements: (
			callback: (data: {
				requestId: string;
				elements: ClaudeBatchDeleteItemRequest[];
				ripple?: boolean;
			}) => void
		) => void;
		sendBatchDeleteElementsResponse: (
			requestId: string,
			result: ClaudeBatchDeleteResponse
		) => void;
		onSplitElement: (
			callback: (data: {
				requestId: string;
				elementId: string;
				splitTime: number;
				mode: "split" | "keepLeft" | "keepRight";
			}) => void
		) => void;
		sendSplitResponse: (requestId: string, result: ClaudeSplitResponse) => void;
		onExecuteCuts: (
			callback: (data: {
				requestId: string;
				elementId: string;
				cuts: Array<{ start: number; end: number }>;
				ripple: boolean;
			}) => void
		) => void;
		sendExecuteCutsResponse: (
			requestId: string,
			result: BatchCutResponse
		) => void;
		onMoveElement: (
			callback: (data: {
				elementId: string;
				toTrackId: string;
				newStartTime?: number;
			}) => void
		) => void;
		onSelectElements: (
			callback: (data: { elements: ClaudeSelectionItem[] }) => void
		) => void;
		onGetSelection: (callback: (data: { requestId: string }) => void) => void;
		sendSelectionResponse: (
			requestId: string,
			elements: ClaudeSelectionItem[]
		) => void;
		onClearSelection: (callback: () => void) => void;
		onPlayback: (
			callback: (data: { action: string; time?: number }) => void
		) => void;
		onDeleteRange: (
			callback: (data: {
				requestId: string;
				request: ClaudeRangeDeleteRequest;
			}) => void
		) => void;
		sendDeleteRangeResponse: (
			requestId: string,
			result: ClaudeRangeDeleteResponse
		) => void;
		onArrange: (
			callback: (data: {
				requestId: string;
				request: ClaudeArrangeRequest;
			}) => void
		) => void;
		sendArrangeResponse: (
			requestId: string,
			result: ClaudeArrangeResponse
		) => void;
		onLoadSpeech: (
			callback: (data: {
				text: string;
				language_code: string;
				language_probability: number;
				words: Array<{
					text: string;
					start: number;
					end: number;
					type: string;
					speaker_id: string | null;
				}>;
				fileName: string;
			}) => void
		) => void;
		removeListeners: () => void;
	};
}
