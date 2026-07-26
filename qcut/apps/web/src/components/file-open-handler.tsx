"use client";

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { debugError } from "@/lib/debug/debug-config";
import { useTranslation } from "@/lib/i18n";
import { processMediaFiles } from "@/lib/media/media-processing";
import { storageService } from "@/lib/storage/storage-service";
import { generateUUID } from "@/lib/utils";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { ensureMainTrack } from "@/types/timeline";

const MIME_BY_EXTENSION: Record<string, string> = {
	mp4: "video/mp4",
	mov: "video/quicktime",
	avi: "video/x-msvideo",
	mkv: "video/x-matroska",
	webm: "video/webm",
};

/**
 * Handles OS-level "Open With QCut" for video files: creates a new project,
 * imports the file as media, places it on the main track, and opens the editor.
 *
 * Mounted once at the app root; renders nothing.
 */
export function FileOpenHandler() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	// Files opened in quick succession import one at a time.
	const queueRef = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		const api = window.electronAPI;
		if (!api?.onOpenMediaFile) {
			return;
		}

		const importFile = async (filePath: string) => {
			const fileName = filePath.split(/[/\\]/).pop() || "video";
			const toastId = toast.loading(
				t("fileOpen.importing", { name: fileName })
			);
			try {
				const buffer = await api.readFile(filePath);
				if (!buffer || buffer.length === 0) {
					throw new Error(`Unreadable file: ${filePath}`);
				}
				const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
				const file = new File([new Uint8Array(buffer)], fileName, {
					type: MIME_BY_EXTENSION[extension] ?? "video/mp4",
				});

				const [item] = await processMediaFiles([file]);
				if (!item) {
					throw new Error(`Unsupported media: ${fileName}`);
				}

				const projectName = fileName.replace(/\.[^.]+$/, "") || fileName;
				const projectId = await useProjectStore
					.getState()
					.createNewProject(projectName);
				const mediaId = await useMediaStore
					.getState()
					.addMediaItem(projectId, item);

				// Place the clip on the main track so it shows in the preview
				// as soon as the editor opens.
				const tracks = ensureMainTrack([]);
				tracks[0].elements.push({
					id: generateUUID(),
					type: "media",
					mediaId,
					name: fileName,
					duration: item.duration || TIMELINE_CONSTANTS.DEFAULT_IMAGE_DURATION,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				});
				await storageService.saveProjectTimeline({
					projectId,
					tracks,
					sceneId: useProjectStore.getState().activeProject?.currentSceneId,
				});

				// createNewProject already set this project active, which makes
				// the editor route skip its own loadProject — run the canonical
				// load here so media and timeline state come from storage.
				await useProjectStore.getState().loadProject(projectId);

				toast.dismiss(toastId);
				navigate({
					to: "/editor/$project_id",
					params: { project_id: projectId },
				});
			} catch (error) {
				debugError("[FileOpenHandler] Failed to import opened file", error);
				toast.error(t("fileOpen.failed", { name: fileName }), { id: toastId });
			}
		};

		const enqueue = (filePath: string) => {
			queueRef.current = queueRef.current.then(() => importFile(filePath));
		};

		const unsubscribe = api.onOpenMediaFile(enqueue);
		// Drain files opened before this handler mounted (cold "Open With").
		api.getPendingOpenMediaFiles?.().then((paths) => {
			for (const filePath of paths) {
				enqueue(filePath);
			}
		});
		return unsubscribe;
	}, [navigate, t]);

	return null;
}
