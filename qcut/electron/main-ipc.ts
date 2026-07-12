/**
 * Main Process IPC Handlers — barrel re-export.
 * Split into electron/main-ipc/ directory for maintainability.
 *
 * @module electron/main-ipc
 */

export {
	registerMainIpcHandlers,
	type MainIpcDeps,
	type ReleaseNote,
	type Logger,
	FAL_CONTENT_TYPES,
	FAL_DEFAULTS,
} from "./main-ipc/index.js";
