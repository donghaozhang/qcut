import type {
	FileDialogFilter,
	FileInfo,
	ThemeSource,
} from "../supporting-types";

/** File operations on the local filesystem. */
export interface FileOpsAPI {
	openFileDialog: () => Promise<string | null>;
	openMultipleFilesDialog: () => Promise<string[]>;
	saveFileDialog: (
		defaultFilename?: string,
		filters?: FileDialogFilter[]
	) => Promise<string | null>;
	readFile: (filePath: string) => Promise<Buffer | null>;
	writeFile: (filePath: string, data: Buffer | string) => Promise<boolean>;
	saveBlob: (
		data: Buffer | Uint8Array,
		defaultFilename?: string
	) => Promise<{
		success: boolean;
		filePath?: string;
		canceled?: boolean;
		error?: string;
	}>;
	getFileInfo: (filePath: string) => Promise<FileInfo | null>;
	getPathForFile: (file: File) => string;
}

/** Key-value storage operations. */
export interface StorageAPI {
	storage: {
		save: <T = unknown>(key: string, data: T) => Promise<boolean>;
		load: <T = unknown>(key: string) => Promise<T | null>;
		remove: (key: string) => Promise<boolean>;
		list: () => Promise<string[]>;
		clear: () => Promise<boolean>;
	};
}

/** Theme preference operations. */
export interface ThemeAPI {
	theme: {
		get: () => Promise<ThemeSource>;
		set: (theme: ThemeSource) => Promise<ThemeSource>;
		toggle: () => Promise<ThemeSource>;
		isDark: () => Promise<boolean>;
	};
}
