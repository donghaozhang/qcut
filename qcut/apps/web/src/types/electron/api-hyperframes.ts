export type HyperframesVariableValue = string | number | boolean;

export interface ElectronHyperframesOps {
	hyperframes?: {
		select: () => Promise<{
			success: boolean;
			cancelled?: boolean;
			sourcePath?: string;
			projectPath?: string;
			html?: string;
			error?: string;
		}>;
		registerPreview: (options: {
			sourcePath: string;
			variables: Record<string, HyperframesVariableValue>;
		}) => Promise<{
			success: boolean;
			token?: string;
			url?: string;
			error?: string;
		}>;
		releasePreview: (token: string) => Promise<{ success: boolean }>;
		render: (options: {
			renderId: string;
			elementId: string;
			sourcePath: string;
			variables: Record<string, HyperframesVariableValue>;
			width: number;
			height: number;
			fps: number;
			duration: number;
		}) => Promise<{
			success: boolean;
			renderId: string;
			outputPath?: string;
			outputUrl?: string;
			sessionId?: string;
			frameCount?: number;
			duration?: number;
			error?: string;
		}>;
		cancel: (renderId: string) => Promise<{ success: boolean }>;
		cleanup: (sessionId: string) => Promise<{ success: boolean }>;
		onRenderProgress: (
			callback: (progress: {
				renderId: string;
				elementId: string;
				frame: number;
				totalFrames: number;
				progress: number;
			}) => void
		) => () => void;
	};
}
