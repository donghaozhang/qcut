/**
 * Draft profile registry (JYI-003).
 *
 * A profile is a strict, versioned contract for one product/version family.
 * "Bidirectional support" is never a boolean: each operation declares its
 * own level, and synthetic-fixture evidence can never satisfy
 * `realAppVerified`. Unregistered formats stay inspect-only by definition —
 * the registry never guesses the closest version.
 *
 * @module @qcut/editor-core/jianying-draft/profiles/registry
 */

/**
 * Evidence level behind one declared operation:
 * - `none`: not supported.
 * - `fixture`: proven only against synthetic fixtures (never production).
 * - `candidate`: production candidate awaiting real-app receipts.
 * - `stable`: backed by reproducible real-app receipts.
 */
export type ProfileOperationLevel = "none" | "fixture" | "candidate" | "stable";

export interface DraftProfileCapabilities {
	inspect: ProfileOperationLevel;
	import: ProfileOperationLevel;
	sameProfileWriteback: ProfileOperationLevel;
	crossProfileExport: ProfileOperationLevel;
	/** Real target-app open/save/reopen/native-export receipts exist. */
	realAppVerified: boolean;
}

export interface DraftProfileContract {
	profileId: string;
	product: "jianying" | "capcut";
	platforms: readonly ("macos" | "windows")[];
	/** platform.app_id in the draft content. */
	appId: number;
	/** platform.app_source in the draft content. */
	appSource: string;
	/** Exact app versions accepted by profile detection. */
	appVersions: readonly string[];
	/** The `version` field of the draft content. */
	schemaVersion: number;
	/** Exact `new_version` values verified for this profile. */
	newVersions: readonly string[];
	/** Acceptable content file names inside a draft directory. */
	contentFileNames: readonly string[];
	/** Canonical top-level key set of the content file. */
	topLevelKeys: readonly string[];
	timeUnit: "microseconds";
	unknownFieldPolicy: "preserve-owned" | "blocked";
	/** Evidence-backed files eligible for encrypted local preservation. */
	envelopeAllowlist: readonly import("../../draft-interop/foreign-envelope.js").ForeignEnvelopeAllowlistEntry[];
	capabilities: DraftProfileCapabilities;
	/** Fixture or receipt id backing the declared levels. */
	verificationEvidence: string;
	/** Synthetic-only profiles never ship as production import targets. */
	production: boolean;
}

const registry = new Map<string, DraftProfileContract>();

export function registerDraftProfile({
	contract,
}: {
	contract: DraftProfileContract;
}): void {
	if (registry.has(contract.profileId)) {
		throw new Error(`Draft profile already registered: ${contract.profileId}`);
	}
	registry.set(contract.profileId, Object.freeze({ ...contract }));
}

export function getDraftProfile({
	profileId,
}: {
	profileId: string;
}): DraftProfileContract | null {
	return registry.get(profileId) ?? null;
}

export function listDraftProfiles(): DraftProfileContract[] {
	return [...registry.values()];
}

/** Writable means STABLE same-profile writeback — fixtures never qualify. */
export function isDraftProfileWritable({
	profileId,
}: {
	profileId: string;
}): boolean {
	const contract = registry.get(profileId);
	return contract?.capabilities.sameProfileWriteback === "stable";
}
