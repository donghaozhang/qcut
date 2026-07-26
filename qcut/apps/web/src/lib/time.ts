// Time-related utility functions

/** Supported timecode display styles. */
export type TimeCode = "MM:SS" | "HH:MM:SS" | "HH:MM:SS:CS" | "HH:MM:SS:FF";

/**
 * Formats time in seconds to a human-readable timecode string
 * Supports multiple timecode formats including minutes:seconds, hours:minutes:seconds,
 * and frame-accurate formats with centiseconds or frame numbers
 * @param timeInSeconds - Time value in seconds (can include fractional seconds)
 * @param format - Output format: "MM:SS", "HH:MM:SS", "HH:MM:SS:CS" (centiseconds), or "HH:MM:SS:FF" (frames)
 * @param fps - Frames per second, used for "HH:MM:SS:FF" format (default: 30)
 * @returns Formatted timecode string
 */
export const formatTimeCode = (
	timeInSeconds: number,
	format: TimeCode = "HH:MM:SS:CS",
	fps = 30
): string => {
	const hours = Math.floor(timeInSeconds / 3600);
	const minutes = Math.floor((timeInSeconds % 3600) / 60);
	const seconds = Math.floor(timeInSeconds % 60);
	const centiseconds = Math.floor((timeInSeconds % 1) * 100);
	const frames = Math.floor((timeInSeconds % 1) * fps);

	switch (format) {
		case "MM:SS":
			return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		case "HH:MM:SS":
			return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		case "HH:MM:SS:CS":
			return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${centiseconds.toString().padStart(2, "0")}`;
		case "HH:MM:SS:FF":
			return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
	}
};

/**
 * Parses a timecode string and converts it to seconds
 * Validates the format and returns null for invalid timecodes
 * @param timeCode - Timecode string to parse (e.g., "01:23:45:67")
 * @param format - Expected format: "MM:SS", "HH:MM:SS", "HH:MM:SS:CS" (centiseconds), or "HH:MM:SS:FF" (frames)
 * @param fps - Frames per second for "HH:MM:SS:FF" format (default: 30)
 * @returns Time in seconds, or null if the timecode is invalid
 */
export const parseTimeCode = (
	timeCode: string,
	format: "MM:SS" | "HH:MM:SS" | "HH:MM:SS:CS" | "HH:MM:SS:FF" = "HH:MM:SS:CS",
	fps = 30
): number | null => {
	if (!timeCode || typeof timeCode !== "string") return null;

	// Remove any extra whitespace
	const cleanTimeCode = timeCode.trim();

	try {
		switch (format) {
			case "MM:SS": {
				const parts = cleanTimeCode.split(":");
				if (parts.length !== 2) return null;
				const [minutes, seconds] = parts.map((part) => parseInt(part, 10));
				if (isNaN(minutes) || isNaN(seconds)) return null;
				if (minutes < 0 || seconds < 0 || seconds >= 60) return null;
				return minutes * 60 + seconds;
			}

			case "HH:MM:SS": {
				const parts = cleanTimeCode.split(":");
				if (parts.length !== 3) return null;
				const [hours, minutes, seconds] = parts.map((part) =>
					parseInt(part, 10)
				);
				if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
				if (
					hours < 0 ||
					minutes < 0 ||
					seconds < 0 ||
					minutes >= 60 ||
					seconds >= 60
				)
					return null;
				return hours * 3600 + minutes * 60 + seconds;
			}

			case "HH:MM:SS:CS": {
				const parts = cleanTimeCode.split(":");
				if (parts.length !== 4) return null;
				const [hours, minutes, seconds, centiseconds] = parts.map((part) =>
					parseInt(part, 10)
				);
				if (
					isNaN(hours) ||
					isNaN(minutes) ||
					isNaN(seconds) ||
					isNaN(centiseconds)
				)
					return null;
				if (
					hours < 0 ||
					minutes < 0 ||
					seconds < 0 ||
					centiseconds < 0 ||
					minutes >= 60 ||
					seconds >= 60 ||
					centiseconds >= 100
				)
					return null;
				return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
			}

			case "HH:MM:SS:FF": {
				const parts = cleanTimeCode.split(":");
				if (parts.length !== 4) return null;
				const [hours, minutes, seconds, frames] = parts.map((part) =>
					parseInt(part, 10)
				);
				if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(frames))
					return null;
				if (
					hours < 0 ||
					minutes < 0 ||
					seconds < 0 ||
					frames < 0 ||
					minutes >= 60 ||
					seconds >= 60 ||
					frames >= fps
				)
					return null;
				return hours * 3600 + minutes * 60 + seconds + frames / fps;
			}
		}
	} catch {
		return null;
	}

	return null;
};
