import { ensureQCutJianyingTextPrivateArchive } from "../electron/jianying-text-private-archive.js";

const archive = await ensureQCutJianyingTextPrivateArchive({ refresh: true });

process.stdout.write(
	`${JSON.stringify(
		{
			archiveRoot: archive.archiveRoot,
			completedAt: archive.manifest.completedAt,
			containers: archive.manifest.containers,
		},
		null,
		2
	)}\n`
);
