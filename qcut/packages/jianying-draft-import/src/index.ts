/**
 * @qcut/jianying-draft-import — read-only draft snapshot runtime (JYI-006).
 *
 * Main-process / CLI only: this package touches the filesystem and must
 * never be imported by renderer code. It produces immutable snapshots for
 * the editor-core interop layer and writes nothing.
 */

export {
	discoverDraftDirectory,
	MAX_DISCOVERY_DEPTH,
	MAX_DISCOVERY_ENTRIES,
	type DiscoveredDraftFile,
	type DraftDiscoveryResult,
	type SkippedDraftEntry,
} from "./discovery.js";

export {
	DEFAULT_MAX_FILE_BYTES,
	DEFAULT_MAX_TOTAL_BYTES,
	readDraftSourceSnapshot,
	verifyDraftSourceUnchanged,
	type DraftSourceFileIdentity,
	type DraftSourceSnapshot,
	type DraftSourceSnapshotFile,
} from "./snapshot-reader.js";

export {
	validateDraftInspectRequest,
	type DraftInspectRequest,
	type DraftRequestValidationIssue,
	type ValidateDraftInspectRequestResult,
} from "./runtime-validation.js";
