/**
 * Claude Project CRUD Bridge
 *
 * Handles project create/delete/rename/duplicate requests from main process.
 * Calls the Zustand project store which manages persistence.
 *
 * @module lib/claude-bridge/claude-project-crud-bridge
 */

import { useProjectStore } from "@/stores/project-store";
import { platform } from "@qcut/platform-core";

const CHANNELS = [
	"claude:project:create:request",
	"claude:project:delete:request",
	"claude:project:rename:request",
	"claude:project:duplicate:request",
] as const;

function getApi() {
	return platform().claude?.projectCrud;
}

export function setupClaudeProjectCrudBridge(): void {
	const api = getApi();
	if (!api) return;

	api.onCreateRequest(async (data) => {
		try {
			const store = useProjectStore.getState();
			const projectId = await store.createNewProject(data.name);
			api.sendCreateResponse(data.requestId, {
				projectId,
				name: data.name,
			});
		} catch (err) {
			api.sendCreateResponse(
				data.requestId,
				undefined,
				err instanceof Error ? err.message : String(err)
			);
		}
	});

	api.onDeleteRequest(async (data) => {
		try {
			const store = useProjectStore.getState();
			await store.deleteProject(data.projectId);
			api.sendDeleteResponse(data.requestId, {
				deleted: true,
				projectId: data.projectId,
			});
		} catch (err) {
			api.sendDeleteResponse(
				data.requestId,
				undefined,
				err instanceof Error ? err.message : String(err)
			);
		}
	});

	api.onRenameRequest(async (data) => {
		try {
			const store = useProjectStore.getState();
			await store.renameProject(data.projectId, data.name);
			api.sendRenameResponse(data.requestId, {
				renamed: true,
				projectId: data.projectId,
				name: data.name,
			});
		} catch (err) {
			api.sendRenameResponse(
				data.requestId,
				undefined,
				err instanceof Error ? err.message : String(err)
			);
		}
	});

	api.onDuplicateRequest(async (data) => {
		try {
			const store = useProjectStore.getState();
			const newProjectId = await store.duplicateProject(data.projectId);
			const projects = store.savedProjects;
			const newProject = projects.find((p) => p.id === newProjectId);
			api.sendDuplicateResponse(data.requestId, {
				projectId: newProjectId,
				name: newProject?.name ?? "Duplicated Project",
				sourceProjectId: data.projectId,
			});
		} catch (err) {
			api.sendDuplicateResponse(
				data.requestId,
				undefined,
				err instanceof Error ? err.message : String(err)
			);
		}
	});
}

export function cleanupClaudeProjectCrudBridge(): void {
	getApi()?.removeListeners();
}
