import { lstat } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import {
	CAPCUT_E2E_SENTINEL_FILE_NAME,
	type DisposableCapCutStorePreflightReport,
} from "./disposable-store-guard.js";
import { isSameOrDescendantPath } from "./gui-regression-filesystem.js";

export interface CapCutGuiProcessIdentity {
	accountUid: number;
	environmentHomePath: string | null;
	osHomePath: string;
	processUid: number;
	userInfoHomePath: string;
	username: string;
}

export interface CapCutGuiProcessIdentityReport {
	accountUid: number;
	environmentHomePath: string | null;
	homeOwnerUid: number;
	osHomePath: string;
	processUid: number;
	storeOwnerUid: number;
	userInfoHomePath: string;
	username: string;
}

export type CapCutGuiOwnerReader = ({
	path,
}: {
	path: string;
}) => Promise<number>;

export async function readOwnerUid({
	path,
}: {
	path: string;
}): Promise<number> {
	const stats = await lstat(path, { bigint: true });
	return Number(stats.uid);
}

export function readActualProcessIdentity(): CapCutGuiProcessIdentity {
	if (typeof process.geteuid !== "function") {
		throw new Error("CapCut GUI regression requires a POSIX effective UID.");
	}
	const account = userInfo();
	return {
		accountUid: account.uid,
		environmentHomePath: process.env.HOME ?? null,
		osHomePath: homedir(),
		processUid: process.geteuid(),
		userInfoHomePath: account.homedir,
		username: account.username,
	};
}

function assertNonPeterIdentity({
	identity,
}: {
	identity: CapCutGuiProcessIdentity;
}): void {
	if (identity.username.toLowerCase() === "peter") {
		throw new Error(
			"CapCut GUI regression refuses the peter login; use an independent macOS login or VM."
		);
	}
	const peterHomePath = resolve("/Users/peter");
	const identityHomes = [
		resolve(identity.userInfoHomePath),
		resolve(identity.osHomePath),
	];
	if (
		identityHomes.some((candidatePath) =>
			isSameOrDescendantPath({ candidatePath, parentPath: peterHomePath })
		)
	) {
		throw new Error(
			"CapCut GUI regression refuses /Users/peter and every descendant."
		);
	}
}

function assertAccountIsVerifiable({
	identity,
}: {
	identity: CapCutGuiProcessIdentity;
}): void {
	if (
		identity.accountUid !== identity.processUid ||
		identity.processUid < 0 ||
		!Number.isSafeInteger(identity.processUid) ||
		identity.username.length === 0
	) {
		throw new Error(
			"CapCut GUI regression could not verify the process account."
		);
	}
}

function assertHomeIdentityMatches({
	identity,
	store,
}: {
	identity: CapCutGuiProcessIdentity;
	store: DisposableCapCutStorePreflightReport;
}): {
	environmentHomePath: string;
	osHomePath: string;
	userInfoHomePath: string;
} {
	const userInfoHomePath = resolve(identity.userInfoHomePath);
	const osHomePath = resolve(identity.osHomePath);
	if (
		userInfoHomePath !== store.dedicatedTestHomePath ||
		osHomePath !== store.dedicatedTestHomePath
	) {
		throw new Error(
			"Changing HOME is not isolation: the actual account home from userInfo(), os.homedir(), and the dedicated test home must all match."
		);
	}
	if (identity.environmentHomePath === null) {
		throw new Error(
			"Environment HOME is required and must match the verified dedicated account home."
		);
	}
	const environmentHomePath = resolve(identity.environmentHomePath);
	if (environmentHomePath !== store.dedicatedTestHomePath) {
		throw new Error(
			"Environment HOME must match the verified dedicated account home; changing HOME never establishes isolation."
		);
	}
	return { environmentHomePath, osHomePath, userInfoHomePath };
}

export async function assertDedicatedProcessIdentity({
	identity,
	readOwner,
	store,
}: {
	identity: CapCutGuiProcessIdentity;
	readOwner: CapCutGuiOwnerReader;
	store: DisposableCapCutStorePreflightReport;
}): Promise<CapCutGuiProcessIdentityReport> {
	assertNonPeterIdentity({ identity });
	assertAccountIsVerifiable({ identity });
	const { environmentHomePath, osHomePath, userInfoHomePath } =
		assertHomeIdentityMatches({
			identity,
			store,
		});
	const [homeOwnerUid, storeOwnerUid, rootOwnerUid, storeSentinelOwnerUid] =
		await Promise.all([
			readOwner({ path: store.dedicatedTestHomePath }),
			readOwner({ path: store.canonicalStorePath }),
			readOwner({ path: store.rootMetaInfo.path }),
			readOwner({
				path: join(store.canonicalStorePath, CAPCUT_E2E_SENTINEL_FILE_NAME),
			}),
		]);
	const mismatchedOwnerUid = [
		homeOwnerUid,
		storeOwnerUid,
		rootOwnerUid,
		storeSentinelOwnerUid,
	].find((ownerUid) => ownerUid !== identity.processUid);
	if (mismatchedOwnerUid !== undefined) {
		throw new Error(
			`Dedicated home, store, and control files must be owned by process UID ${identity.processUid}; found UID ${mismatchedOwnerUid}.`
		);
	}
	return {
		accountUid: identity.accountUid,
		environmentHomePath,
		homeOwnerUid,
		osHomePath,
		processUid: identity.processUid,
		storeOwnerUid,
		userInfoHomePath,
		username: identity.username,
	};
}
