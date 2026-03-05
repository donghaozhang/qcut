/**
 * Shared HTTP Route Definitions
 *
 * Extracts common route registration logic used by both:
 * - claude-http-server.ts (main process, direct BrowserWindow access)
 * - utility-http-server.ts (utility process, proxied BrowserWindow access)
 *
 * The only difference is how each server provides:
 * - getWindow(): returns a BrowserWindow (or proxy with webContents.send)
 * - requestTimeline(): fetches timeline from renderer
 * - requestSelection(): fetches selection from renderer
 * - requestSplit(): splits an element via renderer
 * - getProjectStatsImpl(): gets project stats
 * - getAppVersion(): returns app version string
 */

import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";
import { getProjectPath, isValidSourcePath } from "../utils/helpers.js";
import type {
  Transaction,
  TransactionRequest,
  MediaFile,
  BatchCutRequest,
  BatchCutResponse,
  ClaudeRangeDeleteRequest,
  ClaudeRangeDeleteResponse,
  AutoEditRequest,
  AutoEditJob,
} from "../../types/claude-api.js";
import type {
  EditorStateRequest,
  EditorStateSnapshot,
} from "../../types/claude-state-api.js";

import {
  listMediaFiles,
  getMediaInfo,
  importMediaFile,
  deleteMediaFile,
  renameMediaFile,
  importMediaFromUrl,
  batchImportMedia,
  extractFrame,
} from "../handlers/claude-media-handler.js";
import {
  timelineToMarkdown,
  markdownToTimeline,
  validateTimeline,
} from "../handlers/claude-timeline-handler.js";
import {
  getProjectSettings,
  updateProjectSettings,
  getEmptyStats,
} from "../handlers/claude-project-handler.js";
import {
  getExportPresets,
  getExportRecommendation,
  startExportJob,
  getExportJobStatus,
  listExportJobs,
} from "../handlers/claude-export-handler.js";
import { analyzeError } from "../handlers/claude-diagnostics-handler.js";
import {
  generateProjectSummary,
  generatePipelineReport,
} from "../handlers/claude-summary-handler.js";
import {
  logOperation,
  getOperationLog,
  clearOperationLog,
} from "../claude-operation-log.js";
import { generatePersonaPlex } from "../handlers/claude-personaplex-handler.js";
import { registerAnalysisRoutes } from "./claude-http-analysis-routes.js";
import { registerGenerateRoutes } from "./claude-http-generate-routes.js";
import {
  getRequestCorrelationId,
  registerMetaRoutes,
  wrapRouterWithCorrelationTracking,
} from "./claude-http-meta-routes.js";
import type { DeepHealthReport } from "../handlers/claude-health-handler.js";
import {
  registerTransactionRoutes,
  type ClaudeHistorySummary,
  type ClaudeUndoRedoResponse,
} from "./claude-http-transaction-routes.js";
import { EditorApiClient } from "../../native-pipeline/editor/editor-api-client.js";
import { buildProjectJSON } from "../../native-pipeline/cli/project-json-builder.js";
import { claudeLog } from "../utils/logger.js";

