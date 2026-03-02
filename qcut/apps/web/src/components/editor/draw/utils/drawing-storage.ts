import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";

interface DrawingMetadata {
	filename: string;
	projectId: string;
	created: string;
	modified: string;
	size: number;
	format: "png" | "jpg" | "svg" | "json";
	tags?: string[];
}

/**
 * Drawing storage service that safely extends QCut's existing storage
 * Uses existing storage.save/load methods - no new IPC handlers needed
 */
// biome-ignore lint/complexity/noStaticOnlyClass: This utility class provides a clean namespace for related drawing storage functions
export class DrawingStorage {
	private static readonly STORAGE_PREFIX = "qcut-drawing-";
	private static readonly METADATA_PREFIX = "qcut-drawing-meta-";
	private static readonly AUTOSAVE_PREFIX = "qcut-drawing-autosave-";

	/**
	 * Save drawing using existing storage API
	 * SAFE: Uses existing storage.save method
	 */
	static async saveDrawing(
		drawingData: string,
		projectId: string,
		filename?: string,
		tags?: string[]
	): Promise<string> {
		try {
			const drawingId = `${DrawingStorage.STORAGE_PREFIX}${projectId}-${Date.now()}`;
			const actualFilename = filename || `drawing-${Date.now()}.png`;

			const ext = actualFilename.split(".").pop()?.toLowerCase();
			const format: DrawingMetadata["format"] =
				ext === "json" ? "json" : ext === "jpg" || ext === "jpeg" ? "jpg" : ext === "svg" ? "svg" : "png";
			const metadata: DrawingMetadata = {
				filename: actualFilename,
				projectId,
				created: new Date().toISOString(),
				modified: new Date().toISOString(),
				size: drawingData.length,
				format,
				tags: tags || [],
			};

			// Use existing storage API - completely safe
			if (window.electronAPI?.storage?.save) {
				await window.electronAPI.storage.save(drawingId, drawingData);
				await window.electronAPI.storage.save(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`,
					JSON.stringify(metadata)
				);
			} else {
				// Fallback to localStorage for browser development
				localStorage.setItem(drawingId, drawingData);
				localStorage.setItem(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`,
					JSON.stringify(metadata)
				);
			}

			return drawingId;
		} catch (error) {
			handleError(error, {
				operation: "drawing save",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.HIGH,
			});
			throw error;
		}
	}

	/**
	 * Load drawing by ID
	 */
	static async loadDrawing(
		drawingId: string
	): Promise<{ data: string; metadata: DrawingMetadata } | null> {
		try {
			let data: string | null = null;
			let metadata: DrawingMetadata | null = null;

			if (window.electronAPI?.storage?.load) {
				data = (await window.electronAPI.storage.load(drawingId)) as
					| string
					| null;
				const rawMeta = await window.electronAPI.storage.load(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`
				);
				metadata =
					typeof rawMeta === "string"
						? JSON.parse(rawMeta)
						: (rawMeta as DrawingMetadata);
			} else {
				// Fallback
				data = localStorage.getItem(drawingId);
				const metaStr = localStorage.getItem(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`
				);
				if (metaStr) {
					metadata = JSON.parse(metaStr);
				}
			}

			if (!data || !metadata) return null;

			return { data, metadata };
		} catch (error) {
			handleError(error, {
				operation: "drawing load",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.MEDIUM,
			});
			return null;
		}
	}

	/**
	 * List all drawings for a project
	 */
	static async listProjectDrawings(
		projectId: string
	): Promise<Array<{ id: string; metadata: DrawingMetadata }>> {
		try {
			const drawings: Array<{ id: string; metadata: DrawingMetadata }> = [];

			if (window.electronAPI?.storage?.list) {
				const allKeys = await window.electronAPI.storage.list();
				const drawingKeys = allKeys.filter((key) =>
					key.startsWith(`${DrawingStorage.STORAGE_PREFIX}${projectId}-`)
				);

				const entries = await Promise.all(
					drawingKeys.map(async (key) => {
						try {
							const raw = await window.electronAPI?.storage.load(
								`${DrawingStorage.METADATA_PREFIX}${key}`
							);
							const md = typeof raw === "string" ? JSON.parse(raw) : raw;
							return md ? { id: key, metadata: md as DrawingMetadata } : null;
						} catch {
							return null;
						}
					})
				);
				for (const entry of entries) {
					if (entry) drawings.push(entry);
				}
			} else {
				// Fallback
				const prefix = `${DrawingStorage.STORAGE_PREFIX}${projectId}-`;
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key?.startsWith(prefix)) {
						const metaKey = `${DrawingStorage.METADATA_PREFIX}${key}`;
						const metaStr = localStorage.getItem(metaKey);
						if (metaStr) {
							try {
								const metadata = JSON.parse(metaStr);
								drawings.push({ id: key, metadata });
							} catch {
								// Skip invalid metadata
							}
						}
					}
				}
			}

