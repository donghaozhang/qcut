/**
 * Project JSON Builder — assembles ProjectJSON / ProjectJSONMinimal
 * by fetching data from the QCut HTTP API via EditorApiClient.
 *
 * @module electron/native-pipeline/cli/project-json-builder
 */

import type { EditorApiClient } from "../editor/editor-api-client.js";
import type {
  ProjectJSON,
  ProjectJSONMinimal,
  ApiKeyStatus,
  MediaEntry,
  ProjectSettings,
} from "./project-json-types.js";

interface NavigatorProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface NavigatorProjectsPayload {
  projects: NavigatorProject[];
  activeProjectId: string | null;
}

// ---------------------------------------------------------------------------
// API key status
// ---------------------------------------------------------------------------

/** Check which API keys are available (never exposes actual values). */
export function getApiKeyStatus(): ApiKeyStatus {
  return {
    fal: !!process.env.VITE_FAL_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    freesound: !!process.env.FREESOUND_API_KEY,
  };
}

// ---------------------------------------------------------------------------
// Minimal builder
// ---------------------------------------------------------------------------

/**
 * Build a compact ProjectJSONMinimal (~200 tokens) from the QCut HTTP API.
 * Fetches settings + stats in parallel, returns counts only (no arrays).
 */
export async function buildProjectJSONMinimal(
  client: EditorApiClient,
  projectId: string,
): Promise<ProjectJSONMinimal> {
  const settingsFallback: Record<string, unknown> = {};
  const statsFallback: Record<string, unknown> = {};
  const navigatorFallback: NavigatorProjectsPayload = {
    projects: [],
    activeProjectId: null,
  };

  const [settings, stats, navigator] = await Promise.all([
    safeGet<Record<string, unknown>>({
      client,
      path: `/api/claude/project/${projectId}/settings`,
      fallback: settingsFallback,
      required: true,
    }),
    safeGet<Record<string, unknown>>({
      client,
      path: `/api/claude/project/${projectId}/stats`,
      fallback: statsFallback,
      required: true,
    }),
    safeGet<NavigatorProjectsPayload>({
      client,
      path: "/api/claude/navigator/projects",
      fallback: navigatorFallback,
    }),
  ]);
  const projectMeta = findProjectInNavigator({
    payload: navigator,
    projectId,
  });

  const now = new Date().toISOString();
  const defaultName = "Untitled Project";
  const settingsName = str(settings.name, defaultName);
  const resolvedName =
    settingsName === defaultName && projectMeta
      ? str(projectMeta.name, defaultName)
      : settingsName;

  return {
    version: "1.0",
    projectId,
    name: resolvedName,
    createdAt: str(settings.createdAt, projectMeta?.createdAt ?? now),
    updatedAt: str(settings.updatedAt, projectMeta?.updatedAt ?? now),
    settings: {
      width: num(settings.width, 1920),
      height: num(settings.height, 1080),
      fps: num(settings.fps, 30),
      aspectRatio: str(settings.aspectRatio, "16:9"),
      outputFormat: str(settings.exportFormat ?? settings.outputFormat, "mp4"),
    },
    counts: {
      media: parseMediaCounts(stats.mediaCount),
      subtitles: 0, // TODO: wire up caption count from timeline
      generated: 0, // TODO: wire up AI-generated media count
      tracks: num(stats.trackCount, 0),
      elements: num(stats.elementCount, 0),
    },
    totalDuration: num(stats.totalDuration, 0),
    lastExport: null, // TODO: wire up export history
    apiKeys: getApiKeyStatus(),
  };
}

// ---------------------------------------------------------------------------
// Full builder
// ---------------------------------------------------------------------------

/**
 * Build the complete ProjectJSON (~2000 tokens) from the QCut HTTP API.
 * Fetches settings, stats, media, and timeline in parallel.
 */
