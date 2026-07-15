import { create } from "zustand";

export type TimelineEditMode = "select" | "roll" | "slip";

interface TimelineEditModeState {
	editMode: TimelineEditMode;
	setEditMode: ({ mode }: { mode: TimelineEditMode }) => void;
}

export const useTimelineEditModeStore = create<TimelineEditModeState>(
	(set) => ({
		editMode: "select",
		setEditMode: ({ mode }) => set({ editMode: mode }),
	})
);
