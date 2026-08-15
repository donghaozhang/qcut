import { useState } from "react";
import { toast } from "sonner";
import { debugError } from "@/lib/debug/debug-config";
import { useTranslation } from "@/lib/i18n";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";

/**
 * Imports images into the project media library for use as a digital-human
 * figure or background, and hands back the new ids so the caller can select the
 * image the user just picked.
 */
export function useDigitalHumanImageImport() {
	const { t } = useTranslation();
	const activeProjectId = useProjectStore((state) => state.activeProject?.id);
	const addMediaItem = useMediaStore((state) => state.addMediaItem);
	const [isImporting, setIsImporting] = useState(false);

	const importImages = async ({
		files,
	}: {
		files: File[];
	}): Promise<string[]> => {
		if (files.length === 0) return [];
		if (!activeProjectId) {
			toast.error(t("media.noActiveProject"));
			return [];
		}

		setIsImporting(true);
		try {
			const { processMediaFiles } = await import(
				"@/lib/media/media-processing"
			);
			const processedItems = await processMediaFiles(files);
			const imageItems = processedItems.filter((item) => item.type === "image");
			return await Promise.all(
				imageItems.map((item) => addMediaItem(activeProjectId, item))
			);
		} catch (error) {
			debugError("[DigitalHuman] Image import failed:", error);
			toast.error(t("media.processFailed"));
			return [];
		} finally {
			setIsImporting(false);
		}
	};

	return { importImages, isImporting };
}
