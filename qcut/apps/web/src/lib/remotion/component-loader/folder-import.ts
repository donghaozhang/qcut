/**
 * Folder import functions for loading Remotion components from folders.
 * @module lib/remotion/component-loader/folder-import
 */

import type {
	RemotionComponentDefinition,
	RemotionComponentCategory,
} from "../types";
import { platform } from "@qcut/platform-core";
import {
	getSequenceAnalysisService,
	type AnalysisResult,
} from "../sequence-analysis-service";
import { loadBundledComponent } from "../dynamic-loader";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import type {
	LoadOptions,
	StoredComponent,
	FolderLoadResult,
	FolderCompositionInfo,
	FolderBundleResult,
} from "./types";
import { DEFAULT_LOAD_OPTIONS } from "./types";
import { storeComponent } from "./indexeddb";

/**
 * Generate a unique component ID for folder-imported components
 */
function generateFolderComponentId(
	folderPath: string,
	compositionId: string
): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 6);
	const folderName = folderPath.split(/[/\\]/).pop() || "folder";
	const sanitizedFolder = folderName
		.replace(/[^a-zA-Z0-9-]/g, "-")
		.toLowerCase()
		.substring(0, 20);
	const sanitizedId = compositionId
		.replace(/[^a-zA-Z0-9-]/g, "-")
		.toLowerCase();
	return `folder-${sanitizedFolder}-${sanitizedId}-${timestamp}-${random}`;
}

/**
 * Infer category from composition dimensions and properties
 */
function inferCategoryFromComposition(
	composition: FolderCompositionInfo
): RemotionComponentCategory {
	const { width, height, durationInFrames, fps } = composition;
	const durationSeconds = durationInFrames / fps;
	const aspectRatio = width / height;

	if (aspectRatio < 0.7) {
		return "social";
	}

	if (aspectRatio >= 0.9 && aspectRatio <= 1.1) {
		return "social";
	}

	if (durationSeconds < 10 && aspectRatio > 1.5) {
		return "intro";
	}

	if (durationSeconds >= 10 && durationSeconds <= 30) {
		return "transition";
	}

	return "custom";
}

/**
 * Load components from a Remotion folder import result.
 */
export async function loadComponentsFromFolder(
	folderPath: string,
	compositions: FolderCompositionInfo[],
	bundles: FolderBundleResult[],
	options: LoadOptions = DEFAULT_LOAD_OPTIONS
): Promise<FolderLoadResult> {
	const startTime = Date.now();
	const opts = { ...DEFAULT_LOAD_OPTIONS, ...options };
	const loadedComponents: RemotionComponentDefinition[] = [];
	const errors: string[] = [];

	const bundleMap = new Map<string, FolderBundleResult>();
	for (const bundle of bundles) {
		bundleMap.set(bundle.compositionId, bundle);
	}

	for (const composition of compositions) {
		const bundle = bundleMap.get(composition.id);

		if (!bundle || !bundle.success || !bundle.code) {
			errors.push(
				`Failed to bundle composition "${composition.id}": ${bundle?.error || "No bundle result"}`
			);
			continue;
		}

		try {
			const componentId = opts.customId
				? `${opts.customId}-${composition.id}`
				: generateFolderComponentId(folderPath, composition.id);

			debugLog(
				`[ComponentLoader] 🔄 Loading component: ${composition.id} (${componentId})`
			);
			const loadResult = await loadBundledComponent(
				bundle.code,
				composition.id,
				componentId
			);

			if (!loadResult.success || !loadResult.component) {
				const errorMsg = `Failed to load component "${composition.id}": ${loadResult.error || "Unknown error"}`;
				debugError(`[ComponentLoader] ❌ ${errorMsg}`);
				errors.push(errorMsg);
				continue;
			}

			debugLog(
				`[ComponentLoader] ✅ Successfully loaded component: ${composition.id}`
			);

			const category = inferCategoryFromComposition(composition);

			const componentDef: RemotionComponentDefinition = {
				id: componentId,
				name: composition.name || composition.id,
				description: `Imported from ${folderPath}`,
				category,
				durationInFrames: composition.durationInFrames,
				fps: composition.fps,
				width: composition.width,
				height: composition.height,
				schema: { safeParse: () => ({ success: true }) } as never,
				defaultProps: {},
				component: loadResult.component,
				source: "imported",
				folderPath,
			};

			let analysisResult: AnalysisResult | undefined;
			try {
				const analysisService = getSequenceAnalysisService();
				analysisResult = await analysisService.analyzeComponent(
					componentId,
					bundle.code
				);
				if (analysisResult.structure) {
					componentDef.sequenceStructure = analysisResult.structure;
				}
			} catch {
				// Analysis failure is non-blocking
			}

			if (opts.storeInDB) {
				try {
					const storedComponent: StoredComponent = {
						id: componentId,
						fileName: `${composition.id}.tsx`,
						sourceCode: bundle.code,
						metadata: {
							name: composition.name || composition.id,
							description: `Imported from ${folderPath}`,
							category,
							durationInFrames: composition.durationInFrames,
							fps: composition.fps,
							width: composition.width,
							height: composition.height,
							hasSchema: false,
							hasDefaultProps: false,
							exports: ["default"],
						},
						importedAt: Date.now(),
						updatedAt: Date.now(),
					};
					await storeComponent(storedComponent);
				} catch {
					// Storage failure is non-blocking
				}
			}

			loadedComponents.push(componentDef);
		} catch (error) {
			errors.push(
				`Error processing composition "${composition.id}": ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}
	}

	return {
		success: loadedComponents.length > 0,
		components: loadedComponents,
		successCount: loadedComponents.length,
		errorCount: errors.length,
		folderPath,
		errors,
		importTime: Date.now() - startTime,
	};
}

/**
 * Check if the Electron API for folder import is available
 */
export function isFolderImportAvailable(): boolean {
	return !!(typeof window !== "undefined" && platform().remotionFolder);
}

/**
 * Import components from a Remotion folder via Electron IPC.
 */
export async function importFromFolder(
	folderPath?: string,
	options: LoadOptions = DEFAULT_LOAD_OPTIONS
): Promise<FolderLoadResult> {
	if (!isFolderImportAvailable()) {
		return {
			success: false,
			components: [],
			successCount: 0,
			errorCount: 1,
			folderPath: folderPath || "",
			errors: ["Folder import is only available in Electron"],
		};
	}

	const api = platform().remotionFolder!;

	try {
		let targetPath = folderPath;
		if (!targetPath) {
			const selectResult = await api.select();
			if (!selectResult.success || selectResult.cancelled) {
				return {
					success: false,
					components: [],
					successCount: 0,
					errorCount: 0,
					folderPath: "",
					errors: selectResult.error ? [selectResult.error] : [],
				};
			}
			targetPath = selectResult.folderPath!;
		}

		const importResult = await api.import(targetPath);

		if (!importResult.success) {
			return {
				success: false,
				components: [],
				successCount: 0,
				errorCount: 1,
				folderPath: targetPath,
				errors: [importResult.error || "Import failed"],
				importTime: importResult.importTime,
			};
		}

		const compositions = importResult.scan
			.compositions as FolderCompositionInfo[];
		const bundles = importResult.bundle?.results || [];

		return loadComponentsFromFolder(targetPath, compositions, bundles, options);
	} catch (error) {
		return {
			success: false,
			components: [],
			successCount: 0,
			errorCount: 1,
			folderPath: folderPath || "",
			errors: [error instanceof Error ? error.message : "Unknown error"],
		};
	}
}
