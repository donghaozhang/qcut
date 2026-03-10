import { useCallback } from "react";
import { platform } from "@qcut/platform-core";

export const useElectron = () => {
	const p = platform();

	const isElectron = useCallback(() => {
		return p.isElectron || false;
	}, [p]);

	const openFileDialog = useCallback(async () => {
		return p.files.openFileDialog();
	}, [p]);

	const openMultipleFilesDialog = useCallback(async () => {
		return p.files.openMultipleFilesDialog();
	}, [p]);

	const saveFileDialog = useCallback(
		async (
			defaultFilename?: string,
			filters?: Array<{ name: string; extensions: string[] }>
		) => {
			return p.files.saveFileDialog(defaultFilename, filters);
		},
		[p]
	);

	const readFile = useCallback(
		async (filePath: string) => {
			return p.files.readFile(filePath);
		},
		[p]
	);

	const writeFile = useCallback(
		async (filePath: string, data: Buffer | string) => {
			return p.files.writeFile(filePath, data);
		},
		[p]
	);

	const getFileInfo = useCallback(
		async (filePath: string) => {
			return p.files.getFileInfo(filePath);
		},
		[p]
	);

	// Helper function to import files for the video editor
	const importMediaFiles = useCallback(async () => {
		if (isElectron()) {
			// In Electron mode, use native file dialog
			const filePaths = await openMultipleFilesDialog();
			if (!filePaths || filePaths.length === 0) {
				return [];
			}

			// Convert file paths to File objects for consistency
			const files: File[] = [];
			for (const filePath of filePaths) {
				try {
					const buffer = await readFile(filePath);
					const fileName = filePath.split(/[\\/]/).pop() || "unknown";
					const file = new File([buffer as unknown as ArrayBuffer], fileName);
					files.push(file);
				} catch (error) {
					console.error(`Failed to read file ${filePath}:`, error);
				}
			}
			return files;
		}
		// In browser mode, use regular file input
		return new Promise<File[]>((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.multiple = true;
			input.accept = "video/*,audio/*,image/*";
			input.onchange = (e) => {
				const files = Array.from((e.target as HTMLInputElement).files || []);
				resolve(files);
			};
			input.click();
		});
	}, [isElectron, openMultipleFilesDialog, readFile]);

	// Helper function to export/save files
	const exportFile = useCallback(
		async (
			data: Blob | Buffer | Uint8Array,
			defaultFilename: string,
			filters?: Array<{ name: string; extensions: string[] }>
		) => {
			if (isElectron()) {
				// In Electron mode, use native save dialog
				const filePath = await saveFileDialog(defaultFilename, filters);
				if (!filePath) {
					return { success: false, canceled: true };
				}

				const buffer =
					data instanceof Blob
						? Buffer.from(await data.arrayBuffer())
						: data instanceof Buffer
							? data
							: Buffer.from(data);

				await writeFile(filePath, buffer);
				return { success: true, filePath };
			}
			// In browser mode, use download link
			const blob =
				data instanceof Blob
					? data
					: new Blob([data as unknown as ArrayBuffer]);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = defaultFilename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			return { success: true };
		},
		[isElectron, saveFileDialog, writeFile]
	);

	return {
		isElectron,
		electronAPI: p,
		// Raw API methods
		openFileDialog,
		openMultipleFilesDialog,
		saveFileDialog,
		readFile,
		writeFile,
		getFileInfo,
		// Helper methods
		importMediaFiles,
		exportFile,
	};
};