export async function buildProjectJSON(
  client: EditorApiClient,
  projectId: string,
): Promise<ProjectJSON> {
  const settingsFallback: Record<string, unknown> = {};
  const statsFallback: Record<string, unknown> = {};
  const mediaFallback: Record<string, unknown>[] = [];
  const navigatorFallback: NavigatorProjectsPayload = {
    projects: [],
    activeProjectId: null,
  };

  const [settings, stats, mediaList, navigator] = await Promise.all([
    safeGet<Record<string, unknown>>({
      client,
      path: `/api/claude/project/${projectId}/settings`,
      fallback: settingsFallback,
      required: true,
    }),
    safeGet<Record<string, unknown>>({
      client,
      path: `/api/claude/project/${projectId}/stats`,
      fallback: statsFallback,
      required: true,
    }),
    safeGet<Record<string, unknown>[]>({
      client,
      path: `/api/claude/media/${projectId}`,
      fallback: mediaFallback,
    }),
    safeGet<NavigatorProjectsPayload>({
      client,
      path: "/api/claude/navigator/projects",
      fallback: navigatorFallback,
    }),
  ]);
  const projectMeta = findProjectInNavigator({
    payload: navigator,
    projectId,
  });

  const now = new Date().toISOString();
  const defaultName = "Untitled Project";
  const settingsName = str(settings.name, defaultName);
  const resolvedName =
    settingsName === defaultName && projectMeta
      ? str(projectMeta.name, defaultName)
      : settingsName;

  const media: MediaEntry[] = Array.isArray(mediaList)
    ? mediaList.map((m) => ({
        id: str(m.id, ""),
        type: parseMediaType(m.type),
        name: str(m.name, ""),
        path: str(m.path, ""),
        duration: m.duration != null ? num(m.duration, 0) : null,
        width: m.width != null ? num(m.width, 0) : null,
        height: m.height != null ? num(m.height, 0) : null,
        fps: m.fps != null ? num(m.fps, 0) : null,
        importedAt: str(m.importedAt ?? m.createdAt, now),
      }))
    : [];

  const projectSettings: ProjectSettings = {
    width: num(settings.width, 1920),
    height: num(settings.height, 1080),
    fps: num(settings.fps, 30),
    aspectRatio: str(settings.aspectRatio, "16:9"),
    backgroundColor: str(settings.backgroundColor, "#000000"),
    backgroundType: settings.backgroundType === "blur" ? "blur" : "color",
    outputFormat: parseOutputFormat(
      settings.exportFormat ?? settings.outputFormat,
    ),
    outputQuality: parseOutputQuality(
      settings.exportQuality ?? settings.outputQuality,
    ),
    trackCount: num(stats.trackCount, 0),
    elementCount: num(stats.elementCount, 0),
    totalDuration: num(stats.totalDuration, 0),
  };

  return {
    version: "1.0",
    projectId,
    name: resolvedName,
    createdAt: str(settings.createdAt, projectMeta?.createdAt ?? now),
    updatedAt: str(settings.updatedAt, projectMeta?.updatedAt ?? now),
    settings: projectSettings,
    media,
    subtitles: [], // TODO: extract from CaptionElement timeline data
    generated: [], // TODO: filter media by AI generation metadata
    exports: [], // TODO: wire up export history
    jobs: [], // TODO: wire up job tracking
    apiKeys: getApiKeyStatus(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeGet<T>({
  client,
  path,
  fallback,
  required = false,
}: {
  client: EditorApiClient;
  path: string;
  fallback: T;
  required?: boolean;
}): Promise<T> {
  try {
    return await client.get<T>(path);
  } catch (error) {
    if (required) {
      throw new Error(
        `Failed to fetch required endpoint ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findProjectInNavigator({
  payload,
  projectId,
}: {
  payload: unknown;
  projectId: string;
}): NavigatorProject | null {
  try {
    const normalized = normalizeNavigatorPayload({ payload });
    if (!normalized) return null;

    for (const project of normalized.projects) {
      if (project.id === projectId) {
        return project;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeNavigatorPayload({
  payload,
}: {
  payload: unknown;
}): NavigatorProjectsPayload | null {
  try {
    if (!isRecord(payload)) return null;
    if (!Array.isArray(payload.projects)) return null;

    const projects: NavigatorProject[] = [];
    for (const entry of payload.projects) {
      if (!isRecord(entry)) continue;
      const id = str(entry.id, "");
      if (!id) continue;

      projects.push({
        id,
        name: str(entry.name, "Untitled Project"),
        createdAt: str(entry.createdAt, ""),
        updatedAt: str(entry.updatedAt, ""),
      });
    }

    return {
      projects,
      activeProjectId:
        typeof payload.activeProjectId === "string"
          ? payload.activeProjectId
          : null,
    };
  } catch {
    return null;
  }
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function parseMediaCounts(raw: unknown): {
  video: number;
  audio: number;
  image: number;
} {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      video: num(obj.video, 0),
      audio: num(obj.audio, 0),
      image: num(obj.image, 0),
    };
  }
  return { video: 0, audio: 0, image: 0 };
}

function parseMediaType(raw: unknown): "video" | "audio" | "image" {
  const s = String(raw).toLowerCase();
  if (s === "video" || s === "audio" || s === "image") return s;
  return "video";
}

function parseOutputFormat(raw: unknown): "mp4" | "webm" | "mov" {
  const s = String(raw).toLowerCase();
  if (s === "mp4" || s === "webm" || s === "mov") return s;
  return "mp4";
}

function parseOutputQuality(raw: unknown): "1080p" | "720p" | "480p" {
  const s = String(raw).toLowerCase();
  if (s === "1080p" || s === "720p" || s === "480p") return s;
  return "1080p";
}
