import { create } from "zustand";
import { getSessionToken } from "@/lib/ai-video/core/license-relay";
import { syncAllUserLibraries } from "@/lib/user-library/user-library-sync";

export type UserLibrarySyncStatus =
	| "idle"
	| "syncing"
	| "synced"
	| "offline"
	| "signed-out"
	| "error";

interface UserLibrarySyncState {
	error: string | null;
	lastSyncedAt: number | null;
	status: UserLibrarySyncStatus;
	sync: () => Promise<boolean>;
}

let activeSync: Promise<boolean> | null = null;

export const useUserLibrarySyncStore = create<UserLibrarySyncState>((set) => ({
	error: null,
	lastSyncedAt: null,
	status: "idle",
	sync: async () => {
		if (activeSync) return activeSync;
		activeSync = (async () => {
			if (typeof navigator !== "undefined" && !navigator.onLine) {
				set({ status: "offline", error: null });
				return false;
			}
			const sessionToken = await getSessionToken();
			if (!sessionToken) {
				set({ status: "signed-out", error: null });
				return false;
			}
			set({ status: "syncing", error: null });
			try {
				await syncAllUserLibraries({ sessionToken });
				set({ status: "synced", lastSyncedAt: Date.now(), error: null });
				return true;
			} catch (error) {
				set({
					status: "error",
					error:
						error instanceof Error ? error.message : "User library sync failed",
				});
				return false;
			}
		})();
		try {
			return await activeSync;
		} finally {
			activeSync = null;
		}
	},
}));
