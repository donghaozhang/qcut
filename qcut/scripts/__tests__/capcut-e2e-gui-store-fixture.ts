import { cp, lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type GuiFixture, writeJson } from "./capcut-e2e-gui-fixture.js";

export async function writeRootDraftIds({
	draftIds,
	fixture,
}: {
	draftIds: readonly string[];
	fixture: GuiFixture;
}): Promise<void> {
	const registeredBundles = draftIds.flatMap((draftId) => {
		const bundle = fixture.bundles.find(
			(candidate) => candidate.draftId === draftId
		);
		return bundle ? [bundle] : [];
	});
	await Promise.all(
		registeredBundles.map(async (bundle) => {
			const draftDirectory = join(
				fixture.canonicalStorePath,
				bundle.draftFolderName
			);
			const alreadyInstalled = await lstat(draftDirectory)
				.then((stats) => stats.isDirectory() && !stats.isSymbolicLink())
				.catch((error: unknown) => {
					if (
						typeof error === "object" &&
						error !== null &&
						"code" in error &&
						error.code === "ENOENT"
					) {
						return false;
					}
					throw error;
				});
			if (alreadyInstalled) return;
			await cp(bundle.draftDirectory, draftDirectory, {
				errorOnExist: true,
				force: false,
				recursive: true,
			});
		})
	);
	await writeJson({
		path: fixture.rootMetaInfoPath,
		value: {
			all_draft_store: draftIds.map((draftId) => {
				const bundle = fixture.bundles.find(
					(candidate) => candidate.draftId === draftId
				);
				const draftFolderName = bundle?.draftFolderName ?? "unplanned-draft";
				return {
					draft_fold_path: join(fixture.canonicalStorePath, draftFolderName),
					draft_id: draftId,
					draft_root_path: fixture.canonicalStorePath,
				};
			}),
			draft_ids: draftIds.length,
			root_path: fixture.canonicalStorePath,
		},
	});
}

export async function writeStepEvidenceFiles({
	content = "captured-only",
	evidencePaths,
}: {
	content?: string;
	evidencePaths: readonly string[];
}): Promise<void> {
	await Promise.all(
		evidencePaths.map(async (evidencePath) => {
			await mkdir(dirname(evidencePath), { recursive: true });
			await writeFile(evidencePath, content, "utf8");
		})
	);
}
