export const USER_LIBRARY_CHANGED_EVENT = "qcut:user-library-changed";

export const USER_LIBRARY_NAMESPACES = {
	audioLibrary: "audio-library",
	audioPresets: "audio-presets",
	clipPresets: "clip-presets",
	colorPresets: "color-presets",
	textPresets: "text-presets",
	timelineTemplates: "timeline-templates",
} as const;

export type UserLibraryNamespace =
	(typeof USER_LIBRARY_NAMESPACES)[keyof typeof USER_LIBRARY_NAMESPACES];

export interface UserLibraryChangedDetail {
	namespace: UserLibraryNamespace;
}

let notificationSuppressionDepth = 0;

export function notifyUserLibraryChanged({
	namespace,
}: UserLibraryChangedDetail): void {
	if (notificationSuppressionDepth > 0 || typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(
		new CustomEvent<UserLibraryChangedDetail>(USER_LIBRARY_CHANGED_EVENT, {
			detail: { namespace },
		})
	);
}

export function withUserLibraryNotificationsSuppressed<T>({
	action,
}: {
	action: () => T;
}): T {
	notificationSuppressionDepth++;
	try {
		return action();
	} finally {
		notificationSuppressionDepth--;
	}
}