			// Sort by creation date (newest first)
			return drawings.sort(
				(a, b) =>
					new Date(b.metadata.created).getTime() -
					new Date(a.metadata.created).getTime()
			);
		} catch (error) {
			handleError(error, {
				operation: "drawing list",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.MEDIUM,
			});
			return [];
		}
	}

	/**
	 * Delete drawing and its metadata
	 */
	static async deleteDrawing(drawingId: string): Promise<boolean> {
		try {
			if (window.electronAPI?.storage?.remove) {
				await window.electronAPI.storage.remove(drawingId);
				await window.electronAPI.storage.remove(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`
				);
			} else {
				localStorage.removeItem(drawingId);
				localStorage.removeItem(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`
				);
			}

			return true;
		} catch (error) {
			handleError(error, {
				operation: "drawing delete",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.MEDIUM,
			});
			return false;
		}
	}

	/**
	 * Update drawing metadata (e.g., filename, tags)
	 */
	static async updateDrawingMetadata(
		drawingId: string,
		updates: Partial<Pick<DrawingMetadata, "filename" | "tags">>
	): Promise<boolean> {
		try {
			const existing = await DrawingStorage.loadDrawing(drawingId);
			if (!existing) return false;

			const updatedMetadata: DrawingMetadata = {
				...existing.metadata,
				...updates,
				modified: new Date().toISOString(),
			};

			if (window.electronAPI?.storage?.save) {
				await window.electronAPI.storage.save(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`,
					JSON.stringify(updatedMetadata)
				);
			} else {
				localStorage.setItem(
					`${DrawingStorage.METADATA_PREFIX}${drawingId}`,
					JSON.stringify(updatedMetadata)
				);
			}

			return true;
		} catch (error) {
			handleError(error, {
				operation: "drawing metadata update",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.MEDIUM,
			});
			return false;
		}
	}

	/**
	 * Auto-save drawing (for work-in-progress)
	 * Uses a special autosave key that gets overwritten
	 */
	static async autosaveDrawing(
		drawingData: string,
		projectId: string
	): Promise<void> {
		try {
			const autosaveKey = `${DrawingStorage.AUTOSAVE_PREFIX}${projectId}`;

			if (window.electronAPI?.storage?.save) {
				await window.electronAPI.storage.save(autosaveKey, drawingData);
			} else {
				localStorage.setItem(autosaveKey, drawingData);
			}
		} catch (error) {
			handleError(error, {
				operation: "drawing autosave",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.LOW,
			});
			// Don't throw on autosave failure
		}
	}

	/**
	 * Load autosaved drawing
	 */
	static async loadAutosave(projectId: string): Promise<string | null> {
		try {
			const autosaveKey = `${DrawingStorage.AUTOSAVE_PREFIX}${projectId}`;

			if (window.electronAPI?.storage?.load) {
				return (await window.electronAPI.storage.load(autosaveKey)) as
					| string
					| null;
			}
			return localStorage.getItem(autosaveKey);
		} catch (error) {
			handleError(error, {
				operation: "drawing autosave load",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.LOW,
			});
			return null;
		}
	}

	/**
	 * Clear autosave for a project
	 */
	static async clearAutosave(projectId: string): Promise<void> {
		try {
			const autosaveKey = `${DrawingStorage.AUTOSAVE_PREFIX}${projectId}`;

			if (window.electronAPI?.storage?.remove) {
				await window.electronAPI.storage.remove(autosaveKey);
			} else {
				localStorage.removeItem(autosaveKey);
			}
		} catch (error) {
			handleError(error, {
				operation: "drawing autosave clear",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.LOW,
			});
		}
	}

	/**
	 * Export drawing as file download
	 */
	static async exportDrawing(
		drawingData: string,
		filename: string
	): Promise<void> {
		try {
			const link = document.createElement("a");
			link.download = filename;
			link.href = drawingData;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (error) {
			handleError(error, {
				operation: "drawing export",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.MEDIUM,
			});
			throw error;
		}
	}

	/**
	 * Get storage statistics for a project
	 */
	static async getStorageStats(projectId: string): Promise<{
		count: number;
		totalSize: number;
		oldestDrawing?: string;
		newestDrawing?: string;
	}> {
		try {
			const drawings = await DrawingStorage.listProjectDrawings(projectId);

			if (drawings.length === 0) {
				return { count: 0, totalSize: 0 };
			}

			const totalSize = drawings.reduce(
				(sum, drawing) => sum + drawing.metadata.size,
				0
			);
			const oldest = drawings[drawings.length - 1]; // Already sorted newest first
			const newest = drawings[0];

			return {
				count: drawings.length,
				totalSize,
				oldestDrawing: oldest?.metadata.created,
				newestDrawing: newest?.metadata.created,
			};
		} catch (error) {
			handleError(error, {
				operation: "storage stats",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.LOW,
			});
			return { count: 0, totalSize: 0 };
		}
	}

	/**
	 * Check if storage is available
	 */
	static isStorageAvailable(): boolean {
		return !!(window.electronAPI?.storage || typeof Storage !== "undefined");
	}
}

export default DrawingStorage;
export type { DrawingMetadata };