/** Abstraction over how the server accesses renderer-dependent features */
export interface WindowAccessor {
  /** Get a BrowserWindow or proxy with webContents.send capability */
  getWindow(): any;
  /** Request full timeline data from renderer */
  requestTimeline(): Promise<any>;
  /** Request current selection from renderer */
  requestSelection(correlationId?: string): Promise<any>;
  /** Request an element split from renderer */
  requestSplit(
    elementId: string,
    splitTime: number,
    mode: string,
    correlationId?: string,
  ): Promise<any>;
  /** Get project stats (may need renderer) */
  getProjectStats(projectId: string): Promise<any>;
  /** Get the app version string */
  getAppVersion(): string;
  /** Enable operation notifications to a PTY session */
  enableNotifications(
    sessionId: string,
  ): Promise<{ enabled: boolean; sessionId: string | null }>;
  /** Disable operation notifications */
  disableNotifications(): Promise<{
    enabled: boolean;
    sessionId: string | null;
  }>;
  /** Read operation notification bridge status */
  getNotificationsStatus(): Promise<{
    enabled: boolean;
    sessionId: string | null;
  }>;
  /** Read operation notification history */
  getNotificationsHistory(limit?: number): Promise<string[]>;
  /** Batch add elements (may need BrowserWindow or proxy) */
  batchAddElements(
    projectId: string,
    elements: any[],
    correlationId?: string,
  ): Promise<any>;
  /** Batch update elements */
  batchUpdateElements(updates: any[], correlationId?: string): Promise<any>;
  /** Batch delete elements */
  batchDeleteElements(
    elements: any[],
    ripple: boolean,
    correlationId?: string,
  ): Promise<any>;
  /** Arrange timeline */
  arrangeTimeline(data: any, correlationId?: string): Promise<any>;
  /** Begin a grouped transaction */
  beginTransaction(request?: TransactionRequest): Promise<Transaction>;
  /** Commit a grouped transaction */
  commitTransaction(
    transactionId: string,
  ): Promise<{ transaction: Transaction; historyEntryAdded: boolean }>;
  /** Rollback a grouped transaction */
  rollbackTransaction(
    transactionId: string,
    reason?: string,
  ): Promise<{ transaction: Transaction }>;
  /** Get transaction status */
  getTransactionStatus(transactionId: string): Promise<Transaction | null>;
  /** Trigger undo */
  undoTimeline(): Promise<ClaudeUndoRedoResponse>;
  /** Trigger redo */
  redoTimeline(): Promise<ClaudeUndoRedoResponse>;
  /** Read renderer history summary */
  getHistorySummary(): Promise<ClaudeHistorySummary>;
  /** Request editor state snapshot (optional, for media-path fallback) */
  requestStateSnapshot?(
    request?: EditorStateRequest,
  ): Promise<EditorStateSnapshot>;
  /** Execute batch timeline cuts (optional utility-process bridge hook) */
  executeBatchCuts?(request: BatchCutRequest): Promise<BatchCutResponse>;
  /** Execute range delete (optional utility-process bridge hook) */
  executeDeleteRange?(
    request: ClaudeRangeDeleteRequest,
  ): Promise<ClaudeRangeDeleteResponse>;
  /** Start an auto-edit async job (optional utility-process bridge hook) */
  startAutoEditJob?(
    projectId: string,
    request: AutoEditRequest,
  ): Promise<{ jobId: string }>;
  /** Read async auto-edit job status (optional utility-process bridge hook) */
  getAutoEditJobStatus?(jobId: string): Promise<AutoEditJob | null>;
  /** List async auto-edit jobs (optional utility-process bridge hook) */
  listAutoEditJobs?(): Promise<AutoEditJob[]>;
  /** Cancel async auto-edit job (optional utility-process bridge hook) */
  cancelAutoEditJob?(jobId: string): Promise<boolean>;
}

export interface SharedRouteOptions {
  runDeepHealthChecks?: () => Promise<DeepHealthReport>;
}

/** Handle list media files with renderer fallback. */
async function listMediaFilesWithRendererFallback({
  projectId,
  accessor,
}: {
  projectId: string;
  accessor: WindowAccessor;
}): Promise<MediaFile[]> {
  const diskMedia = await listMediaFiles(projectId);
  if (!accessor.requestStateSnapshot) return diskMedia;

  let snapshot: EditorStateSnapshot | null = null;
  try {
    snapshot = await accessor.requestStateSnapshot({ include: ["media"] });
  } catch {
    return diskMedia;
  }

  const mediaItems = snapshot?.state?.media?.items;
  if (!Array.isArray(mediaItems) || mediaItems.length === 0) return diskMedia;

  const merged = new Map<string, MediaFile>();
  for (const media of diskMedia) {
    merged.set(media.id, media);
  }

  for (const item of mediaItems) {
    if (
      !(item.type === "video" || item.type === "image" || item.type === "audio")
    ) {
      continue;
    }
    if (typeof item.localPath !== "string" || !item.localPath.trim()) {
      continue;
    }

    const localPath = item.localPath.trim();
    if (!isValidSourcePath(localPath)) {
      continue;
    }
    try {
      const stat = await fsPromises.stat(localPath);
      merged.set(item.id, {
        id: item.id,
        name: item.name,
        type: item.type,
        path: localPath,
        size: stat.size,
        duration: item.duration,
        dimensions:
          typeof item.width === "number" && typeof item.height === "number"
            ? { width: item.width, height: item.height }
            : undefined,
        createdAt: stat.birthtimeMs,
        modifiedAt: stat.mtimeMs,
      });
    } catch {
      // Ignore stale localPath entries
    }
  }

  return [...merged.values()];
}

