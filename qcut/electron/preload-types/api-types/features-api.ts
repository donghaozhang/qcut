import type {
	Skill,
	SkillsSyncForClaudeResult,
	MediaImportOptions,
	MediaImportResult,
} from "../supporting-types";

/** Skills management (list, import, delete, sync). */
export interface SkillsAPI {
	skills?: {
		list: (projectId: string) => Promise<Skill[]>;
		import: (projectId: string, sourcePath: string) => Promise<Skill | null>;
		delete: (projectId: string, skillId: string) => Promise<void>;
		getContent: (
			projectId: string,
			skillId: string,
			filename: string
		) => Promise<string>;
		browse: () => Promise<string | null>;
		getPath: (projectId: string) => Promise<string>;
		scanGlobal: () => Promise<
			Array<{
				path: string;
				name: string;
				description: string;
				bundled?: boolean;
			}>
		>;
		syncForClaude: (projectId: string) => Promise<SkillsSyncForClaudeResult>;
	};
}

/** AI pipeline: check, generate, list models, estimate cost. */
export interface AIPipelineAPI {
	aiPipeline?: {
		check: () => Promise<{ available: boolean; error?: string }>;
		status: () => Promise<{
			available: boolean;
			version: string | null;
			source: "bundled" | "system" | "python" | "unavailable";
			compatible: boolean;
			features: Record<string, boolean>;
			error?: string;
		}>;
		generate: (options: {
			command: string;
			args: Record<string, string | number | boolean>;
			outputDir?: string;
			sessionId?: string;
			projectId?: string;
			autoImport?: boolean;
		}) => Promise<{
			success: boolean;
			outputPath?: string;
			outputPaths?: string[];
			error?: string;
			errorCode?: string;
			duration?: number;
			cost?: number;
			models?: string[];
			data?: unknown;
			mediaId?: string;
			importedPath?: string;
		}>;
		listModels: () => Promise<{
			success: boolean;
			error?: string;
			models?: string[];
			data?: unknown;
		}>;
		estimateCost: (options: {
			model: string;
			duration?: number;
			resolution?: string;
		}) => Promise<{
			success: boolean;
			error?: string;
			cost?: number;
		}>;
		cancel: (sessionId: string) => Promise<{ success: boolean }>;
		refresh: () => Promise<{
			available: boolean;
			version: string | null;
			source: "bundled" | "system" | "python" | "unavailable";
			compatible: boolean;
			features: Record<string, boolean>;
			error?: string;
		}>;
		onProgress: (
			callback: (progress: {
				stage: string;
				percent: number;
				message: string;
				model?: string;
				eta?: number;
				sessionId?: string;
			}) => void
		) => () => void;
	};
}

/** Media import operations (symlink-based). */
export interface MediaImportAPI {
	mediaImport?: {
		import: (options: MediaImportOptions) => Promise<MediaImportResult>;
		validateSymlink: (path: string) => Promise<boolean>;
		locateOriginal: (mediaPath: string) => Promise<string | null>;
		relinkMedia: (
			projectId: string,
			mediaId: string,
			newSourcePath: string
		) => Promise<MediaImportResult>;
		remove: (projectId: string, mediaId: string) => Promise<void>;
		checkSymlinkSupport: () => Promise<boolean>;
		getMediaPath: (projectId: string) => Promise<string>;
	};
}

/** Project folder operations (scan, list, ensure structure). */
export interface ProjectFolderAPI {
	projectFolder?: {
		getRoot: (projectId: string) => Promise<string>;
		scan: (
			projectId: string,
			subPath?: string,
			options?: { recursive?: boolean; mediaOnly?: boolean }
		) => Promise<{
			files: Array<{
				name: string;
				path: string;
				relativePath: string;
				type: "video" | "audio" | "image" | "unknown";
				size: number;
				modifiedAt: number;
				isDirectory: boolean;
			}>;
			folders: string[];
			totalSize: number;
			scanTime: number;
		}>;
		list: (
			projectId: string,
			subPath?: string
		) => Promise<
			Array<{
				name: string;
				path: string;
				relativePath: string;
				type: "video" | "audio" | "image" | "unknown";
				size: number;
				modifiedAt: number;
				isDirectory: boolean;
			}>
		>;
		ensureStructure: (
			projectId: string
		) => Promise<{ created: string[]; existing: string[] }>;
	};
}
