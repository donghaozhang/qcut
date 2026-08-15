/**
 * Storage operations sub-interface for ElectronAPI.
 */

export interface ElectronStorageOps {
	storage: {
		save: <T = unknown>(key: string, data: T) => Promise<boolean>;
		load: <T = unknown>(key: string) => Promise<T | null>;
		remove: (key: string) => Promise<boolean>;
		list: () => Promise<string[]>;
		clear: () => Promise<boolean>;
		/** Absolute path of the project's on-disk JSON file. */
		projectFilePath?: (key: string) => Promise<string>;
	};
}
