export const CLAUDE_LOCAL_VIDEO_EXPORT_REQUEST_CHANNEL =
	"claude:export:local-video:request" as const;
export const CLAUDE_LOCAL_VIDEO_EXPORT_RESPONSE_CHANNEL =
	"claude:export:local-video:response" as const;

export interface ClaudeLocalVideoExportRequest {
	/** Renderer engine override; "muxer" pins the canvas/WebCodecs engine. */
	engine?: "auto" | "muxer";
	filename: string;
	format: "mp4";
	frameRate: 24 | 25 | 30 | 50 | 60;
	height: number;
	/** Export job id, so the renderer can stream real progress back. */
	jobId?: string;
	outputPath: string;
	/** When set, the renderer writes a structured export profile here. */
	profilePath?: string;
	/** Debug: force the per-frame seek path (for baseline profiling). */
	disableSequentialDecode?: boolean;
	projectId: string;
	quality: "1080p" | "720p" | "480p";
	width: number;
}

export interface ClaudeLocalVideoExportRendererRequest {
	request: ClaudeLocalVideoExportRequest;
	requestId: string;
}

export interface ClaudeLocalVideoExportRendererResponse {
	error?: string;
	requestId: string;
	success?: true;
}
