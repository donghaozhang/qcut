import { assertCoverPath } from "@qcut/editor-core/cover";
import { OPFSAdapter } from "@/lib/storage/opfs-adapter";

export interface CoverBlobStore {
	read(options: {
		projectId: string;
		relativePath: string;
	}): Promise<Blob | null>;
	write(options: {
		projectId: string;
		relativePath: string;
		blob: Blob;
	}): Promise<void>;
	removeProject(options: { projectId: string }): Promise<void>;
}

function adapter({ projectId }: { projectId: string }): OPFSAdapter {
	if (!/^[a-zA-Z0-9-]+$/.test(projectId))
		throw new Error("Invalid cover project ID");
	return new OPFSAdapter(`project-cover-${projectId}`);
}

// Logical relative paths remain portable when the desktop filesystem adapter lands.
export const coverBlobStore: CoverBlobStore = {
	read: async ({ projectId, relativePath }) => {
		assertCoverPath({ relativePath });
		return adapter({ projectId }).get(encodeURIComponent(relativePath));
	},
	write: async ({ projectId, relativePath, blob }) => {
		assertCoverPath({ relativePath });
		await adapter({ projectId }).set(
			encodeURIComponent(relativePath),
			new File([blob], relativePath.split("/").at(-1) ?? "cover", {
				type: blob.type,
			})
		);
	},
	removeProject: async ({ projectId }) => {
		if (!OPFSAdapter.isSupported()) return;
		await adapter({ projectId }).clear();
	},
};