const PROJECT_JSON_SYNC_DEBOUNCE_MS = 1000;
const TIMELINE_SYNC_BARRIER_TIMEOUT_MS = 5000;
const projectJsonSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const projectJsonSyncInFlight = new Map<string, Promise<void>>();

async function writeProjectJsonSnapshot({
  projectId,
}: {
  projectId: string;
}): Promise<void> {
  try {
    const client = new EditorApiClient({
      baseUrl: "http://127.0.0.1:8765",
      timeout: 5000,
      skipCapabilityCheck: true,
    });
    const snapshot = await buildProjectJSON(client, projectId);
    const projectDir = getProjectPath(projectId);
    await fsPromises.mkdir(projectDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(projectDir, "project.json"),
      JSON.stringify(snapshot, null, 2),
      "utf-8",
    );
    claudeLog.info(
      "HTTP",
      `[ProjectJSON] Auto-synced project.json for ${projectId}`,
    );
  } catch (error) {
    claudeLog.warn(
      "HTTP",
      `[ProjectJSON] Auto-sync failed for ${projectId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function scheduleProjectJsonAutoSync({
  projectId,
}: {
  projectId: string;
}): void {
  try {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) return;

    const existingTimer = projectJsonSyncTimers.get(normalizedProjectId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      projectJsonSyncTimers.delete(normalizedProjectId);
      const previousWrite =
        projectJsonSyncInFlight.get(normalizedProjectId) ?? Promise.resolve();
      const nextWrite = previousWrite
        .catch(() => undefined)
        .then(() =>
          writeProjectJsonSnapshot({ projectId: normalizedProjectId }),
        )
        .finally(() => {
          if (projectJsonSyncInFlight.get(normalizedProjectId) === nextWrite) {
            projectJsonSyncInFlight.delete(normalizedProjectId);
          }
        });
      projectJsonSyncInFlight.set(normalizedProjectId, nextWrite);
    }, PROJECT_JSON_SYNC_DEBOUNCE_MS);

    projectJsonSyncTimers.set(normalizedProjectId, timer);
  } catch {
    // Best-effort sync scheduling only.
  }
}

async function waitForTimelineMutationBarrier({
  accessor,
}: {
  accessor: WindowAccessor;
}): Promise<void> {
  try {
    await Promise.race([
      accessor.requestTimeline(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timeline mutation barrier timed out"));
        }, TIMELINE_SYNC_BARRIER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Best-effort ordering only.
  }
}

/**
 * Register all shared API routes onto the given router.
 * The WindowAccessor abstracts over direct vs proxied BrowserWindow access.
 */
export function registerSharedRoutes(
  router: Router,
  accessor: WindowAccessor,
  options?: SharedRouteOptions,
): void {
  wrapRouterWithCorrelationTracking({ router });
  registerMetaRoutes({
    router,
    getAppVersion: () => accessor.getAppVersion(),
    runDeepHealthChecks: options?.runDeepHealthChecks,
  });

  // ==========================================================================
  // Notifications bridge routes
  // ==========================================================================
  router.post("/api/claude/notifications/enable", async (req) => {
    const sessionId =
      typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    if (!sessionId.trim()) {
      throw new HttpError(400, "Missing 'sessionId' in request body");
    }
    return await accessor.enableNotifications(sessionId.trim());
  });

  router.post("/api/claude/notifications/disable", async () => {
    return await accessor.disableNotifications();
  });

  router.get("/api/claude/notifications/status", async () => {
    return await accessor.getNotificationsStatus();
  });

  router.get("/api/claude/notifications/history", async (req) => {
    const limit = Number.parseInt(req.query.limit ?? "", 10);
    const resolvedLimit =
      Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : undefined;
    return await accessor.getNotificationsHistory(resolvedLimit);
  });

  router.post("/api/claude/notifications/toggle", async (req) => {
    const enabled = req.body?.enabled;
    if (enabled === true) {
      const sessionId =
        typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
      if (!sessionId.trim()) {
        throw new HttpError(
          400,
          "Missing 'sessionId' in request body when enabled=true",
        );
      }
      return await accessor.enableNotifications(sessionId.trim());
    }
    if (enabled === false) {
      return await accessor.disableNotifications();
    }
    throw new HttpError(400, "Missing 'enabled' boolean in request body");
  });

  // ==========================================================================
  // Media routes (file-system based -- no renderer needed)
  // ==========================================================================
  router.get("/api/claude/media/:projectId", async (req) =>
    listMediaFiles(req.params.projectId),
  );

  router.get("/api/claude/media/:projectId/:mediaId", async (req) =>
    getMediaInfo(req.params.projectId, req.params.mediaId),
  );

  router.post("/api/claude/media/:projectId/import", async (req) => {
    if (!req.body?.source)
      throw new HttpError(400, "Missing 'source' in request body");
    const media = await importMediaFile(req.params.projectId, req.body.source);
    logOperation({
      stage: 1,
      action: "import",
      details: `Imported media from path: ${req.body.source}`,
      timestamp: Date.now(),
      projectId: req.params.projectId,
    });
    if (media) {
      try {
        const win = accessor.getWindow();
        win.webContents.send("claude:media:imported", {
          path: media.path,
          name: media.name,
          id: media.id,
          type: media.type,
          size: media.size,
        });
      } catch {
        /* non-fatal */
      }
    }
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return media;
  });

  router.delete("/api/claude/media/:projectId/:mediaId", async (req) => {
    const result = await deleteMediaFile(
      req.params.projectId,
      req.params.mediaId,
    );
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return result;
  });

  router.patch("/api/claude/media/:projectId/:mediaId/rename", async (req) => {
    if (!req.body?.newName)
      throw new HttpError(400, "Missing 'newName' in request body");
    const result = await renameMediaFile(
      req.params.projectId,
      req.params.mediaId,
      req.body.newName,
    );
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return result;
  });

  router.post("/api/claude/media/:projectId/import-from-url", async (req) => {
    if (!req.body?.url)
      throw new HttpError(400, "Missing 'url' in request body");
    const result = await importMediaFromUrl(
      req.params.projectId,
      req.body.url,
      req.body.filename,
    );
    logOperation({
      stage: 1,
      action: "import",
      details: `Imported media from URL: ${req.body.url}`,
      timestamp: Date.now(),
      projectId: req.params.projectId,
    });
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return result;
  });

  router.post("/api/claude/media/:projectId/batch-import", async (req) => {
    if (!Array.isArray(req.body?.items))
      throw new HttpError(400, "Missing 'items' array in request body");
    const result = await batchImportMedia(req.params.projectId, req.body.items);
    logOperation({
      stage: 1,
      action: "import",
      details: `Batch import processed ${req.body.items.length} item(s)`,
      timestamp: Date.now(),
      projectId: req.params.projectId,
    });
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return result;
  });

  router.post(
    "/api/claude/media/:projectId/:mediaId/extract-frame",
    async (req) => {
      if (typeof req.body?.timestamp !== "number")
        throw new HttpError(
          400,
          "Missing 'timestamp' (number) in request body",
        );
      const result = await extractFrame(
        req.params.projectId,
        req.params.mediaId,
        req.body.timestamp,
        req.body.format,
      );
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return result;
    },
  );

  // ==========================================================================
  // Generate routes
  // ==========================================================================
  registerGenerateRoutes(router);

  // ==========================================================================
  // Timeline routes
  // ==========================================================================
  router.get("/api/claude/timeline/:projectId", async (req) => {
    const timeline = await Promise.race([
      accessor.requestTimeline(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new HttpError(504, "Renderer timed out")),
          5000,
        ),
      ),
    ]);
    const format = req.query.format || "json";
    if (format === "md") return timelineToMarkdown(timeline);
    return timeline;
  });

  router.post("/api/claude/timeline/:projectId/import", async (req) => {
    if (!req.body?.data)
      throw new HttpError(400, "Missing 'data' in request body");
    const format = req.body.format || "json";
    let timeline;
    if (format === "md") {
      try {
        timeline = markdownToTimeline(req.body.data);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid markdown",
        );
      }
    } else {
      if (typeof req.body.data === "string") {
        try {
          timeline = JSON.parse(req.body.data);
        } catch {
          throw new HttpError(400, "Invalid JSON in 'data'");
        }
      } else {
        timeline = req.body.data;
      }
    }
    validateTimeline(timeline);
    const win = accessor.getWindow();
    const correlationId = getRequestCorrelationId({ req });
    win.webContents.send("claude:timeline:apply", {
      correlationId,
      timeline,
      replace: req.body.replace === true,
    });
    await waitForTimelineMutationBarrier({ accessor });
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return { imported: true };
  });

  router.post("/api/claude/timeline/:projectId/elements", async (req) => {
    if (!req.body)
      throw new HttpError(400, "Missing element data in request body");
    const win = accessor.getWindow();
    const correlationId = getRequestCorrelationId({ req });
    const elementId =
      req.body.id ||
      `element_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    win.webContents.send("claude:timeline:addElement", {
      correlationId,
      ...req.body,
      id: elementId,
    });
    await waitForTimelineMutationBarrier({ accessor });
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return { elementId };
  });

  router.post("/api/claude/timeline/:projectId/elements/batch", async (req) => {
    if (!Array.isArray(req.body?.elements))
      throw new HttpError(400, "Missing 'elements' array in request body");
    try {
      const result = await accessor.batchAddElements(
        req.params.projectId,
        req.body.elements,
        getRequestCorrelationId({ req }),
      );
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return result;
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Batch add failed",
      );
    }
  });

  router.patch(
    "/api/claude/timeline/:projectId/elements/batch",
    async (req) => {
      if (!Array.isArray(req.body?.updates))
        throw new HttpError(400, "Missing 'updates' array in request body");
      try {
        const result = await accessor.batchUpdateElements(
          req.body.updates,
          getRequestCorrelationId({ req }),
        );
        scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
        return result;
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : "Batch update failed",
        );
      }
    },
  );

  router.patch(
    "/api/claude/timeline/:projectId/elements/:elementId",
    async (req) => {
      const win = accessor.getWindow();
      const correlationId = getRequestCorrelationId({ req });
      win.webContents.send("claude:timeline:updateElement", {
        correlationId,
        elementId: req.params.elementId,
        changes: req.body || {},
      });
      await waitForTimelineMutationBarrier({ accessor });
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return { updated: true };
    },
  );

  router.delete(
    "/api/claude/timeline/:projectId/elements/batch",
    async (req) => {
      if (!Array.isArray(req.body?.elements))
        throw new HttpError(400, "Missing 'elements' array in request body");
      try {
        const result = await accessor.batchDeleteElements(
          req.body.elements,
          Boolean(req.body.ripple),
          getRequestCorrelationId({ req }),
        );
        scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
        return result;
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : "Batch delete failed",
        );
      }
    },
  );

  router.delete(
    "/api/claude/timeline/:projectId/elements/:elementId",
    async (req) => {
      const win = accessor.getWindow();
      win.webContents.send(
        "claude:timeline:removeElement",
        req.params.elementId,
      );
      await waitForTimelineMutationBarrier({ accessor });
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return { removed: true };
    },
  );

  router.post("/api/claude/timeline/:projectId/arrange", async (req) => {
    if (!req.body?.trackId || typeof req.body.trackId !== "string")
      throw new HttpError(400, "Missing 'trackId' in request body");
    if (!req.body?.mode || typeof req.body.mode !== "string")
      throw new HttpError(400, "Missing 'mode' in request body");
    if (!["sequential", "spaced", "manual"].includes(req.body.mode))
      throw new HttpError(
        400,
        "Invalid mode. Use sequential, spaced, or manual",
      );
    try {
      const result = await accessor.arrangeTimeline(
        {
          trackId: req.body.trackId,
          mode: req.body.mode,
          gap: req.body.gap,
          order: req.body.order,
          startOffset: req.body.startOffset,
        },
        getRequestCorrelationId({ req }),
      );
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return result;
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Arrange request failed",
      );
    }
  });

  router.post(
    "/api/claude/timeline/:projectId/elements/:elementId/split",
    async (req) => {
      if (typeof req.body?.splitTime !== "number")
        throw new HttpError(
          400,
          "Missing 'splitTime' (number) in request body",
        );
      const mode = req.body.mode || "split";
      if (!["split", "keepLeft", "keepRight"].includes(mode))
        throw new HttpError(
          400,
          "Invalid mode. Use 'split', 'keepLeft', or 'keepRight'",
        );
      const result = await accessor.requestSplit(
        req.params.elementId,
        req.body.splitTime,
        mode,
        getRequestCorrelationId({ req }),
      );
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return result;
    },
  );

  router.post(
    "/api/claude/timeline/:projectId/elements/:elementId/move",
    async (req) => {
      if (!req.body?.toTrackId)
        throw new HttpError(400, "Missing 'toTrackId' in request body");
      const win = accessor.getWindow();
      const correlationId = getRequestCorrelationId({ req });
      win.webContents.send("claude:timeline:moveElement", {
        correlationId,
        elementId: req.params.elementId,
        toTrackId: req.body.toTrackId,
        newStartTime: req.body.newStartTime,
      });
      await waitForTimelineMutationBarrier({ accessor });
      scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
      return { moved: true };
    },
  );

  router.post("/api/claude/timeline/:projectId/selection", async (req) => {
    if (!Array.isArray(req.body?.elements))
      throw new HttpError(400, "Missing 'elements' array in request body");
    const win = accessor.getWindow();
    const correlationId = getRequestCorrelationId({ req });
    win.webContents.send("claude:timeline:selectElements", {
      correlationId,
      elements: req.body.elements,
    });
    return { selected: req.body.elements.length };
  });

  router.get("/api/claude/timeline/:projectId/selection", async (req) => {
    const elements = await Promise.race([
      accessor.requestSelection(getRequestCorrelationId({ req })),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new HttpError(504, "Renderer timed out")),
          5000,
        ),
      ),
    ]);
    return { elements };
  });

  router.delete("/api/claude/timeline/:projectId/selection", async () => {
    const win = accessor.getWindow();
    win.webContents.send("claude:timeline:clearSelection");
    return { cleared: true };
  });

  router.post("/api/claude/timeline/:projectId/playback", async (req) => {
    const win = accessor.getWindow();
    const { action, time } = req.body as {
      action: "play" | "pause" | "toggle" | "seek";
      time?: number;
    };
    if (!action) throw new HttpError(400, "Missing action in request body");
    if (action === "seek" && (time === undefined || Number.isNaN(time))) {
      throw new HttpError(400, "Missing or invalid time for seek action");
    }
    win.webContents.send("claude:timeline:playback", { action, time });
    return { action, time, applied: true };
  });

  registerTransactionRoutes({ router, accessor });

  // ==========================================================================
  // Project routes
  // ==========================================================================
  router.get("/api/claude/project/:projectId/settings", async (req) =>
    getProjectSettings(req.params.projectId),
  );

  router.patch("/api/claude/project/:projectId/settings", async (req) => {
    if (!req.body) throw new HttpError(400, "Missing settings in request body");
    await updateProjectSettings(req.params.projectId, req.body, {
      broadcast: false,
    });
    try {
      const win = accessor.getWindow();
      win.webContents.send(
        "claude:project:updated",
        req.params.projectId,
        req.body,
      );
    } catch {
      // Non-fatal: direct file sync below still updates project.json
    }
    scheduleProjectJsonAutoSync({ projectId: req.params.projectId });
    return { updated: true };
  });

  router.get("/api/claude/project/:projectId/stats", async (req) => {
    try {
      return await accessor.getProjectStats(req.params.projectId);
    } catch {
      return getEmptyStats();
    }
  });

  router.get("/api/claude/project/:projectId/summary", async (req) => {
    try {
      const timeline = await Promise.race([
        accessor.requestTimeline(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new HttpError(504, "Renderer timed out")),
            5000,
          ),
        ),
      ]);
      const [mediaFiles, settings] = await Promise.all([
        listMediaFiles(req.params.projectId),
        getProjectSettings(req.params.projectId),
      ]);
      const exportJobs = listExportJobs(req.params.projectId);
      return generateProjectSummary({
        timeline,
        mediaFiles,
        exportJobs,
        settings,
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const msg =
        error instanceof Error ? error.message : "Failed to generate summary";
      throw new HttpError(
        msg.includes("Failed to read project") ? 400 : 500,
        msg,
      );
    }
  });

  router.post("/api/claude/project/:projectId/report", async (req) => {
    try {
      const timeline = await Promise.race([
        accessor.requestTimeline(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new HttpError(504, "Renderer timed out")),
            5000,
          ),
        ),
      ]);
      const [mediaFiles, settings] = await Promise.all([
        listMediaFiles(req.params.projectId),
        getProjectSettings(req.params.projectId),
      ]);
      const exportJobs = listExportJobs(req.params.projectId);
      const summary = generateProjectSummary({
        timeline,
        mediaFiles,
        exportJobs,
        settings,
      });
      const steps = getOperationLog({ projectId: req.params.projectId });
      let outputDir: string | undefined;
      if (typeof req.body?.outputDir === "string") {
        outputDir = req.body.outputDir;
      } else if (typeof req.body?.outputPath === "string") {
        outputDir = path.dirname(req.body.outputPath);
      }
      if (outputDir && !isValidSourcePath(outputDir))
        throw new HttpError(400, "Invalid output directory path");
      const saveToDisk =
        req.body?.saveToDisk === true || outputDir !== undefined;
      const report = await generatePipelineReport({
        steps,
        summary,
        saveToDisk,
        outputDir,
        projectId: req.params.projectId,
      });
      if (req.body?.clearLog === true)
        clearOperationLog({ projectId: req.params.projectId });
      return report;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        500,
        error instanceof Error ? error.message : "Failed to generate report",
      );
    }
  });

  // ==========================================================================
  // Export routes
  // ==========================================================================
  router.get("/api/claude/export/presets", async () => getExportPresets());

  router.get("/api/claude/export/:projectId/recommend/:target", async (req) =>
    getExportRecommendation({ target: req.params.target }),
  );

  router.post("/api/claude/export/:projectId/start", async (req) => {
    try {
      const timeline = await Promise.race([
        accessor.requestTimeline(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new HttpError(504, "Renderer timed out")),
            5000,
          ),
        ),
      ]);
      const mediaFiles = await listMediaFilesWithRendererFallback({
        projectId: req.params.projectId,
        accessor,
      });
      return await startExportJob({
        projectId: req.params.projectId,
        request: req.body || {},
        timeline,
        mediaFiles,
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        500,
        error instanceof Error ? error.message : "Failed to start export",
      );
    }
  });

  router.get("/api/claude/export/:projectId/jobs/:jobId", async (req) => {
    const job = getExportJobStatus(req.params.jobId);
    if (!job || job.projectId !== req.params.projectId)
      throw new HttpError(404, `Job not found: ${req.params.jobId}`);
    return job;
  });

  router.get("/api/claude/export/:projectId/jobs", async (req) =>
    listExportJobs(req.params.projectId),
  );

  // ==========================================================================
  // Diagnostics
  // ==========================================================================
  router.post("/api/claude/diagnostics/analyze", async (req) => {
    if (!req.body?.message)
      throw new HttpError(400, "Missing 'message' in error report");
    return analyzeError(req.body);
  });

  // ==========================================================================
  // Analysis routes
  // ==========================================================================
  registerAnalysisRoutes(router, accessor);

  // ==========================================================================
  // PersonaPlex
  // ==========================================================================
  router.post("/api/claude/personaplex/generate", async (req) =>
    generatePersonaPlex(req.body),
  );

  // ==========================================================================
  // MCP app preview forwarding
  // ==========================================================================
  router.post("/api/claude/mcp/app", async (req) => {
    if (!req.body || typeof req.body.html !== "string" || !req.body.html.trim())
      throw new HttpError(400, "Missing 'html' in request body");
    const toolName =
      typeof req.body.toolName === "string" ? req.body.toolName : "unknown";
    try {
      const win = accessor.getWindow();
      win.webContents.send("mcp:app-html", { html: req.body.html, toolName });
      return { forwarded: true };
    } catch (err) {
      return {
        forwarded: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });

  // ── Moyin (Director) ───────────────────────────────────────────────
  router.post("/api/claude/moyin/parse-result", async (req) => {
    if (!req.body?.scriptData)
      throw new HttpError(400, "Missing 'scriptData' in request body");
    const win = accessor.getWindow();
    win.webContents.send("claude:moyin:parsed", req.body.scriptData);
    return { imported: true };
  });
}
