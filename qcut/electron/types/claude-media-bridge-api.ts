export interface ClaudeMediaImportedEvent {
	id: string;
	metadata?: unknown;
	name: string;
	path: string;
	projectId: string;
	requestId?: string;
	size: number;
	type: "video" | "audio" | "image";
}

export interface ClaudeMediaDeletedEvent {
	mediaId: string;
	projectId: string;
	requestId?: string;
}

export interface ClaudeMediaRendererResponse {
	error?: string;
	requestId: string;
}
