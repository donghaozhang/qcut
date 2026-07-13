import { useEffect } from "react";
import {
	USER_LIBRARY_CHANGED_EVENT,
	type UserLibraryChangedDetail,
} from "@/lib/user-library/user-library-events";
import { useLicenseStore } from "@/stores/license-store";
import { useUserLibrarySyncStore } from "@/stores/user-library-sync-store";

const CHANGE_DEBOUNCE_MS = 800;
const PERIODIC_SYNC_MS = 5 * 60 * 1_000;

export function UserLibrarySyncInitializer() {
	const userEmail = useLicenseStore((state) => state.license?.user?.email);
	const isLicenseLoading = useLicenseStore((state) => state.isLoading);
	const sync = useUserLibrarySyncStore((state) => state.sync);

	useEffect(() => {
		if (isLicenseLoading || !userEmail) return;
		void sync();
	}, [isLicenseLoading, sync, userEmail]);

	useEffect(() => {
		let timeout: number | undefined;
		const scheduleSync = () => {
			if (timeout !== undefined) window.clearTimeout(timeout);
			timeout = window.setTimeout(() => void sync(), CHANGE_DEBOUNCE_MS);
		};
		const handleLibraryChange = (event: Event) => {
			const detail = (event as CustomEvent<UserLibraryChangedDetail>).detail;
			if (detail?.namespace) scheduleSync();
		};
		window.addEventListener(USER_LIBRARY_CHANGED_EVENT, handleLibraryChange);
		window.addEventListener("online", scheduleSync);
		const interval = window.setInterval(() => void sync(), PERIODIC_SYNC_MS);
		return () => {
			if (timeout !== undefined) window.clearTimeout(timeout);
			window.clearInterval(interval);
			window.removeEventListener(
				USER_LIBRARY_CHANGED_EVENT,
				handleLibraryChange
			);
			window.removeEventListener("online", scheduleSync);
		};
	}, [sync]);

	return null;
}
