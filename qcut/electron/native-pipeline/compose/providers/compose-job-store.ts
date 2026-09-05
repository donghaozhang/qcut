import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { withAtomicPublishLock } from "../../../jianying-person-cutout/atomic-publish-lock.js";
import type {
	ComposeIntent,
	ComposeJob,
	ComposePatch,
	ComposeSnapshot,
} from "../compose-protocol.js";

export interface StoredComposeJob {
	job: ComposeJob;
	snapshot: ComposeSnapshot;
	intent: ComposeIntent;
	patch?: ComposePatch;
}

export function createComposeJobStore({
	directory = process.env.QCUT_COMPOSE_JOB_DIR ??
		join(homedir(), ".qcut", "compose", "jobs"),
}: {
	directory?: string;
} = {}) {
	const pathFor = ({ id }: { id: string }) => {
		if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/.test(id))
			throw new Error("Invalid Compose job ID.");
		return join(directory, `${id}.json`);
	};
	return {
		async withLock<T>({
			id,
			action,
		}: {
			id: string;
			action: () => Promise<T>;
		}): Promise<T> {
			const path = pathFor({ id });
			await mkdir(directory, { recursive: true, mode: 0o700 });
			return withAtomicPublishLock({
				lockPath: `${path}.lock`,
				action,
				timing: { waitMs: 150_000 },
			});
		},
		async read({ id }: { id: string }): Promise<StoredComposeJob> {
			const record = JSON.parse(
				await readFile(pathFor({ id }), "utf8")
			) as StoredComposeJob;
			if (
				record.job?.id !== id ||
				record.job.snapshotId !== record.snapshot?.id ||
				record.job.snapshotFingerprint !== record.snapshot.sourceFingerprint
			)
				throw new Error("Invalid persisted Compose job identity.");
			return record;
		},
		async write({ record }: { record: StoredComposeJob }): Promise<void> {
			const path = pathFor({ id: record.job.id });
			await mkdir(directory, { recursive: true, mode: 0o700 });
			const temporary = `${path}.${randomUUID()}.tmp`;
			await writeFile(temporary, `${JSON.stringify(record)}\n`, {
				mode: 0o600,
				flag: "wx",
			});
			await rename(temporary, path);
		},
	};
}
