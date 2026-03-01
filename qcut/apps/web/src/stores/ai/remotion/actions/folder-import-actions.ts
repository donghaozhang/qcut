import type {
	ImportedFolderInfo,
	FolderImportResult,
} from "@/lib/remotion/types";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import {
	importFromFolder as importFromFolderLoader,
	isFolderImportAvailable,
} from "@/lib/remotion/component-loader";
import type { SetFn, GetFn } from "./types";

/** Creates actions for importing, refreshing, and removing Remotion component folders. */
export function createFolderImportActions(set: SetFn, get: GetFn) {
	return {
		importFromFolder: async (
			folderPath?: string
		): Promise<FolderImportResult> => {
			if (!isFolderImportAvailable()) {
				return {
					success: false,
					componentIds: [],
					successCount: 0,
					errorCount: 1,
					errors: ["Folder import is only available in Electron"],
					folderPath: folderPath || "",
				};
			}

			set({ isFolderImporting: true });

			try {
				const result = await importFromFolderLoader(folderPath);

				if (!result.success) {
					set({ isFolderImporting: false });
					return {
						success: false,
						componentIds: [],
						successCount: 0,
						errorCount: result.errorCount,
						errors: result.errors,
						folderPath: result.folderPath,
					};
				}

				const componentIds: string[] = [];
				const newComponents = new Map(get().registeredComponents);

				for (const component of result.components) {
					newComponents.set(component.id, component);
					componentIds.push(component.id);
					debugLog(
						`[REMOTION] ✅ Registered component: ${component.name} (${component.id})`
					);
				}

				const folderInfo: ImportedFolderInfo = {
					folderPath: result.folderPath,
					name: result.folderPath.split(/[/\\]/).pop() || "Imported Folder",
					componentIds,
					compositionCount: result.components.length,
					importedAt: Date.now(),
					refreshedAt: Date.now(),
				};

				const newFolders = new Map(get().importedFolders);
				newFolders.set(result.folderPath, folderInfo);

				set({
					registeredComponents: newComponents,
					importedFolders: newFolders,
					isFolderImporting: false,
				});

				debugLog("[REMOTION] Folder import complete:", {
					folderPath: result.folderPath,
					componentCount: componentIds.length,
				});

				return {
					success: true,
					componentIds,
					successCount: result.successCount,
					errorCount: result.errorCount,
					errors: result.errors,
					folderPath: result.folderPath,
				};
			} catch (error) {
				debugError("[REMOTION] Folder import failed:", error);
				set({ isFolderImporting: false });

				return {
					success: false,
					componentIds: [],
					successCount: 0,
					errorCount: 1,
					errors: [error instanceof Error ? error.message : "Unknown error"],
					folderPath: folderPath || "",
				};
			}
		},

		refreshFolder: async (folderPath: string): Promise<FolderImportResult> => {
			const existingFolder = get().importedFolders.get(folderPath);
			if (!existingFolder) {
				return {
					success: false,
					componentIds: [],
					successCount: 0,
					errorCount: 1,
					errors: ["Folder not found in imported folders"],
					folderPath,
				};
			}

			const newComponents = new Map(get().registeredComponents);
			for (const componentId of existingFolder.componentIds) {
				newComponents.delete(componentId);
			}
			set({ registeredComponents: newComponents });

			return get().importFromFolder(folderPath);
		},

		removeFolder: (folderPath: string) => {
			const existingFolder = get().importedFolders.get(folderPath);
			if (!existingFolder) {
				debugLog("[REMOTION] Folder not found for removal:", folderPath);
				return;
			}

			const newComponents = new Map(get().registeredComponents);
			for (const componentId of existingFolder.componentIds) {
				newComponents.delete(componentId);
				debugLog("[REMOTION] Removed folder component:", componentId);
			}

			const newFolders = new Map(get().importedFolders);
			newFolders.delete(folderPath);

			set({
				registeredComponents: newComponents,
				importedFolders: newFolders,
			});

			debugLog("[REMOTION] Folder removed:", folderPath);
		},

		getImportedFolders: () => {
			return Array.from(get().importedFolders.values());
		},
	};
}
