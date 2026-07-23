export {
	setupScreenRecordingIPC,
	forceStopActiveScreenRecordingSession,
} from "./ipc.js";
export { listCaptureSources } from "./file-ops.js";
export { buildStatus } from "./session.js";
export {
	diagnoseScreenRecording,
	type ScreenRecordingDiagnostics,
} from "./diagnostics.js";
