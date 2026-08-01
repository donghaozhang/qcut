import type { BigIntStats } from "node:fs";

export interface CapCutGuiFileIdentity {
	changedTimeNanoseconds: string;
	deviceId: string;
	inode: string;
	mode: string;
	modifiedTimeNanoseconds: string;
	ownerUid: number;
}

export function captureCapCutGuiFileIdentity({
	stats,
}: {
	stats: BigIntStats;
}): CapCutGuiFileIdentity {
	return {
		changedTimeNanoseconds: stats.ctimeNs.toString(),
		deviceId: stats.dev.toString(),
		inode: stats.ino.toString(),
		mode: stats.mode.toString(),
		modifiedTimeNanoseconds: stats.mtimeNs.toString(),
		ownerUid: Number(stats.uid),
	};
}

export function assertCapCutGuiFileIdentityUnchanged({
	after,
	before,
	label,
}: {
	after: CapCutGuiFileIdentity;
	before: CapCutGuiFileIdentity;
	label: string;
}): void {
	for (const key of Object.keys(before) as (keyof CapCutGuiFileIdentity)[]) {
		if (before[key] !== after[key]) {
			throw new Error(`${label} changed during inspection (${key}).`);
		}
	}
}
