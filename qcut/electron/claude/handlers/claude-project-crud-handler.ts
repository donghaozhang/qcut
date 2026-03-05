/**
 * Claude Project CRUD Handler
 *
 * Proxies project create/delete/rename/duplicate through the renderer
 * where the Zustand store and storage service live.
 *
 * @module electron/claude/handlers/claude-project-crud-handler
 */

import { ipcMain, BrowserWindow, type IpcMainEvent } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import {
  generateId,
  getProjectPath,
  getProjectSettingsPath,
  sanitizeProjectId,
} from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";
import {
  getStringValue,
  isErrnoNoEntry,
  isRecord,
  parsePositiveNumber,
} from "./claude-project-shared.js";

const REQUEST_TIMEOUT_MS = 10_000;
const HANDLER_NAME = "ProjectCrud";
const DEFAULT_PROJECT_NAME = "Untitled Project";
const DEFAULT_CANVAS_SIZE = { width: 1920, height: 1080 };
const DEFAULT_FPS = 30;
const PROJECT_SUBDIRECTORIES = [
  "media",
  "media/imported",
  "media/generated",
  "output",
  "cache",
] as const;

export interface CreateProjectResponse {
  projectId: string;
  name: string;
}

export interface DeleteProjectResponse {
  deleted: boolean;
  projectId: string;
}

export interface RenameProjectResponse {
  renamed: boolean;
  projectId: string;
  name: string;
}

export interface DuplicateProjectResponse {
  projectId: string;
  name: string;
  sourceProjectId: string;
}

function getPositiveNumber({
  value,
  fallback,
}: {
  value: unknown;
  fallback: number;
}): number {
  return parsePositiveNumber({ value }) ?? fallback;
}

function normalizeProjectId({ projectId }: { projectId: string }): string {
  const trimmed = projectId.trim();
  const sanitized = sanitizeProjectId(trimmed);
  if (!sanitized) {
    throw new Error("Invalid projectId");
  }
  return sanitized;
}

async function ensureProjectDiskScaffold({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}): Promise<void> {
  const normalizedProjectId = normalizeProjectId({ projectId });
  const projectPath = getProjectPath(normalizedProjectId);
  const settingsPath = getProjectSettingsPath(normalizedProjectId);
  const nowIso = new Date().toISOString();

  try {
    await fs.mkdir(projectPath, { recursive: true });
    for (const folder of PROJECT_SUBDIRECTORIES) {
      await fs.mkdir(path.join(projectPath, folder), { recursive: true });
    }

    let existing: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(settingsPath, "utf-8");
      const parsed = JSON.parse(content);
      if (isRecord(parsed)) {
        existing = parsed;
      }
    } catch (error) {
      if (!isErrnoNoEntry(error)) {
        claudeLog.warn(
          HANDLER_NAME,
          `Failed to parse existing project.qcut for ${projectId}, recreating`,
          error,
        );
      }
    }

    const canvasRaw = isRecord(existing.canvasSize) ? existing.canvasSize : {};
    const width = getPositiveNumber({
      value: canvasRaw.width ?? existing.width,
      fallback: DEFAULT_CANVAS_SIZE.width,
    });
    const height = getPositiveNumber({
      value: canvasRaw.height ?? existing.height,
      fallback: DEFAULT_CANVAS_SIZE.height,
    });

    const scaffold: Record<string, unknown> = {
      ...existing,
      projectId: normalizedProjectId,
      name:
        projectName ||
        getStringValue({
          value: existing.name,
          fallback: DEFAULT_PROJECT_NAME,
        }),
      createdAt: getStringValue({
        value: existing.createdAt,
        fallback: nowIso,
      }),
      updatedAt: nowIso,
      version: getStringValue({ value: existing.version, fallback: "1.0" }),
      fps: getPositiveNumber({ value: existing.fps, fallback: DEFAULT_FPS }),
      aspectRatio: getStringValue({
        value: existing.aspectRatio,
        fallback: `${width}:${height}`,
      }),
      backgroundColor: getStringValue({
        value: existing.backgroundColor,
        fallback: "#000000",
      }),
      backgroundType: getStringValue({
        value: existing.backgroundType,
        fallback: "color",
      }),
      exportFormat: getStringValue({
        value: existing.exportFormat,
        fallback: "mp4",
      }),
      exportQuality: getStringValue({
        value: existing.exportQuality,
        fallback: "high",
      }),
      canvasSize: { width, height },
      width,
      height,
    };

    if (!Array.isArray(scaffold.media)) {
      scaffold.media = [];
    }
    if (!Array.isArray(scaffold.timeline)) {
      scaffold.timeline = [];
    }
    if (!isRecord(scaffold.settings)) {
      scaffold.settings = {};
    }

    await fs.writeFile(
      settingsPath,
      JSON.stringify(scaffold, null, 2),
      "utf-8",
    );
  } catch (error) {
    throw new Error(
      `Failed to ensure project scaffold for ${normalizedProjectId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function requestFromRenderer<T>(
  win: BrowserWindow,
  channel: string,
  payload: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const requestId = generateId("req");
    const responseChannel = `${channel}:response`;

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      ipcMain.removeListener(responseChannel, handler);
      reject(new Error(`Timeout waiting for ${channel}`));
    }, timeoutMs);

    const handler = (
      _event: IpcMainEvent,
      data: { requestId: string; result?: T; error?: string },
    ) => {
      if (data.requestId !== requestId || resolved) return;
      resolved = true;
      clearTimeout(timeout);
      ipcMain.removeListener(responseChannel, handler);
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data.result!);
      }
    };

    ipcMain.on(responseChannel, handler);
    win.webContents.send(`${channel}:request`, { requestId, ...payload });
  });
}

export function requestCreateProject(
  win: BrowserWindow,
  name: string,
): Promise<CreateProjectResponse> {
  return (async () => {
    const result = await requestFromRenderer<CreateProjectResponse>(
      win,
      "claude:project:create",
      { name },
    );

    try {
      await ensureProjectDiskScaffold({
        projectId: result.projectId,
        projectName: result.name || name,
      });
    } catch (error) {
      claudeLog.warn(
        HANDLER_NAME,
        "Project created but disk scaffold sync failed:",
        error,
      );
    }

    return result;
  })();
}

export function requestDeleteProject(
  win: BrowserWindow,
  projectId: string,
): Promise<DeleteProjectResponse> {
  return requestFromRenderer(win, "claude:project:delete", { projectId });
}

export function requestRenameProject(
  win: BrowserWindow,
  projectId: string,
  name: string,
): Promise<RenameProjectResponse> {
  return (async () => {
    const result = await requestFromRenderer<RenameProjectResponse>(
      win,
      "claude:project:rename",
      {
        projectId,
        name,
      },
    );

    try {
      await ensureProjectDiskScaffold({
        projectId: result.projectId,
        projectName: result.name || name,
      });
    } catch (error) {
      claudeLog.warn(
        HANDLER_NAME,
        "Project renamed but disk scaffold sync failed:",
        error,
      );
    }

    return result;
  })();
}

export function requestDuplicateProject(
  win: BrowserWindow,
  projectId: string,
): Promise<DuplicateProjectResponse> {
  return (async () => {
    const result = await requestFromRenderer<DuplicateProjectResponse>(
      win,
      "claude:project:duplicate",
      { projectId },
    );

    try {
      await ensureProjectDiskScaffold({
        projectId: result.projectId,
        projectName: result.name,
      });
    } catch (error) {
      claudeLog.warn(
        HANDLER_NAME,
        "Project duplicated but disk scaffold sync failed:",
        error,
      );
    }

    return result;
  })();
}
