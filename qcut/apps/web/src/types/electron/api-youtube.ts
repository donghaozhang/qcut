/** YouTube upload operations exposed via Electron IPC. */
export interface ElectronYouTubeOps {
	youtube?: {
		upload(options: {
			filePath: string;
			title: string;
			description?: string;
			tags?: string[];
			privacy?: "public" | "unlisted" | "private";
			categoryId?: string;
			thumbnailPath?: string;
		}): Promise<{ videoId: string; url: string }>;
		checkAuth(): Promise<{ authorized: boolean }>;
		onUploadProgress(
			callback: (progress: { percent: number; message: string }) => void,
		): () => void;
	};
}
