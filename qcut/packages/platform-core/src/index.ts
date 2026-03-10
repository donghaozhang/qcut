/**
 * @qcut/platform-core — Platform-agnostic API contract for QCut.
 *
 * @module @qcut/platform-core
 */

export {
	PlatformCapability,
	type PlatformAPI,
	type PlatformFilesAPI,
	type PlatformStorageAPI,
	type PlatformThemeAPI,
	type PlatformShellAPI,
	type PlatformApiKeysAPI,
	type PlatformFFmpegAPI,
	type PlatformLicenseAPI,
	type PlatformTranscriptionAPI,
	type PlatformScreenRecordingAPI,
	type ThemeSource,
	type FileDialogFilter,
	type FileInfo,
	type SaveBlobResult,
} from "./types.js";

export {
	PlatformUnsupportedError,
	PLATFORM_CAPABILITIES,
	isPlatformCapable,
	getMissingCapabilities,
} from "./capabilities.js";
