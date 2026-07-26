"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimeCode } from "@/lib/time";

export interface DefaultCanvasOption {
	id: string;
	label: string;
	width: number;
	height: number;
}

/** New-project resolution choices offered in Global Settings. */
export const DEFAULT_CANVAS_OPTIONS: DefaultCanvasOption[] = [
	{ id: "1080p", label: "1080P · 16:9", width: 1920, height: 1080 },
	{ id: "4k", label: "4K · 16:9", width: 3840, height: 2160 },
	{ id: "vertical", label: "1080×1920 · 9:16", width: 1080, height: 1920 },
	{ id: "square", label: "1080×1080 · 1:1", width: 1080, height: 1080 },
];

export const DEFAULT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const;

export const TIMECODE_FORMAT_OPTIONS: TimeCode[] = [
	"HH:MM:SS:FF",
	"HH:MM:SS:CS",
	"HH:MM:SS",
	"MM:SS",
];

interface AppSettingsState {
	/** Canvas preset applied to newly created projects. */
	defaultCanvasId: string;
	/** Frame rate applied to newly created projects. */
	defaultFps: number;
	/** Timecode style used by the editor header and player readouts. */
	timecodeFormat: TimeCode;
	/**
	 * When true (the historical behavior), dropping the first media element
	 * onto an empty timeline re-derives the project canvas/fps from it.
	 */
	autoCanvasFromFirstMedia: boolean;
	/** Play a chime when an export finishes or fails. */
	exportCompletionSound: boolean;

	setDefaultCanvasId: (id: string) => void;
	setDefaultFps: (fps: number) => void;
	setTimecodeFormat: (format: TimeCode) => void;
	setAutoCanvasFromFirstMedia: (enabled: boolean) => void;
	setExportCompletionSound: (enabled: boolean) => void;
}

export function getDefaultCanvasOption(id: string): DefaultCanvasOption {
	return (
		DEFAULT_CANVAS_OPTIONS.find((option) => option.id === id) ??
		DEFAULT_CANVAS_OPTIONS[0]
	);
}

export const useAppSettingsStore = create<AppSettingsState>()(
	persist(
		(set) => ({
			defaultCanvasId: "1080p",
			defaultFps: 30,
			timecodeFormat: "HH:MM:SS:FF",
			autoCanvasFromFirstMedia: true,
			exportCompletionSound: false,

			setDefaultCanvasId: (id) => {
				set({ defaultCanvasId: id });
			},
			setDefaultFps: (fps) => {
				set({ defaultFps: fps });
			},
			setTimecodeFormat: (format) => {
				set({ timecodeFormat: format });
			},
			setAutoCanvasFromFirstMedia: (enabled) => {
				set({ autoCanvasFromFirstMedia: enabled });
			},
			setExportCompletionSound: (enabled) => {
				set({ exportCompletionSound: enabled });
			},
		}),
		{
			name: "qcut-app-settings",
			version: 1,
		}
	)
);
